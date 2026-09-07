const assert = require('node:assert/strict');

const { getPaymentProvider, PAYMENT_METHODS } = require('../utils/paymentProviders');

assert.deepEqual(PAYMENT_METHODS, ['payu'], 'PayU should be the only supported payment method');
const provider = getPaymentProvider('payu');
assert.ok(provider && typeof provider.create === 'function', 'PayU provider should define create');
assert.equal(provider.name, 'payu', 'provider name should match the method');

console.log('payment provider test passed');
