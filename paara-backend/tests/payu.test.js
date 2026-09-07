const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PAYMENT_METHODS,
  getPaymentProvider,
} = require('../utils/paymentProviders');
const {
  generateRequestHash,
  generateResponseHash,
  hashesMatch,
} = require('../utils/payu');

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
