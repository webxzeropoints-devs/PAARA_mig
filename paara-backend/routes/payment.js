const express = require('express');
const db = require('../db/database.pg');
const { requireAuth } = require('../middleware/auth');
const { getPaymentProvider } = require('../utils/paymentProviders');
const {
  generateResponseHash,
  hashesMatch,
  getPayuConfig,
  verifyPayment,
} = require('../utils/payu');
const { trySendEmail } = require('../utils/email');
const { createInvoicePdf } = require('../utils/invoice');
const { maskSensitiveText } = require('../utils/validate');
const { createOrder } = require('./orders');
const { processLoyaltyOrder } = require('../services/loyalty');

const router = express.Router();

async function markOrderPaid(orderId, paymentReference) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(`
      UPDATE orders
      SET status = 'Order Confirmed',
          payment_status = 'paid',
          payment_method = 'payu',
          payment_reference = $1,
          payment_verified_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
          payment_rejected_at = NULL
      WHERE id = $2
        AND payment_status <> 'paid'
      RETURNING id
    `, [paymentReference, orderId]);

    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );
    for (const item of items) {
      const stockUpdate = await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id',
        [item.quantity, item.product_id]
      );
      if (stockUpdate.rowCount === 0) {
        throw new Error('Insufficient stock while confirming payment.');
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function sendPaidInvoice(orderId) {
  const { rows: orderRows } = await db.query(`
    SELECT o.*, c.email, c.name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = $1
  `, [orderId]);
  const order = orderRows[0];
  if (!order) return;

  const { rows: items } = await db.query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC',
    [orderId]
  );
  const { rows: addressRows } = await db.query(
    'SELECT * FROM addresses WHERE id = $1 AND customer_id = $2',
    [order.address_id, order.customer_id]
  );
  const address = addressRows[0];
  const pdf = await createInvoicePdf(order, items, address);
  const itemLines = items
    .map((item) => `${item.product_name} x ${item.quantity} @ INR ${item.unit_price} = INR ${item.line_total}`)
    .join('\n');
  const addressText = address
    ? `${address.line1}, ${address.city}, ${address.state} - ${address.pincode}`
    : 'Not available';

  await trySendEmail({
    to: order.email,
    subject: `Paara invoice for order ${order.order_number}`,
    text: `Order ID: ${order.order_number}
Payment Reference: ${order.payment_reference}

Items:
${itemLines}

Taxes: Included in product prices
Shipping: INR ${order.shipping_amount}
Total: INR ${order.total_amount}
Shipping address: ${addressText}`,
    attachments: [{
      filename: `paara-invoice-${order.order_number}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    }],
  }, `invoice for order ${order.order_number}`);
}

async function processPayuCallback(payload, expectedStatus) {
  const config = getPayuConfig();
  const txnid = String(payload.txnid || '').trim();
  if (!txnid || !payload.hash || !hashesMatch(
    generateResponseHash(payload, config.salt),
    payload.hash
  )) {
    throw new Error('Invalid PayU response hash.');
  }

  const { rows } = await db.query(
    'SELECT * FROM orders WHERE payment_reference = $1',
    [txnid]
  );
  const order = rows[0];
  if (!order) throw new Error('PayU transaction is not linked to an order.');
  if (Number(payload.amount).toFixed(2) !== Number(order.total_amount).toFixed(2)) {
    throw new Error('PayU amount mismatch.');
  }

  if (String(payload.status || '').toLowerCase() !== expectedStatus) {
    await db.query(
      "UPDATE orders SET status = 'failed', payment_status = 'failed', payment_method = 'payu' WHERE id = $1 AND payment_status <> 'paid'",
      [order.id]
    );
    return { orderId: order.id, paid: false, status: 'failed' };
  }

  const verification = await verifyPayment(txnid);
  const details = verification?.transaction_details?.[txnid] || verification?.transaction_details?.[String(txnid)];
  if (!details || String(details.status || '').toLowerCase() !== 'success') {
    throw new Error('PayU server-side verification did not confirm payment.');
  }
  if (Number(details.amt || details.amount).toFixed(2) !== Number(order.total_amount).toFixed(2)) {
    throw new Error('PayU verification amount mismatch.');
  }

  const reference = String(details.mihpayid || payload.mihpayid || txnid);
  const newlyPaid = await markOrderPaid(order.id, reference);
  if (newlyPaid) {
    const loyalty = await processLoyaltyOrder(order.id, order.customer_id);
    sendPaidInvoice(order.id).catch((error) => {
      console.error('[INVOICE_EMAIL_FAILED]', {
        message: maskSensitiveText(error.message),
        name: error.name,
      });
    });
    return { orderId: order.id, paid: true, newlyPaid: true, loyalty };
  }
  return { orderId: order.id, paid: true, newlyPaid: false };
}

router.get('/config', requireAuth, (req, res) => {
  res.json({
    provider: 'payu',
    environment: 'test',
    payment_methods: ['payu'],
    hosted_checkout: true,
  });
});

router.post(['/create', '/initiate'], requireAuth, async (req, res) => {
  try {
    const orderId = Number.parseInt(String(req.body?.order_id || ''), 10);
    const { rows: orders } = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
      [orderId, req.customer.id]
    );
    const order = orders[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_status === 'paid') return res.status(400).json({ error: 'This order has already been paid.' });

    const { rows: customers } = await db.query(
      'SELECT name, email, phone FROM customers WHERE id = $1',
      [req.customer.id]
    );
    const provider = getPaymentProvider('payu');
    const payload = provider.create({
      order,
      customer: customers[0],
      txnid: order.payment_reference && String(order.payment_reference).startsWith('PAARA-')
        ? order.payment_reference
        : undefined,
    });
    await db.query(
      "UPDATE orders SET payment_method = 'payu', payment_reference = $1, payment_status = 'unpaid' WHERE id = $2 AND payment_status <> 'paid'",
      [payload.txnid, order.id]
    );
    await db.persistAfterWrite();
    return res.json(payload);
  } catch (error) {
    console.error('[PAYU_INITIATE_FAILED]', { message: maskSensitiveText(error.message), name: error.name });
    return res.status(400).json({ error: error.message || 'Could not initiate PayU payment.' });
  }
});

router.post('/verify', requireAuth, async (req, res) => {
  try {
    const result = await processPayuCallback(req.body || {}, 'success');
    return res.json({ success: result.paid, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

const payuCallback = (expectedStatus) => async (req, res) => {
  try {
    const result = await processPayuCallback(req.body || {}, expectedStatus);
    return res.json({ received: true, ...result });
  } catch (error) {
    console.error('[PAYU_CALLBACK_FAILED]', { message: maskSensitiveText(error.message), name: error.name });
    return res.status(400).json({ received: false, error: error.message });
  }
};

router.post('/payu/success', payuCallback('success'));
router.post('/payu/failure', payuCallback('failure'));
router.post('/webhook', payuCallback('success'));

module.exports = router;
