const crypto = require('crypto');

const PAYU_TEST_PAYMENT_URL = 'https://test.payu.in/_payment';
const PAYU_TEST_VERIFY_URL = 'https://test.payu.in/merchant/postservice.php?form=2';
const PAYU_PRODUCTION_PAYMENT_URL = 'https://secure.payu.in/_payment';
const PAYU_PRODUCTION_VERIFY_URL = 'https://info.payu.in/merchant/postservice.php?form=2';

const getPayuConfig = () => {
  const key = String(process.env.PAYU_MERCHANT_KEY || '').trim();
  const salt = String(process.env.PAYU_MERCHANT_SALT || '').trim();
  const environment = String(process.env.PAYU_ENV || 'test').trim().toLowerCase();
  const successUrl = String(process.env.PAYU_SUCCESS_URL || '').trim();
  const failureUrl = String(process.env.PAYU_FAILURE_URL || '').trim();

  if (!key) throw new Error('PAYU_MERCHANT_KEY is not configured.');
  if (!salt) throw new Error('PAYU_MERCHANT_SALT is not configured.');
  if (!['test', 'production'].includes(environment)) {
    throw new Error('PAYU_ENV must be either "test" or "production".');
  }
  for (const [name, value] of [['PAYU_SUCCESS_URL', successUrl], ['PAYU_FAILURE_URL', failureUrl]]) {
    let parsed;
    try { parsed = new URL(value); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:') {
      throw new Error(`${name} must be a valid HTTPS URL.`);
    }
  }

  return {
    key,
    salt,
    environment,
    successUrl,
    failureUrl,
    paymentUrl: environment === 'production' ? PAYU_PRODUCTION_PAYMENT_URL : PAYU_TEST_PAYMENT_URL,
    verifyUrl: environment === 'production' ? PAYU_PRODUCTION_VERIFY_URL : PAYU_TEST_VERIFY_URL,
  };
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
  ];

  // PayU requires splitInfo here when it is present.
  if (Object.prototype.hasOwnProperty.call(payload, 'splitInfo')) {
    values.push(payload.splitInfo || '');
  }

  values.push(
    '',
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
  );

  const prefix = payload.additional_charges
    ? `${payload.additional_charges}|`
    : '';

  return sha512(`${prefix}${values.join('|')}`);
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
    action: config.paymentUrl,
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
  const response = await fetch(config.verifyUrl, {
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
  PAYU_PRODUCTION_PAYMENT_URL,
  PAYU_PRODUCTION_VERIFY_URL,
  getPayuConfig,
  generateRequestHash,
  generateVerifyHash,
  generateResponseHash,
  hashesMatch,
  createTransactionId,
  createCheckout,
  verifyPayment,
};
