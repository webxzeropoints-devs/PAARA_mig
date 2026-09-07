const Database = require("./paara-backend/node_modules/better-sqlite3");

const files = [
  "./paara-backend/paara.db",
  "./paara-backend/paara-url-test.db",
  "./paara-backend/seed-check.db"
];

for (const file of files) {
  console.log("\n================================");
  console.log(file);
  console.log("================================");

  try {
    const db = new Database(file, { readonly: true });

    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    for (const table of tables) {
      const safeName = table.name.replace(/"/g, '""');
      const row = db.prepare(
        `SELECT COUNT(*) AS count FROM "${safeName}"`
      ).get();

      console.log(`${table.name}: ${row.count}`);
    }

    db.close();
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}
