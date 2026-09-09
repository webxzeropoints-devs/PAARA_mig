const { round2 } = require('./pricing');

const RATES = {
  chennai: { online: 70, cod: 90 },
  tamilNadu: { online: 80, cod: 100 },
  pondicherry: { online: 90, cod: 110 },
  groupedStates: { online: 110, cod: 130 },
  metroCities: { online: 130, cod: 150 },
};

function normalizePaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || '').trim().toLowerCase();
  if (raw === 'cod') return 'cod';
  if (raw === 'payu' || raw === 'online') return 'online';
  return 'online';
}

function getDeliveryRate(city, state, paymentMethod) {
  const normalizedCity = String(city || '').trim().toLowerCase();
  const normalizedState = String(state || '').trim().toLowerCase();
  const isCod = normalizePaymentMethod(paymentMethod) === 'cod';

  if (normalizedCity === 'chennai') return isCod ? RATES.chennai.cod : RATES.chennai.online;
  if (normalizedCity === 'pondicherry' || normalizedCity === 'puducherry') return isCod ? RATES.pondicherry.cod : RATES.pondicherry.online;
  if (normalizedState === 'tamil nadu') return isCod ? RATES.tamilNadu.cod : RATES.tamilNadu.online;
  if (['andhra pradesh', 'kerala', 'karnataka'].includes(normalizedState)) return isCod ? RATES.groupedStates.cod : RATES.groupedStates.online;
  if (['mumbai', 'kolkata', 'delhi'].includes(normalizedCity)) return isCod ? RATES.metroCities.cod : RATES.metroCities.online;

  return null;
}

function getDeliveryRegion({ city, state }) {
  const normalizedCity = String(city || '').trim().toLowerCase();
  const normalizedState = String(state || '').trim().toLowerCase();
  if (normalizedCity === 'chennai') return 'Chennai';
  if (normalizedCity === 'pondicherry' || normalizedCity === 'puducherry') return 'Pondicherry';
  if (['mumbai', 'kolkata', 'delhi'].includes(normalizedCity)) return 'Mumbai / Kolkata / Delhi';
  if (normalizedState === 'tamil nadu') return 'Tamil Nadu (rest of state)';
  if (['andhra pradesh', 'kerala', 'karnataka'].includes(normalizedState)) return 'Andhra Pradesh / Kerala / Karnataka';
  return null;
}

function rateForRegion(region, paymentMethod) {
  const rates = region === 'Chennai' ? RATES.chennai
    : region === 'Tamil Nadu (rest of state)' ? RATES.tamilNadu
      : region === 'Pondicherry' ? RATES.pondicherry
        : region === 'Andhra Pradesh / Kerala / Karnataka' ? RATES.groupedStates
          : region === 'Mumbai / Kolkata / Delhi' ? RATES.metroCities : null;
  if (!rates) return null;
  return normalizePaymentMethod(paymentMethod) === 'cod' ? rates.cod : rates.online;
}

function calculateShipping({ city, state, paymentMethod = 'payu', totalWeightKg }) {
  const normalizedCity = String(city || '').trim();
  const stateName = String(state || '').trim();
  const amount = getDeliveryRate(normalizedCity, stateName, paymentMethod);

  if (amount == null) {
    const region = getDeliveryRegion({ city, state });
    if (!region) {
      throw new Error(`No delivery rate is configured for ${city || 'the selected city'}, ${state || 'the selected state'}.`);
    }
    const regionAmount = rateForRegion(region, paymentMethod);
    if (regionAmount == null) {
      throw new Error(`No delivery rate is configured for ${city || 'the selected city'}, ${state || 'the selected state'}.`);
    }
    return {
      method: 'city_state_rate',
      city: normalizedCity,
      state: stateName,
      amount: round2(regionAmount),
      ratePerKg: null,
      weightKg: Number(totalWeightKg) || 0,
    };
  }

  return {
    method: 'city_state_rate',
    city: normalizedCity,
    state: stateName,
    amount: round2(amount),
    ratePerKg: null,
    weightKg: Number(totalWeightKg) || 0,
  };
}

module.exports = { calculateShipping, getDeliveryRegion, rateForRegion, getDeliveryRate };
