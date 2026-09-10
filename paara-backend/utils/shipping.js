const { round2 } = require('./pricing');

async function calculateShipping({
  city,
  state,
  paymentMethod = 'payu',
  totalWeightKg,
  db,
}) {
  const normalizedCity = String(city || '').trim();

  if (!normalizedCity) {
    throw new Error('A delivery city is required.');
  }

  if (!db || typeof db.query !== 'function') {
    throw new Error('Shipping database is not available.');
  }

  const result = await db.query(
    `
      SELECT id, name, flat_shipping_rate
      FROM cities
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      LIMIT 1
    `,
    [normalizedCity]
  );

  const cityRecord = result.rows[0];

  if (!cityRecord) {
    throw new Error(
      `No delivery rate is configured for ${normalizedCity}.`
    );
  }

  const amount = Number(cityRecord.flat_shipping_rate);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      `Invalid delivery rate configured for ${cityRecord.name}.`
    );
  }

  return {
    method: 'city_rate',
    city: cityRecord.name,
    state: String(state || '').trim(),
    amount: round2(amount),
    ratePerKg: null,
    weightKg: Number(totalWeightKg) || 0,
    paymentMethod:
      String(paymentMethod || 'payu').trim().toLowerCase() === 'cod'
        ? 'cod'
        : 'online',
  };
}

module.exports = {
  calculateShipping,
};
