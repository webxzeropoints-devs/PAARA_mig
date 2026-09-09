const express = require('express');
const db = require('../db/database.pg');
const { requireAuth } = require('../middleware/auth');
const { calculateGST, round2 } = require('../utils/pricing');
const { calculateShipping } = require('../utils/shipping');
const { createInvoicePdf } = require('../utils/invoice');
const { formatOrderNumber } = require('../utils/orderNumber');

const router = express.Router();

const ORDER_TRACKING_STATUSES = ['Order Confirmed', 'Packed', 'Shipped', 'Delivered'];

const normalizeOrderStatus = (status) => {
  const normalized = String(status || '').trim();
  if (ORDER_TRACKING_STATUSES.includes(normalized)) return normalized;
  if (['pending', 'paid', 'failed', 'cancelled'].includes(normalized)) return 'Order Confirmed';
  if (normalized === 'shipped') return 'Shipped';
  if (normalized === 'delivered') return 'Delivered';
  return 'Order Confirmed';
};

const getOrderStatusIndex = (status) => ORDER_TRACKING_STATUSES.indexOf(normalizeOrderStatus(status));

async function buildLineItems(items, client = db) {
  const lineItems = [];
  let subtotal = 0;

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Each item quantity must be a positive integer.');
    }

    const { rows } = await client.query(
      'SELECT * FROM products WHERE id = $1 AND is_active = TRUE',
      [item.product_id]
    );

    const product = rows[0];

    if (!product) throw new Error(`Product ${item.product_id} not found.`);
    if (product.stock < item.quantity) {
      throw new Error(`"${product.name}" only has ${product.stock} in stock.`);
    }

    const lineTotal = round2(product.price * item.quantity);
    subtotal = round2(subtotal + lineTotal);

    const weightKg = Number(product.weight_kg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new Error(`Product "${product.name}" is missing a valid weight.`);
    }

    lineItems.push({
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity: item.quantity,
      line_total: lineTotal,
      weight_kg: weightKg
    });
  }

  return { lineItems, subtotal };
}

