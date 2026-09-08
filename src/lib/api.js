// API client for the Paara backend (AI_BUILD_BRIEF §3).
// Prefer an explicit override with VITE_API_URL; otherwise use the deployed
// backend for production hosts and localhost for local development.
const resolveBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return String(import.meta.env.VITE_API_URL).replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:4000/api";
    }
    if (host.includes("paarajewellery.in") || host.includes("paara.vercel.app") || host.includes("www.paarajewellery.in")) {
      return "https://paara-backend.vercel.app/api";
    }
  }

  return "https://paara-backend-50045676810.development.catalystappsail.in/api";
};

const BASE_URL = resolveBaseUrl();
const TOKEN_KEY = "paara_token";

const ADMIN_TOKEN_KEY = "paara_admin_token";

export const resolveAssetUrl = (value) => {
  const source = String(value || "");
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) return source;
  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      if (parsed.hostname.endsWith(".blob.vercel-storage.com")) {
        return `${new URL(BASE_URL).origin}/images/blob${parsed.pathname}`;
      }
    } catch {
      return source;
    }
    return source;
  }
  const assetPath = source.startsWith("/") ? source : `/${source}`;
  const encodedPath = encodeURI(assetPath).replace(/#/g, "%23");
  return `${new URL(BASE_URL).origin}${encodedPath}`;
};

const normalizeResponseAssets = (value, key = "") => {
  if (Array.isArray(value)) return value.map((item) => normalizeResponseAssets(item, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => {
    if (entryKey === "images" && Array.isArray(entryValue)) return [entryKey, entryValue.map(resolveAssetUrl)];
    if (entryKey.endsWith("image_url")) return [entryKey, resolveAssetUrl(entryValue)];
    return [entryKey, normalizeResponseAssets(entryValue, entryKey)];
  }));
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);
export const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
export const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

const buildHeaders = (extra = {}, useAdminToken = false) => {
  const headers = { "Content-Type": "application/json", ...extra };
  const token = useAdminToken ? getAdminToken() : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const isFormData = (value) => typeof FormData !== "undefined" && value instanceof FormData;

const prepareRequestBody = (body, headers) => {
  if (body === undefined) return { body: undefined, headers };

  if (isFormData(body)) {
    const nextHeaders = { ...headers };
    delete nextHeaders["Content-Type"];
    return { body, headers: nextHeaders };
  }

  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  };
};

const clearStoredSession = (admin) => {
  if (typeof window === "undefined") return;
  if (admin) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem("paara_admin_user");
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("paara_customer_name");
  }
  window.dispatchEvent(new Event("paara-auth-change"));
};

const handle = async (res, { admin = false } = {}) => {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: res.status === 429
        ? "Too many login attempts. Please wait a few minutes and try again."
        : `Request failed (${res.status}). Please try again.` };
    }
  }
  if (!res.ok) {
    if (res.status === 401) clearStoredSession(admin);
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return normalizeResponseAssets(data);
};

// Catch network-level failures (backend down, CORS, DNS) so a missing
// backend never crashes the page — log a warning and let the caller
// fall back to its empty/error UI.
const wrapFetch = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    if (err && err instanceof TypeError) {
      console.warn(
        `[paara] backend unreachable at ${BASE_URL} — ${err.message || "network error"}`
      );
      const wrapped = new Error(
        "Backend is unreachable. Please try again later."
      );
      wrapped.cause = err;
      wrapped.network = true;
      throw wrapped;
    }
    throw err;
  }
};

export const apiGet = wrapFetch((path) =>
  fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(),
    cache: "no-store",
  }).then((res) => handle(res))
);

export const apiPost = wrapFetch((path, body) => {
  const headers = buildHeaders();
  const payload = prepareRequestBody(body, headers);
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: payload.headers,
    body: payload.body,
    cache: "no-store",
  }).then((res) => handle(res))
});

export const apiPut = wrapFetch((path, body) => {
  const headers = buildHeaders();
  const payload = prepareRequestBody(body, headers);
  return fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: payload.headers,
    body: payload.body,
    cache: "no-store",
  }).then((res) => handle(res));
});

export const apiDelete = wrapFetch((path) =>
  fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
    cache: "no-store",
  }).then((res) => handle(res))
);

export const adminRequest = wrapFetch((path, options = {}) => {
  const { method = "GET", body, headers: extraHeaders = {} } = options;
  const headers = buildHeaders(extraHeaders, true);
  const payload = prepareRequestBody(body, headers);
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: payload.headers,
    body: payload.body,
    cache: "no-store",
  }).then((res) => handle(res, { admin: true }));
});

