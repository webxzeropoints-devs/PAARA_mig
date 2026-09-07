const fs = require("fs");
const path = require("path");
const Database = require("./paara-backend/node_modules/better-sqlite3");

const dbPath = "./paara-backend/paara.db";
const outputDir = "./migration-backup";

const tables = [
  "categories",
  "products",
  "product_images",
  "cities",
  "customers",
  "email_otps",
  "password_reset_otps",
  "customer_order_details",
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
  "paara_irl"
];

fs.mkdirSync(outputDir, { recursive: true });

const db = new Database(dbPath, { readonly: true });

const backup = {
  source: path.resolve(dbPath),
  created_at: new Date().toISOString(),
  excluded_tables: ["phone_otps"],
  tables: {}
};

for (const table of tables) {
  const safeName = table.replace(/"/g, '""');
  backup.tables[table] = db.prepare(
    `SELECT * FROM "${safeName}"`
  ).all();

  console.log(`${table}: ${backup.tables[table].length} rows`);
}

db.close();

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const outputFile = path.join(
  outputDir,
  `paara-sqlite-backup-${timestamp}.json`
);

fs.writeFileSync(
  outputFile,
  JSON.stringify(backup, null, 2),
  "utf8"
);

console.log("\n================================");
console.log("BACKUP CREATED SUCCESSFULLY");
console.log("================================");
console.log(outputFile);
console.log(`Tables exported: ${tables.length}`);
console.log("Excluded: phone_otps");
