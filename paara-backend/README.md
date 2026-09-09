# Paara. — Backend (Node + Express + PostgreSQL + PayU)

## Setup

```bash
npm install
npm start            # runs on http://localhost:4000
```

## Zoho Catalyst AppSail deployment preparation

Deploy the `paara-backend` directory as a Catalyst-managed Node.js AppSail
service. No AppSail-specific file is required when deploying from the Catalyst
console; for CLI deployment, use the same directory as the build path and
provide the startup command explicitly.

Build and start commands:

```text
Build: npm install
Start: npm start
```

The equivalent Catalyst CLI deployment command is:

```text
catalyst deploy appsail --name paara-backend --build-path <absolute-paara-backend-path> --stack "NodeJS 20" --command "npm start"
```

Use a current Catalyst-supported Node.js stack (Node.js 20 or newer). AppSail
provides `X_ZOHO_CATALYST_LISTEN_PORT`; the server uses it first, then falls
back to `PORT` and local port `4000`.

Configure these environment variables in AppSail without committing their
values:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_API_KEY`
- `FRONTEND_URL` (comma-separated HTTPS origin(s) for the Zoho Slate frontend)
- `PAYU_MERCHANT_KEY`
- `PAYU_MERCHANT_SALT`
- `PAYU_ENV=test`
- `PAYU_SUCCESS_URL`
- `PAYU_FAILURE_URL`
- Email, WhatsApp, and optional Blob variables required by enabled features

`GET /api/health` is the health check endpoint. The future Slate origin must be
included in `FRONTEND_URL`; credentials and PayU callbacks must use HTTPS.

AppSail local filesystem storage is not used for uploads. Product, homepage,
Paara IRL, owner, Worn By You, and other admin image uploads go to the
Catalyst File Store folder identified by `CATALYST_MEDIA_FOLDER_ID`. PostgreSQL
stores opaque `catalyst-file:<id>` references and the API exposes all new media
through `/media/<id>`, so the frontend does not depend on storage internals.
Legacy `/images/*` and `/uploads/*` references remain readable for migrated
records; they are not rewritten or deleted automatically.

## What's included

| File | Purpose |
|---|---|
| `db/schema.sql` | Full table structure (products, categories, orders, cities, addresses, Instagram cache, etc.) |
| `db/init.js` | Creates tables + seeds your 10 cities and sample products |
| `utils/pricing.js` | GST calculation (18%, server-side only) |
| `utils/shipping.js` | Flat rate for your 10 named cities; km-based slab fallback (Haversine) for everywhere else |
| `routes/products.js` | List/filter products, single product + gallery + Instagram reviews |
| `routes/vault.js` | Today's drop, drop archive, countdown to next drop |
| `routes/addresses.js` | Authenticated saved-address list and creation endpoints used by checkout |
| `routes/orders.js` | Creates an order with **server-recalculated** prices — the frontend cart is never trusted |
| `routes/payment.js` | PayU hosted checkout, callback verification, and webhook |
| `public/checkout.js` | Legacy static helper for PayU hosted checkout |

## Editing your 10 city shipping rates

Open `db/init.js` and change the `cities` array — city name + flat rate in rupees. Anything outside those 10 falls back to the km-based calculation in `utils/shipping.js` (edit `SHIPPING_BASE_FEE`, `SHIPPING_RATE_PER_KM`, `SHIPPING_MAX_CAP` in `.env`).

**Note on distance-based shipping:** the km fallback needs a lat/lng for the customer's address. Pincode → lat/lng isn't wired up yet — the cleanest free option is the India Post Pincode API, or you can geocode once at checkout using any pincode-to-coordinates service and pass `lat`/`lng` when saving an address. Until that's wired up, addresses outside your 10 cities will get the `SHIPPING_MAX_CAP` default — safe, but worth finishing before launch.

## PayU test setup checklist

1. Configure `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_ENV=test`, `PAYU_SUCCESS_URL`, and `PAYU_FAILURE_URL`.
2. Configure the PayU payment webhook URL as `https://yourdomain.com/api/payment/webhook`.
3. Use only PayU's test credentials and test checkout until the AppSail migration is approved.

## The payment flow, end to end

1. Frontend sends cart items + address → `POST /api/orders` → backend re-fetches every product's real price, computes GST + shipping, saves an unpaid PayU order.
2. Frontend calls `POST /api/payment/create` with that order's id → backend returns a signed PayU test checkout form.
3. PayU hosts checkout and posts to the configured success/failure callback.
4. Backend validates the response hash and calls PayU `verify_payment` before marking the order paid and decrementing stock.
5. `POST /api/payment/webhook` provides an idempotent asynchronous payment notification path.

## Not yet included (next steps)

- Cart persistence table (this backend treats the cart as frontend-only state, validated at checkout)
- PDF invoice generation with GST breakup (the data's all there in `GET /api/orders/:id` — just needs a template)
- Admin routes for adding products/images and scheduling Vault release dates
- Wishlist, address book beyond a single insert, order status transitions to "shipped"/"delivered"
