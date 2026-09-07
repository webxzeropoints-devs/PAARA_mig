const { Client } = require("pg");

const tables = [
  "categories",
  "products",
  "product_images",
  "cities",
  "customers",
  "email_otps",
  "password_reset_otps",
  "addresses",
  "orders",
  "order_items",
  "instagram_reviews",
  "loyalty_cards",
  "loyalty_stamps",
  "gift_card_rules",
  "wishlist",
  "admins",
  "admin_otps",
  "coupons",
  "vault_products",
  "collection_tiles",
  "tile_products",
  "paara_irl",
];

const client = new Client({
  connectionString: process.env.DATABASE_URL.replace(
    "sslmode=require",
    "sslmode=no-verify"
  ),
});

async function main() {
  await client.connect();

  for (const table of tables) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );

    console.log(`${table}: ${result.rows[0].count}`);
  }

  await client.end();
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});