// Admin helpers
export const adminListProducts = () => adminRequest("/admin/products");
export const adminListCategories = () => adminRequest("/admin/categories");
export const adminCreateCategory = (payload) => adminRequest("/admin/categories", { method: "POST", body: payload });
export const adminUpdateCategory = (id, payload) => adminRequest(`/admin/categories/${id}`, { method: "PUT", body: payload });
export const adminDeleteCategory = (id) => adminRequest(`/admin/categories/${id}`, { method: "DELETE" });
export const adminCreateProduct = (payload) => adminRequest("/admin/products", { method: "POST", body: payload });
export const adminUpdateProduct = (id, payload) => adminRequest(`/admin/products/${id}`, { method: "PUT", body: payload });
export const adminDeleteProduct = (id) => adminRequest(`/admin/products/${id}`, { method: "DELETE" });
export const adminDeleteCustomer = (id) => adminRequest(`/admin/customers/${id}`, { method: "DELETE" });
export const adminSetVault = (product_ids) => adminRequest("/admin/vault", { method: "POST", body: { product_ids } });
export const adminListCoupons = () => adminRequest("/admin/coupons");
export const adminCreateCoupon = (payload) => adminRequest("/admin/coupons", { method: "POST", body: payload });
export const adminUpdateCoupon = (id, payload) => adminRequest(`/admin/coupons/${id}`, { method: "PUT", body: payload });
export const adminDeleteCoupon = (id) => adminRequest(`/admin/coupons/${id}`, { method: "DELETE" });
export const adminChangeProfilePicture = (image_url) => adminRequest("/admin-auth/profile-picture", { method: "PUT", body: { image_url } });
export const adminChangeEmail = (newEmail, currentPassword) => adminRequest("/admin-auth/change-email", { method: "PUT", body: { newEmail, currentPassword } });
export const adminChangePassword = (currentPassword, newPassword) => adminRequest("/admin-auth/change-password", { method: "PUT", body: { currentPassword, newPassword } });

// Convenience helpers that match §3's exact endpoint shapes.
export const authLogin = (email, password) => apiPost("/auth/login", { email, password });
export const authRegister = (payload) => apiPost("/auth/register", payload);

export const getProducts = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null)
  ).toString();
  return apiGet(`/products${qs ? `?${qs}` : ""}`);
};
export const getCategories = () => apiGet("/products/categories");
export const getProductBySlug = (slug) => apiGet(`/products/${slug}`);

export const getVaultToday = () => apiGet("/vault/today");
export const getVaultArchive = () => apiGet("/vault/archive");
export const getVaultNext = () => apiGet("/vault/next");

export const getShippingCities = () => apiGet("/shipping/cities");
export const postShippingQuote = (payload) => apiPost("/shipping/quote", payload);

export const getAddresses = () => apiGet("/addresses");
export const postAddress = (payload) => apiPost("/addresses", payload);

export const postOrder = (payload) => apiPost("/orders", payload);
export const createPayuCheckout = (order_id) => apiPost("/payment/create", { order_id });
export const previewInvoice = async (items, addressId, paymentMethod = "payu") => {
  const res = await fetch(`${BASE_URL}/orders/proforma`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ items, address_id: addressId, payment_method: paymentMethod }),
  });
  if (!res.ok) {
    const text = await res.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    throw new Error(payload?.error || `Could not preview invoice (HTTP ${res.status}).`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    throw new Error("Invoice preview returned an invalid file.");
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("Invoice preview was empty.");
  const url = URL.createObjectURL(blob);
  return url;
};
export const getOrders = () => apiGet("/orders");
export const getOrderById = (id) => apiGet(`/orders/${id}`);
export const getOrderStatus = (orderId, email) => apiGet(`/orders/${orderId}/status?email=${encodeURIComponent(email)}`);
export const getLoyaltyStatus = () => apiGet("/loyalty");
export const getLoyaltyOrder = (orderId) => apiGet(`/loyalty/order/${orderId}`);
export const getPaaraStory = () => apiGet("/paara-story");
export const processLoyaltyOrder = (orderId) => apiPost("/loyalty/process-order", { order_id: orderId });
export const redeemLoyaltyReward = () => apiPost("/loyalty/redeem-reward", {});
export const markLoyaltyAnimationShown = (orderId) => apiPost("/loyalty/mark-animation-shown", { order_id: orderId });
export const updateOrderStatus = (orderId, status) => adminRequest(`/admin/orders/${orderId}/status`, { method: "PATCH", body: { status } });

export const validateCoupon = (code, subtotal) => apiPost("/coupons/validate", { code, subtotal });
export const downloadInvoice = async (orderId) => {
  const res = await fetch(`${BASE_URL}/orders/${orderId}/invoice`, {
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};
    throw new Error(payload?.error || "Could not download invoice.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paara-invoice-${orderId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const adminGetStory = () => adminRequest("/admin/paara-story");
export const adminUpdateStory = (payload) => adminRequest("/admin/paara-story", { method: "PUT", body: payload });

export default {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  getPaaraStory,
  adminRequest,
  adminListProducts,
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminDeleteCustomer,
  adminSetVault,
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminChangeProfilePicture,
  adminChangeEmail,
  adminChangePassword,
  adminGetStory,
  adminUpdateStory,
  getToken,
  setToken,
  clearToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
};
