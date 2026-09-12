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

  if (!order || !order.email) {
    console.error('[ORDER_CONFIRMATION_EMAIL_SKIPPED]', {
      orderId,
      reason: !order
        ? 'Order not found.'
        : 'Customer email address is missing.',
    });
    return;
  }

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

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  const itemLines = items
    .map((item, index) => {
      const unitPrice = Number(item.unit_price || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const lineTotal = Number(item.line_total || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      return [
        `${index + 1}. ${item.product_name}`,
        `   Quantity: ${item.quantity}`,
        `   Unit Price: INR ${unitPrice}`,
        `   Item Total: INR ${lineTotal}`,
      ].join('\n');
    })
    .join('\n\n');

  const addressText = address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.pincode,
        'India',
      ]
        .filter(Boolean)
        .join(', ')
    : 'Not available';

  const subtotal = Number(order.subtotal || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const shipping = Number(order.shipping_amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const total = Number(order.total_amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  await trySendEmail(
    {
      to: order.email,
      subject: `Order confirmed — ${order.order_number || `Order ${order.id}`}`,
      text: `Hi ${order.name || 'Customer'},

Thank you for shopping with Paara Jewellery.

Your payment has been successfully received and your order has been confirmed.

ORDER DETAILS
-------------
Order ID: ${order.order_number || order.id}
Order Date: ${orderDate}
Payment Method: ${order.payment_method || 'PayU'}
Payment Status: ${order.payment_status || 'paid'}
Payment Reference: ${order.payment_reference || 'Not available'}

ITEMS PURCHASED
---------------
${itemLines}

ORDER TOTAL
-----------
Subtotal: INR ${subtotal}
Delivery Charge: INR ${shipping}
Total Paid: INR ${total}

DELIVERY ADDRESS
----------------
${addressText}

Your official invoice is attached to this email as a PDF.

You can also view your order from your Paara Jewellery account.

Thank you for choosing Paara Jewellery.

Warm regards,
Paara Jewellery
https://paarajewellery.in
`,
      attachments: [
        {
          filename: `paara-invoice-${order.order_number || order.id}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    },
    `order confirmation email for ${order.order_number || order.id}`
  );
}

async function processPayuCallback(payload, expectedStatus) {
  const config = getPayuConfig();
  const txnid = String(payload.txnid || '').trim();

  const expectedHash = generateResponseHash(payload, config.salt);
  const receivedHash = String(payload.hash || '').trim();

  if (!txnid || !receivedHash || !hashesMatch(expectedHash, receivedHash)) {
    console.error('[PAYU_RESPONSE_HASH_MISMATCH]', {
      txnid: txnid || null,
      status: payload.status || null,
      amount: payload.amount || null,
      keyMatches:
        String(payload.key || '').trim() ===
        String(config.key || '').trim(),
      udf1: payload.udf1 || '',
      udf2: payload.udf2 || '',
      udf3: payload.udf3 || '',
      udf4: payload.udf4 || '',
      udf5: payload.udf5 || '',
      hasAdditionalCharges:
        Object.prototype.hasOwnProperty.call(payload, 'additional_charges'),
      hasSplitInfo:
        Object.prototype.hasOwnProperty.call(payload, 'splitInfo'),
      expectedHashPrefix: expectedHash.slice(0, 12),
      receivedHashPrefix: receivedHash.slice(0, 12),
    });

    throw new Error('Invalid PayU response hash.');
  }

  const udfOrderId = Number.parseInt(String(payload.udf1 || '').trim(), 10);
  
  const { rows } = await db.query(
    `
      SELECT *
      FROM orders
      WHERE payment_reference = $1
         OR ($2 > 0 AND id = $2)
      ORDER BY
        CASE WHEN payment_reference = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [txnid, udfOrderId]
  );
  
  const order = rows[0];
  
  if (!order) {
    throw new Error('PayU transaction is not linked to an order.');
  }
  
  if (
    Number(payload.amount).toFixed(2) !==
    Number(order.total_amount).toFixed(2)
  ) {
    throw new Error('PayU amount mismatch.');
  }
  
  if (
    String(order.payment_status || '').trim().toLowerCase() === 'paid'
  ) {
    return {
      orderId: order.id,
      paid: true,
      newlyPaid: false,
    };
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
    let loyalty = null;

    try {
      loyalty = await processLoyaltyOrder(
        order.id,
        order.customer_id
      );
    } catch (error) {
      console.error('[LOYALTY_PROCESSING_FAILED]', {
        orderId: order.id,
        message: maskSensitiveText(error.message),
        name: error.name,
      });
    }

    try {
      await sendPaidInvoice(order.id);

      console.log('[ORDER_CONFIRMATION_EMAIL_SENT]', {
        orderId: order.id,
      });
    } catch (error) {
      console.error('[INVOICE_EMAIL_FAILED]', {
        orderId: order.id,
        message: maskSensitiveText(error.message),
        name: error.name,
      });
    }

    return {
      orderId: order.id,
      paid: true,
      newlyPaid: true,
      loyalty,
    };
  }

  return {
    orderId: order.id,
    paid: true,
    newlyPaid: false,
  };
} // closes processPayuCallback

router.get('/config', requireAuth, (req, res) => {
  const config = getPayuConfig();
  res.json({
    provider: 'payu',
    environment: config.environment,
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

const getFrontendOrigin = () => {
  const configured = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  return configured ? configured.replace(/\/$/, '') : null;
};

const payuCallback = (expectedStatus) => async (req, res) => {
  let orderId = null;

  try {
    const payload = req.body || {};

    const udfOrderId = Number.parseInt(
      String(payload.udf1 || '').trim(),
      10
    );

    if (Number.isInteger(udfOrderId) && udfOrderId > 0) {
      orderId = udfOrderId;
    }

    const result = await processPayuCallback(
      payload,
      expectedStatus
    );

    orderId = result.orderId || orderId;

    const frontendOrigin = getFrontendOrigin();

    if (!frontendOrigin) {
      return res.json({
        received: true,
        ...result,
      });
    }

    const redirectUrl = new URL(
      '/order-confirmation',
      frontendOrigin
    );

    redirectUrl.searchParams.set(
      'order_id',
      String(orderId)
    );

    redirectUrl.searchParams.set(
      'payment',
      result.paid ? 'success' : 'failure'
    );

    return res.redirect(
      303,
      redirectUrl.toString()
    );
  } catch (error) {
    console.error('[PAYU_CALLBACK_FAILED]', {
      message: maskSensitiveText(error.message),
      name: error.name,
      orderId,
    });

    const frontendOrigin = getFrontendOrigin();

    if (frontendOrigin) {
      const redirectUrl = new URL(
        '/order-confirmation',
        frontendOrigin
      );

      /*
       * PayU sends our order ID in udf1.
       * Use it as the primary recovery mechanism.
       */
      const payloadOrderId = Number.parseInt(
        String(req.body?.udf1 || '').trim(),
        10
      );

      if (
        !orderId &&
        Number.isInteger(payloadOrderId) &&
        payloadOrderId > 0
      ) {
        orderId = payloadOrderId;
      }

      /*
       * If udf1 is unavailable, try the transaction ID
       * as a secondary fallback.
       */
      if (!orderId) {
        const txnid = String(
          req.body?.txnid || ''
        ).trim();

        if (txnid) {
          const orderResult = await db.query(
            `
              SELECT id
              FROM orders
              WHERE payment_reference = $1
              LIMIT 1
            `,
            [txnid]
          );

          orderId = orderResult.rows[0]?.id || null;
        }
      }

      if (orderId) {
        redirectUrl.searchParams.set(
          'order_id',
          String(orderId)
        );
      }

      redirectUrl.searchParams.set(
        'payment',
        'failure'
      );

      return res.redirect(
        303,
        redirectUrl.toString()
      );
    }

    return res.status(400).json({
      received: false,
      error: error.message,
    });
  }
};
  


const payuWebhook = async (req, res) => {
  try {
    const result = await processPayuCallback(req.body || {}, 'success');
    return res.json({ received: true, ...result });
  } catch (error) {
    console.error('[PAYU_WEBHOOK_FAILED]', { message: maskSensitiveText(error.message), name: error.name });
    return res.status(400).json({ received: false, error: error.message });
  }
};

router.post('/payu/success', payuCallback('success'));
router.post('/payu/failure', payuCallback('failure'));
router.post('/webhook', payuWebhook);

module.exports = router;
