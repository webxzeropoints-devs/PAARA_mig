const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PAYMENT_METHODS,
  getPaymentProvider,
} = require('../utils/paymentProviders');
const {
  generateRequestHash,
  getPayuConfig,
  createCheckout,
  generateResponseHash,
  hashesMatch,
} = require('../utils/payu');

const originalEnv = { ...process.env };
const withPayuEnv = (overrides = {}) => {
  process.env.PAYU_MERCHANT_KEY = 'test-key';
  process.env.PAYU_MERCHANT_SALT = 'test-salt';
  process.env.PAYU_SUCCESS_URL = 'https://example.com/success';
  process.env.PAYU_FAILURE_URL = 'https://example.com/failure';
  process.env.PAYU_ENV = 'test';
  Object.assign(process.env, overrides);
};
const restoreEnv = () => {
  for (const key of ['PAYU_MERCHANT_KEY', 'PAYU_MERCHANT_SALT', 'PAYU_SUCCESS_URL', 'PAYU_FAILURE_URL', 'PAYU_ENV']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};

const request = {
  key: 'test-key',
  txnid: 'PAARA-1-test',
  amount: '100.00',
  productinfo: 'Paara Order ORD-1',
  firstname: 'Customer',
  email: 'customer@example.test',
  udf1: '1',
  udf2: '',
  udf3: '',
  udf4: '',
  udf5: '',
};

test('PayU is the only active payment provider', () => {
  assert.deepEqual(PAYMENT_METHODS, ['payu']);
  assert.equal(getPaymentProvider('payu').name, 'payu');
  assert.equal(getPaymentProvider('razorpay').name, 'payu');
  assert.equal(getPaymentProvider('manual_upi').name, 'payu');
  assert.equal(getPaymentProvider('cod').name, 'payu');
});

test('PayU request and response hashes validate', () => {
  const requestHash = generateRequestHash(request, 'test-salt');
  assert.equal(requestHash.length, 128);

  const response = {
    key: request.key,
    txnid: request.txnid,
    amount: request.amount,
    productinfo: request.productinfo,
    firstname: request.firstname,
    email: request.email,
    status: 'success',
    udf1: request.udf1,
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
  };
  const responseHash = generateResponseHash(response, 'test-salt');
  assert.equal(hashesMatch(responseHash, responseHash), true);
  assert.equal(hashesMatch(responseHash, 'invalid'), false);
});

test('selects environment-specific payment endpoints', () => {
  try {
    withPayuEnv({ PAYU_ENV: 'test' });
    assert.equal(getPayuConfig().paymentUrl, 'https://test.payu.in/_payment');
    withPayuEnv({ PAYU_ENV: 'production' });
    assert.equal(getPayuConfig().paymentUrl, 'https://secure.payu.in/_payment');
    assert.equal(getPayuConfig().verifyUrl, 'https://secure.payu.in/merchant/postservice.php?form=2');
  } finally { restoreEnv(); }
});

test('rejects invalid or incomplete PayU configuration', () => {
  try {
    withPayuEnv({ PAYU_ENV: 'staging' });
    assert.throws(() => getPayuConfig(), /PAYU_ENV/);
    withPayuEnv({ PAYU_MERCHANT_KEY: '' });
    assert.throws(() => getPayuConfig(), /PAYU_MERCHANT_KEY/);
    withPayuEnv({ PAYU_MERCHANT_SALT: '' });
    assert.throws(() => getPayuConfig(), /PAYU_MERCHANT_SALT/);
    withPayuEnv({ PAYU_SUCCESS_URL: 'http://example.com/success' });
    assert.throws(() => getPayuConfig(), /PAYU_SUCCESS_URL/);
  } finally { restoreEnv(); }
});
