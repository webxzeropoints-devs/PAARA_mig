const path = require("path");
const Database = require("../paara-backend/node_modules/better-sqlite3");
const { Client } = require("pg");

const SQLITE_PATH = path.resolve(__dirname, "../paara-backend/paara.db");

// IMPORTANT:
// This is intentionally NOT phone_otps.
// These are the 23 approved migration tables.
const TABLES = [
  "categories",
  "cities",
  "admins",
  "products",
  "product_images",
  "customers",
  "email_otps",
  "password_reset_otps",
  "addresses",
  "orders",
  "order_items",
  "customer_order_details",
  "instagram_reviews",
  "loyalty_cards",
  "loyalty_stamps",
  "gift_card_rules",
  "wishlist",
  "admin_otps",
  "coupons",
  "vault_products",
  "collection_tiles",
  "tile_products",
  "paara_irl",
];

// SQLite INTEGER 0/1 -> PostgreSQL BOOLEAN
const BOOLEAN_COLUMNS = {
  products: ["is_exclusive", "is_bestseller", "is_active", "is_vault"],
  product_images: ["is_primary"],
  customers: [],
  email_otps: ["verified"],
  password_reset_otps: ["used"],
  addresses: ["is_default"],
  instagram_reviews: [],
  loyalty_cards: [],
  gift_card_rules: ["is_active"],
  admins: ["must_change_password"],
  admin_otps: ["verified"],
  coupons: ["is_active"],
  paara_irl: ["is_active"],
};

function quoteIdentifier(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

function convertValue(table, column, value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    BOOLEAN_COLUMNS[table] &&
    BOOLEAN_COLUMNS[table].includes(column)
  ) {
    return Boolean(Number(value));
  }

  return value;
}

async function main() {
  console.log("========================================");
  console.log("PAARA SQLite -> PostgreSQL Importer");
  console.log("========================================");
  console.log();

  console.log("SQLite source:");
  console.log(SQLITE_PATH);
  console.log();

  // Open SQLite READ-ONLY.
  const sqlite = new Database(SQLITE_PATH, {
    readonly: true,
  });

  // Safety confirmation that this is the expected PAARA database.
  const productCheck = sqlite
    .prepare("SELECT COUNT(*) AS count FROM products")
    .get();

  if (Number(productCheck.count) !== 34) {
    throw new Error(
      `SQLite safety check failed: expected 34 products, found ${productCheck.count}`
    );
  }

  console.log("SQLite safety check: PASS");
  console.log(`Products found: ${productCheck.count}`);
  console.log();

  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(
      "sslmode=require",
      "sslmode=no-verify"
    ),
  });

  console.log("Connecting to PostgreSQL...");
  await client.connect();

  const dbCheck = await client.query(`
    SELECT current_database(), current_user
  `);

  console.log("PostgreSQL:");
  console.log(dbCheck.rows[0]);
  console.log();

  // Confirm that this is the expected Aiven database.
  if (dbCheck.rows[0].current_database !== "defaultdb") {
    throw new Error(
      `PostgreSQL safety check failed: expected defaultdb, found ${dbCheck.rows[0].current_database}`
    );
  }

  console.log("PostgreSQL safety check: PASS");
  console.log();

  // Make absolutely sure the transaction is atomic.
  await client.query("BEGIN");

  try {
    // We expect the freshly migrated PostgreSQL database to be empty.
    const existing = await client.query(`
      SELECT
        table_name,
        (
          xpath(
            '/row/count/text()',
            query_to_xml(
              format('SELECT COUNT(*) AS count FROM %I', table_name),
              true,
              false,
              ''
            )
          )
        )[1]::text::bigint AS row_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1)
      ORDER BY table_name
    `, [TABLES]);

    const nonEmpty = existing.rows.filter(
      (row) => Number(row.row_count) > 0
    );

    if (nonEmpty.length > 0) {
      throw new Error(
        "Safety stop: PostgreSQL already contains data in: " +
        nonEmpty
          .map((row) => `${row.table_name}=${row.row_count}`)
          .join(", ")
      );
    }

    console.log("PostgreSQL empty-database check: PASS");
    console.log();

    for (const table of TABLES) {
      console.log(`Importing ${table}...`);

      const rows = sqlite
        .prepare(`SELECT * FROM ${quoteIdentifier(table)}`)
        .all();

      if (rows.length === 0) {
        console.log(`  0 rows`);
        continue;
      }

      const columns = Object.keys(rows[0]);

      const columnList = columns
        .map(quoteIdentifier)
        .join(", ");

      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      const insertSQL = `
        INSERT INTO ${quoteIdentifier(table)}
        (${columnList})
        VALUES (${placeholders})
      `;

      for (const row of rows) {
        const values = columns.map((column) =>
          convertValue(table, column, row[column])
        );

        await client.query(insertSQL, values);
      }

      console.log(`  ${rows.length} rows imported`);
    }

    console.log();
    console.log("Repairing PostgreSQL sequences...");

    for (const table of TABLES) {
      const sequenceResult = await client.query(
        `
        SELECT
          column_name,
          pg_get_serial_sequence(
            format('%I.%I', table_schema, table_name),
            column_name
          ) AS sequence_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_default LIKE 'nextval(%'
        `,
        [table]
      );

      for (const row of sequenceResult.rows) {
        if (!row.sequence_name) continue;

        await client.query(
          `
          SELECT setval(
            $1,
            COALESCE(
              (SELECT MAX(${quoteIdentifier(row.column_name)})
               FROM ${quoteIdentifier(table)}),
              1
            ),
            true
          )
          `,
          [row.sequence_name]
        );
      }
    }

    console.log("Sequence repair: PASS");
    console.log();

    console.log("Verifying row counts...");

    for (const table of TABLES) {
      const sqliteCount = sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`
        )
        .get();

      const pgResult = await client.query(
        `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`
      );

      const sqliteRows = Number(sqliteCount.count);
      const postgresRows = Number(pgResult.rows[0].count);

      if (sqliteRows !== postgresRows) {
        throw new Error(
          `Row-count mismatch in ${table}: SQLite=${sqliteRows}, PostgreSQL=${postgresRows}`
        );
      }

      console.log(
        `  ${table}: ${sqliteRows} -> ${postgresRows} PASS`
      );
    }

    await client.query("COMMIT");

    console.log();
    console.log("========================================");
    console.log("IMPORT SUCCESSFUL");
    console.log("========================================");
    console.log();
    console.log("SQLite source was NOT modified.");
    console.log("phone_otps was NOT imported.");
    console.log("PostgreSQL transaction committed.");
  } catch (error) {
    console.error();
    console.error("IMPORT FAILED");
    console.error(error.message);
    console.error();
    console.error("Rolling back PostgreSQL transaction...");

    await client.query("ROLLBACK");

    console.error("ROLLBACK COMPLETE.");
    throw error;
  } finally {
    sqlite.close();
    await client.end();
  }
}

main().catch((error) => {
  console.error();
  console.error("FATAL:", error.message);
  process.exit(1);
});