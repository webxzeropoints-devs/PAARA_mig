const { createCheckout } = require('./payu');

const PAYMENT_METHODS = ['payu'];

const normalizePaymentMethod = (value) => String(value || '').trim().toLowerCase() === 'payu' ? 'payu' : 'payu';

const paymentProviders = {
  payu: {
    name: 'payu',
    label: 'PayU',
    description: 'Secure payment via PayU',
    create: createCheckout,
  },
};

const getPaymentProvider = (value) => paymentProviders[normalizePaymentMethod(value)];

module.exports = {
  PAYMENT_METHODS,
  normalizePaymentMethod,
  paymentProviders,
  getPaymentProvider,
};
