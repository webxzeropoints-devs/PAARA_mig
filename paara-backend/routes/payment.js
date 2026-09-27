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
const { buildLoyaltyReceipt } = require('../utils/loyaltyReceipt');

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

async function hasLoyaltyStamp(orderId) {
  const result = await db.query(
    'SELECT EXISTS (SELECT 1 FROM loyalty_stamps WHERE order_id = $1) AS awarded',
    [orderId]
  );
  return Boolean(result.rows[0]?.awarded);
}

async function sendPaidInvoice(orderId, loyaltyResult) {
  const { rows: orderRows } = await db.query(`
    SELECT o.*, c.email, c.name, c.phone
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

  const loyaltyReceipt = buildLoyaltyReceipt(loyaltyResult);
  const pdf = await createInvoicePdf(order, items, address, loyaltyReceipt);

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

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

  const gstAmount = Number(order.gst_amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const discountAmount = Number(order.discount_amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatMoney = (value) => `INR ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
  const htmlItems = items.map((item) => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eee7df;color:#30251f">${escapeHtml(item.product_name)}<br><span style="font-size:12px;color:#8b6b43">Unit ${formatMoney(item.unit_price)}</span></td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee7df;text-align:center;color:#30251f">${Number(item.quantity) || 0}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee7df;text-align:right;color:#30251f">${formatMoney(item.line_total)}</td>
    </tr>`).join('');
  const htmlAddress = addressText.split(', ').map(escapeHtml).join('<br>');
  const loyaltyText = loyaltyReceipt
    ? `\n\nLOYALTY\n-------\n${loyaltyReceipt.stampMessage}\n${loyaltyReceipt.progressMessage}\nCurrent card progress: ${loyaltyReceipt.stampCount} of ${loyaltyReceipt.cardSize}\nTotal stamps earned: ${loyaltyReceipt.totalStamps}\nQualifying order threshold: INR ${Number(loyaltyReceipt.threshold).toLocaleString('en-IN')}\n${loyaltyReceipt.rewardProductName ? `Current reward: ${loyaltyReceipt.rewardProductName}\n` : ''}Reward status: ${loyaltyReceipt.rewardStatus}\n`
    : '';
  const htmlLoyalty = loyaltyReceipt ? `
    <section style="margin-top:24px;padding:18px;background:#fbf7f0;border:1px solid #eadfce;border-radius:8px">
      <h2 style="margin:0 0 12px;font-size:17px;color:#3d2b24">Your loyalty progress</h2>
      <p style="margin:5px 0;color:#30251f"><strong>${escapeHtml(loyaltyReceipt.stampMessage)}</strong></p>
      <p style="margin:5px 0;color:#30251f">${escapeHtml(loyaltyReceipt.progressMessage)}</p>
      <p style="margin:5px 0;color:#30251f">Current card: <strong>${loyaltyReceipt.stampCount} of ${loyaltyReceipt.cardSize}</strong> stamps</p>
      <p style="margin:5px 0;color:#30251f">Total stamps earned: ${loyaltyReceipt.totalStamps}</p>
      <p style="margin:5px 0;color:#30251f">Qualifying order threshold: ${formatMoney(loyaltyReceipt.threshold)}</p>
      ${loyaltyReceipt.rewardProductName ? `<p style="margin:5px 0;color:#30251f">Current reward: ${escapeHtml(loyaltyReceipt.rewardProductName)}</p>` : ''}
      <p style="margin:5px 0;color:#8b6b43"><strong>${escapeHtml(loyaltyReceipt.rewardStatus)}</strong></p>
    </section>` : '';
  const itemText = items
    .map((item) => `${item.product_name} | Qty ${item.quantity} | Unit ${formatMoney(item.unit_price)} | ${formatMoney(item.line_total)}`)
    .join('\n');

  await trySendEmail(
    {
      to: order.email,
      subject: `Order confirmed — ${order.order_number || `Order ${order.id}`}`,
      text: `Hi ${order.name || 'Customer'},

Your order is confirmed. Thank you for choosing Paara Jewellery.

ORDER CONFIRMATION
Order: ${order.order_number || order.id}
Date: ${orderDate}
Payment: ${order.payment_method || 'PayU'} (${order.payment_status || 'paid'})
Payment reference: ${order.payment_reference || 'Not available'}

CUSTOMER AND SHIPPING
${order.name || 'Customer'}${order.email ? ` | ${order.email}` : ''}${order.phone ? ` | ${order.phone}` : ''}
${addressText}

ORDERED PRODUCTS
${itemText}

ORDER SUMMARY
Subtotal: INR ${subtotal}
Discount: INR ${discountAmount}
${Number(order.gst_amount) > 0 ? `GST: INR ${gstAmount}\n` : ''}Delivery: INR ${shipping}
Total paid: INR ${total}${loyaltyText}
The official invoice is attached as a PDF. You can also view your order from your Paara Jewellery account.

Warm regards,
Paara Jewellery
https://paarajewellery.in`,
      html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f5f1;font-family:Arial,Helvetica,sans-serif;color:#30251f">
  <div style="max-width:640px;margin:0 auto;padding:24px 14px">
    <main style="background:#fff;padding:28px 24px;border:1px solid #eee7df;border-radius:10px">
      <p style="margin:0;color:#8b6b43;font-size:12px;letter-spacing:2px;font-weight:bold">PAARA JEWELLERY</p>
      <h1 style="margin:10px 0 6px;font-size:24px;color:#3d2b24">Order confirmed</h1>
      <p style="margin:0 0 22px;line-height:1.6">Hi ${escapeHtml(order.name || 'Customer')}, your payment has been received and your order is confirmed.</p>
      <div style="padding:14px;background:#fbf7f0;border-radius:6px;line-height:1.7">
        <strong>Order ${escapeHtml(order.order_number || order.id)}</strong><br>
        ${escapeHtml(orderDate)}<br>
        ${escapeHtml(order.payment_method || 'PayU')} · ${escapeHtml(order.payment_status || 'paid')}
        ${order.payment_reference ? `<br>Payment reference: ${escapeHtml(order.payment_reference)}` : ''}
      </div>
      <h2 style="margin:24px 0 8px;font-size:16px;color:#3d2b24">Customer and shipping details</h2>
      <p style="margin:0;line-height:1.6">${escapeHtml(order.name || 'Customer')}${order.email ? `<br>${escapeHtml(order.email)}` : ''}${order.phone ? `<br>${escapeHtml(order.phone)}` : ''}<br>${htmlAddress}</p>
      <h2 style="margin:24px 0 8px;font-size:16px;color:#3d2b24">Ordered products</h2>
      <div style="overflow-x:auto">
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr><th style="padding:8px;text-align:left;color:#8b6b43">Product</th><th style="padding:8px;text-align:center;color:#8b6b43">Qty</th><th style="padding:8px;text-align:right;color:#8b6b43">Amount</th></tr></thead>
          <tbody>${htmlItems}</tbody>
        </table>
      </div>
      <h2 style="margin:24px 0 8px;font-size:16px;color:#3d2b24">Order summary</h2>
      <table role="presentation" style="width:100%;font-size:14px;line-height:1.8">
        <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(order.subtotal)}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">${formatMoney(order.discount_amount)}</td></tr>
        ${Number(order.gst_amount) > 0 ? `<tr><td>GST</td><td style="text-align:right">${formatMoney(order.gst_amount)}</td></tr>` : ''}
        <tr><td>Delivery</td><td style="text-align:right">${formatMoney(order.shipping_amount)}</td></tr>
        <tr><td style="padding-top:8px;border-top:1px solid #eadfce;font-weight:bold">Total paid</td><td style="padding-top:8px;border-top:1px solid #eadfce;text-align:right;font-weight:bold">${formatMoney(order.total_amount)}</td></tr>
      </table>
      ${htmlLoyalty}
      <p style="margin:24px 0 0;line-height:1.6">Your official invoice is attached as a PDF. You can also view your order from your Paara Jewellery account.</p>
      <p style="margin:20px 0 0;color:#8b6b43">Warm regards,<br>Paara Jewellery</p>
    </main>
  </div>
</body></html>`,
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
      loyaltyStampAwarded: await hasLoyaltyStamp(order.id),
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

    void sendPaidInvoice(order.id, loyalty)
      .then(() => {
        console.log('[ORDER_CONFIRMATION_EMAIL_SENT]', {
          orderId: order.id,
        });
      })
      .catch((error) => {
        console.error('[INVOICE_EMAIL_FAILED]', {
          orderId: order.id,
          message: maskSensitiveText(error.message),
          name: error.name,
        });
      });

    return {
      orderId: order.id,
      paid: true,
      newlyPaid: true,
      loyalty,
      loyaltyStampAwarded: Boolean(loyalty?.order?.awarded),
    };
  }

  return {
    orderId: order.id,
    paid: true,
    newlyPaid: false,
    loyaltyStampAwarded: await hasLoyaltyStamp(order.id),
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

    if (result.loyaltyStampAwarded) {
      redirectUrl.searchParams.set('loyalty_stamp', 'earned');
    }

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
