/**
 * Minimal PayU hosted-checkout helper for legacy static consumers.
 * The backend creates the order and signs the PayU form.
 */
const API_BASE = 'http://localhost:4000/api';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function checkout(cartItems, addressId) {
  const order = await api('/orders', {
    method: 'POST',
    body: JSON.stringify({ items: cartItems, address_id: addressId, payment_method: 'payu' }),
  });
  const checkoutDetails = await api('/payment/create', {
    method: 'POST',
    body: JSON.stringify({ order_id: order.order_id }),
  });
  const form = document.createElement('form');
  form.method = checkoutDetails.method || 'POST';
  form.action = checkoutDetails.action;
  Object.entries(checkoutDetails.fields || {}).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
