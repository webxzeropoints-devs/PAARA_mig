-- ===================================================
-- Paara. — SQLite schema
-- ===================================================

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  gender      TEXT NOT NULL CHECK (gender IN ('men','women','unisex')),
  vibe        TEXT,                         -- e.g. minimal, statement, bridal
  material    TEXT                          -- e.g. gold, silver, rose-gold, gemstone
);

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id       INTEGER NOT NULL REFERENCES categories(id),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  description       TEXT,
  price             REAL NOT NULL,          -- base price, GST added at checkout
  weight_kg         REAL NOT NULL DEFAULT 0.1,
  material          TEXT,
  subcategory       TEXT,
  stock             INTEGER NOT NULL DEFAULT 0,
  is_exclusive      INTEGER NOT NULL DEFAULT 0,  -- 1 = show in script-font "Exclusive" badge
  is_bestseller     INTEGER NOT NULL DEFAULT 0,
  release_date      TEXT NOT NULL,           -- ISO datetime; drives Vault visibility
  is_active         INTEGER NOT NULL DEFAULT 1,
  is_vault          INTEGER NOT NULL DEFAULT 0,  -- manually curated homepage Vault selection
  images_json       TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,     -- order shown in the flip-card marquee
  is_primary  INTEGER NOT NULL DEFAULT 0      -- the front-of-card image
);

CREATE TABLE IF NOT EXISTS cities (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL UNIQUE,   -- match against customer's city, case-insensitive
  flat_shipping_rate REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  gift_card_balance REAL NOT NULL DEFAULT 1500,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  verified   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  user_type  TEXT NOT NULL CHECK (user_type IN ('customer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_user ON password_reset_otps(email, user_type);

CREATE TABLE IF NOT EXISTS customer_order_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  shipping_line1 TEXT NOT NULL,
  shipping_line2 TEXT,
  shipping_city TEXT NOT NULL,
  shipping_state TEXT NOT NULL,
  shipping_pincode TEXT NOT NULL,
  shipping_country TEXT NOT NULL DEFAULT 'India',
  billing_details TEXT,
  submitted_fields TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  pincode      TEXT NOT NULL,
  lat          REAL,                          -- optional, enables km-based shipping fallback
  lng          REAL,
  is_default   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number       TEXT UNIQUE,
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  address_id         INTEGER NOT NULL REFERENCES addresses(id),
  subtotal           REAL NOT NULL,
  gst_amount         REAL NOT NULL,
  shipping_amount    REAL NOT NULL,
  total_amount       REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'Order Confirmed', -- Order Confirmed | Packed | Shipped | Delivered
  payment_status     TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | paid | pending_verification | refunded
  payment_method     TEXT NOT NULL DEFAULT 'razorpay', -- razorpay | manual_upi | cod
  razorpay_order_id  TEXT,
  razorpay_payment_id TEXT,
  payment_reference  TEXT,
  payment_verified_at TEXT,
  payment_rejected_at TEXT,
  gift_card_eligible_amount REAL,
  gift_card_granted_at TEXT,
  gift_card_granted_by INTEGER REFERENCES admins(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,       -- snapshot, in case product is edited/deleted later
  unit_price   REAL NOT NULL,       -- snapshot of price at time of purchase
  quantity     INTEGER NOT NULL,
  line_total   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS instagram_reviews (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER REFERENCES products(id),   -- nullable: NULL = shown on homepage wall only
  instagram_post_url TEXT NOT NULL,
  image_url         TEXT NOT NULL,
  caption           TEXT,
  likes             INTEGER DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  cached_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_release ON products(release_date);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS loyalty_cards (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  stamp_count INTEGER NOT NULL DEFAULT 0 CHECK (stamp_count BETWEEN 0 AND 6),
  first_stamp_at TEXT,
  expires_at TEXT,
  completed_at TEXT,
  reward_redeemed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_stamps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  animation_shown_at TEXT
);

CREATE TABLE IF NOT EXISTS loyalty_reward_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  redeemed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loyalty_reward_redemptions_customer
ON loyalty_reward_redemptions(customer_id, redeemed_at);

CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_customer
ON loyalty_stamps(customer_id, awarded_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

CREATE TABLE IF NOT EXISTS gift_card_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  gift_card_value  REAL NOT NULL CHECK (gift_card_value > 0),
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phone OTP login
CREATE TABLE IF NOT EXISTS phone_otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL,
  otp_code    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_otps(phone);

-- Wishlist
CREATE TABLE IF NOT EXISTS wishlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id, product_id)
);

-- Admin accounts (dashboard login)
CREATE TABLE IF NOT EXISTS admins (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  profile_image_url TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin email-OTP second factor
CREATE TABLE IF NOT EXISTS admin_otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL REFERENCES admins(id),
  otp_code    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Site-wide coupon / offer popup
CREATE TABLE IF NOT EXISTS coupons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  description    TEXT,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent','flat')),
  discount_value REAL NOT NULL,
  deadline       TEXT NOT NULL,           -- ISO datetime; popup disappears after this
  is_active      INTEGER NOT NULL DEFAULT 1,
  redeemed_at    TEXT,                    -- non-null once redeemed as a gift card
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Curated homepage Vault selection. The product flag is retained for backwards
-- compatibility, while this table records the explicit three-item ordering.
CREATE TABLE IF NOT EXISTS vault_products (
  product_id  INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Homepage collection tiles: exactly 3 fixed slots, admin edits them, never
-- creates/deletes a 4th — enforced by tile_key being one of 3 fixed values.
CREATE TABLE IF NOT EXISTS collection_tiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tile_key    TEXT NOT NULL UNIQUE CHECK (tile_key IN ('pearls','gold','ocean')),
  label       TEXT NOT NULL,
  subtitle    TEXT,
  image_url   TEXT,
  link_path   TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tile_products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tile_key    TEXT NOT NULL CHECK (tile_key IN ('pearls','gold','ocean')),
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tile_key, product_id)
);
-- Paara IRL gallery
CREATE TABLE IF NOT EXISTS paara_irl (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url   TEXT NOT NULL,
  owner_image_url TEXT,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);


