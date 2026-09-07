const crypto = require('crypto');

const PAYU_TEST_PAYMENT_URL = 'https://test.payu.in/_payment';
const PAYU_TEST_VERIFY_URL = 'https://test.payu.in/merchant/postservice.php?form=2';

const getPayuConfig = () => {
  const key = String(process.env.PAYU_MERCHANT_KEY || '').trim();
  const salt = String(process.env.PAYU_MERCHANT_SALT || '').trim();
  const environment = String(process.env.PAYU_ENV || 'test').trim().toLowerCase();
  const successUrl = String(process.env.PAYU_SUCCESS_URL || '').trim();
  const failureUrl = String(process.env.PAYU_FAILURE_URL || '').trim();

  if (!key || !salt || !successUrl || !failureUrl) {
    throw new Error('PayU is not configured.');
  }
  if (environment !== 'test') {
    throw new Error('Only the PayU test environment is enabled.');
  }

  return { key, salt, successUrl, failureUrl };
};

const sha512 = (value) => crypto.createHash('sha512').update(value, 'utf8').digest('hex');

const generateRequestHash = ({ key, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }, salt) => (
  sha512([key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', salt].join('|'))
);

const generateVerifyHash = ({ key, command, txnid }, salt) => sha512([key, command, txnid, salt].join('|'));

const generateResponseHash = (payload, salt) => {
  const values = [
    salt,
    payload.status || '',
    '',
    '',
    '',
    '',
    payload.udf5 || '',
    payload.udf4 || '',
    payload.udf3 || '',
    payload.udf2 || '',
    payload.udf1 || '',
    payload.email || '',
    payload.firstname || '',
    payload.productinfo || '',
    payload.amount || '',
    payload.txnid || '',
    payload.key || '',
  ];
  return sha512(`${payload.additional_charges ? `${payload.additional_charges}|` : ''}${values.join('|')}`);
};

const hashesMatch = (expected, received) => {
  const expectedBuffer = Buffer.from(String(expected || '').toLowerCase());
  const receivedBuffer = Buffer.from(String(received || '').toLowerCase());
  return expectedBuffer.length > 0
    && expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const createTransactionId = (orderId) => `PAARA-${orderId}-${crypto.randomBytes(8).toString('hex')}`;

const createCheckout = ({ order, customer, txnid: existingTxnid }) => {
  const config = getPayuConfig();
  const txnid = existingTxnid || createTransactionId(order.id);
  const amount = Number(order.total_amount).toFixed(2);
  const productinfo = `Paara Order ${order.order_number || order.id}`;
  const firstname = String(customer.name || 'Customer').trim().slice(0, 60);
  const email = String(customer.email || '').trim();
  const phone = String(customer.phone || '').trim();

  if (!email || !phone) throw new Error('Customer email and phone are required for PayU.');

  const fields = {
    key: config.key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    surl: config.successUrl,
    furl: config.failureUrl,
    udf1: String(order.id),
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
  };
  fields.hash = generateRequestHash(fields, config.salt);

  return {
    provider: 'payu',
    order_id: order.id,
    order_number: order.order_number || order.id,
    amount,
    currency: 'INR',
    action: PAYU_TEST_PAYMENT_URL,
    method: 'POST',
    fields,
    txnid,
  };
};

const verifyPayment = async (txnid) => {
  const config = getPayuConfig();
  const body = new URLSearchParams({
    key: config.key,
    command: 'verify_payment',
    var1: txnid,
    hash: generateVerifyHash({ key: config.key, command: 'verify_payment', txnid }, config.salt),
  });
  const response = await fetch(PAYU_TEST_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`PayU verification failed with HTTP ${response.status}.`);
  return response.json();
};

module.exports = {
  PAYU_TEST_PAYMENT_URL,
  PAYU_TEST_VERIFY_URL,
  getPayuConfig,
  generateRequestHash,
  generateVerifyHash,
  generateResponseHash,
  hashesMatch,
  createTransactionId,
  createCheckout,
  verifyPayment,
};