async function createOrder({ customerId, items, addressId, paymentMethod = 'payu' }) {
  const normalizedPaymentMethod = String(paymentMethod).trim().toLowerCase();

  const paymentStatus = 'unpaid';

  if (normalizedPaymentMethod !== 'payu') {
    throw new Error('PayU is the only available payment method.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart items are required.');
  }

  const { rows: addressRows } = await db.query(
    'SELECT * FROM addresses WHERE id = $1 AND customer_id = $2',
    [addressId, customerId]
  );
  const address = addressRows[0];

  if (!address) throw new Error('Invalid address.');

  const { rows: customerRows } = await db.query(
    'SELECT name, email, phone FROM customers WHERE id = $1',
    [customerId]
  );
  const customer = customerRows[0];

  if (!customer) throw new Error('Customer account not found.');

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { lineItems, subtotal } = await buildLineItems(items, client);
    const { gstAmount } = calculateGST(subtotal);

    const totalWeightKg = lineItems.reduce(
      (sum, item) => sum + item.weight_kg * item.quantity,
      0
    );

    const shipping = calculateShipping({
      city: address.city,
      state: address.state,
      paymentMethod: normalizedPaymentMethod,
      totalWeightKg
    });

    const totalAmount = round2(subtotal + gstAmount + shipping.amount);

    const { rows: orderRows } = await client.query(`
      INSERT INTO orders
        (customer_id, address_id, subtotal, gst_amount, shipping_amount,
         total_amount, status, payment_method, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      customerId,
      addressId,
      subtotal,
      gstAmount,
      shipping.amount,
      totalAmount,
      'Order Confirmed',
      normalizedPaymentMethod,
      paymentStatus
    ]);

    const orderId = orderRows[0].id;
    const orderNumber = formatOrderNumber(new Date().toISOString(), orderId);

    await client.query(
      'UPDATE orders SET order_number = $1 WHERE id = $2',
      [orderNumber, orderId]
    );

    for (const lineItem of lineItems) {
      await client.query(`
        INSERT INTO order_items
          (order_id, product_id, product_name, unit_price, quantity, line_total)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        orderId,
        lineItem.product_id,
        lineItem.product_name,
        lineItem.unit_price,
        lineItem.quantity,
        lineItem.line_total
      ]);
    }

    await client.query(`
      INSERT INTO customer_order_details
        (order_id, customer_id, full_name, email, phone, shipping_line1,
         shipping_line2, shipping_city, shipping_state, shipping_pincode,
         shipping_country, submitted_fields)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      orderId,
      customerId,
      customer.name,
      customer.email,
      customer.phone || null,
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.pincode,
      'India',
      JSON.stringify({
        items,
        address_id: addressId,
        shipping_city: address.city
      })
    ]);

    await client.query('COMMIT');

    return {
      orderId,
      orderNumber,
      paymentMethod: normalizedPaymentMethod,
      paymentStatus,
      subtotal,
      gstAmount,
      shipping,
      totalAmount,
      lineItems
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.post('/', requireAuth, async (req, res) => {
  try {
    const requestedPaymentMethod = String(req.body?.payment_method || 'payu').trim().toLowerCase();
    if (requestedPaymentMethod !== 'payu') {
      return res.status(400).json({
        error: 'PayU is the only available payment method.',
      });
    }

    const order = await createOrder({
      customerId: req.customer.id,
      items: req.body?.items,
      addressId: req.body?.address_id,
      paymentMethod: requestedPaymentMethod
    });

    await db.persistAfterWrite();

    return res.status(201).json({
      order_id: order.orderId,
      order_number: order.orderNumber,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      subtotal: order.subtotal,
      gst_amount: order.gstAmount,
      shipping_amount: order.shipping.amount,
      shipping_method: order.shipping.method,
      total_amount: order.totalAmount,
      items: order.lineItems
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/proforma', requireAuth, async (req, res) => {
  const {
    items,
    address_id,
    payment_method: requestedPaymentMethod = 'payu'
  } = req.body;

  const paymentMethod = String(requestedPaymentMethod).trim().toLowerCase();

  if (paymentMethod !== 'payu') {
    return res.status(400).json({ error: 'PayU is the only available payment method.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart items are required.' });
  }

  let lineItems;
  let subtotal;

  try {
    ({ lineItems, subtotal } = await buildLineItems(items));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const { gstAmount } = calculateGST(subtotal);

    const { rows: customerRows } = await db.query(
      'SELECT name FROM customers WHERE id = $1',
      [req.customer.id]
    );
    const customer = customerRows[0];

    const address = address_id
      ? (await db.query(
          'SELECT * FROM addresses WHERE id = $1 AND customer_id = $2',
          [address_id, req.customer.id]
        )).rows[0]
      : null;

    if (!address) {
      return res.status(400).json({
        error: 'A valid delivery address is required for the proforma invoice.'
      });
    }

    const totalWeightKg = lineItems.reduce(
      (sum, item) => sum + item.weight_kg * item.quantity,
      0
    );

    const shipping = calculateShipping({
      city: address.city,
      state: address.state,
      paymentMethod,
      totalWeightKg
    });

    const pdf = await createInvoicePdf({
      id: 'PROFORMA',
      created_at: new Date().toISOString(),
      status: 'proforma',
      payment_status: 'unpaid',
      payment_method: paymentMethod,
      customer_name: customer?.name,
      subtotal,
      gst_amount: gstAmount,
      discount_amount: 0,
      shipping_amount: shipping.amount,
      total_amount: round2(subtotal + gstAmount + shipping.amount)
    }, lineItems, address);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', 'inline; filename="paara-proforma-invoice.pdf"');

    return res.end(pdf);
  } catch (error) {
    console.error('[PROFORMA_GENERATION_FAILED]', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      customerId: req.customer?.id,
      itemCount: Array.isArray(items) ? items.length : 0
    });

    return res.status(500).json({
      error: 'Could not generate proforma invoice.'
    });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: orders } = await db.query(
      "SELECT * FROM orders WHERE customer_id = $1 AND (status = 'Delivered' OR status = 'delivered') ORDER BY created_at DESC",
      [req.customer.id]
    );

    for (const order of orders) {
      order.order_id = order.id;
      order.order_number =
        order.order_number || formatOrderNumber(order.created_at, order.id);

      const { rows: items } = await db.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC',
        [order.id]
      );

      order.items = items;
    }

    res.json(orders);
  } catch (error) {
    console.error('[ORDERS_HISTORY_FAILED]', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.customer.id]
    );

    const order = rows[0];

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const { rows: items } = await db.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );

    order.items = items;
    order.order_number =
      order.order_number || formatOrderNumber(order.created_at, order.id);

    res.json(order);
  } catch (error) {
    console.error('[ORDER_DETAIL_FAILED]', error);
    res.status(500).json({ error: 'Failed to load order.' });
  }
});

router.get('/:id/status', async (req, res) => {
  try {
    const requestedOrderNumber = String(req.params.id || '').trim();
    const orderId = Number.parseInt(requestedOrderNumber, 10);
    const isNumericOrderId = /^\d+$/.test(requestedOrderNumber) && orderId > 0;

    if (!isNumericOrderId && !/^ORD-\d{8}-\d+$/.test(requestedOrderNumber)) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const { rows } = isNumericOrderId
      ? await db.query(
          'SELECT id, order_number, created_at, customer_id, status FROM orders WHERE id = $1',
          [orderId]
        )
      : await db.query(
          'SELECT id, order_number, created_at, customer_id, status FROM orders WHERE order_number = $1',
          [requestedOrderNumber]
        );

    const order = rows[0];

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const submittedEmail = String(req.query.email || '').trim().toLowerCase();

    if (!submittedEmail) {
      return res.status(400).json({
        error: 'Order ID and email are required.'
      });
    }

    const { rows: customerRows } = await db.query(
      'SELECT email FROM customers WHERE id = $1',
      [order.customer_id]
    );

    const customer = customerRows[0];

    if (!customer || !customer.email || customer.email.toLowerCase() !== submittedEmail) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const status = normalizeOrderStatus(order.status);

    const payload = {
      order_id: order.id,
      order_number: order.order_number || formatOrderNumber(order.created_at, order.id),
      status,
      stage_index: getOrderStatusIndex(status),
      stages: ORDER_TRACKING_STATUSES
    };

    if (status === 'Shipped') {
      payload.message = 'Your order will be delivered in 7 working days.';
    }

    res.json(payload);
  } catch (error) {
    console.error('[ORDER_STATUS_FAILED]', error);
    res.status(500).json({ error: 'Failed to load order status.' });
  }
});

router.get('/:id/invoice', requireAuth, async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const { rows } = await db.query(
      'SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND o.customer_id = $2',
      [orderId, req.customer.id]
    );

    const order = rows[0];

    if (!order) {
      console.warn('[INVOICE_NOT_FOUND]', {
        orderId,
        customerId: req.customer.id
      });
      return res.status(404).json({
        error: 'Order not found for this account.'
      });
    }

    const { rows: items } = await db.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC',
      [order.id]
    );

    const { rows: addressRows } = await db.query(
      'SELECT * FROM addresses WHERE id = $1 AND customer_id = $2',
      [order.address_id, req.customer.id]
    );

    const address = addressRows[0];

    const invoiceName =
      `paara-invoice-${order.order_number || formatOrderNumber(order.created_at, order.id)}.pdf`;

    const pdf = await createInvoicePdf(order, items, address);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceName}"`);

    return res.end(pdf);
  } catch (error) {
    console.error('[INVOICE_GENERATION_FAILED]', {
      orderId: req.params.id,
      customerId: req.customer.id,
      message: error.message,
      name: error.name,
      stack: error.stack
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Could not generate invoice.'
      });
    }
  }
});

module.exports = router;
module.exports.createOrder = createOrder;
