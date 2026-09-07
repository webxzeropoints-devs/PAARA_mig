const Database = require("better-sqlite3");
const { Client } = require("pg");
const path = require("path");

const sqlitePath = path.resolve(__dirname, "../paara-backend/paara.db");

const columns = [
  "id",
  "category_id",
  "name",
  "slug",
  "description",
  "price",
  "weight_kg",
  "material",
  "subcategory",
  "stock",
  "is_exclusive",
  "is_bestseller",
  "release_date",
  "is_active",
  "is_vault",
  "vault_sort_order",
  "images_json",
  "created_at"
];

const booleanColumns = new Set([
  "is_exclusive",
  "is_bestseller",
  "is_active",
  "is_vault"
]);

const numericColumns = new Set([
  "id",
  "category_id",
  "price",
  "weight_kg",
  "stock",
  "vault_sort_order"
]);

function normalizeValue(column, value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (booleanColumns.has(column)) {
    return Boolean(value);
  }

  if (numericColumns.has(column)) {
    return Number(value);
  }

  return String(value);
}

function valuesEqual(column, a, b) {
  const left = normalizeValue(column, a);
  const right = normalizeValue(column, b);

  if (left === null || right === null) {
    return left === right;
  }

  if (numericColumns.has(column)) {
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return Number.isNaN(left) && Number.isNaN(right);
    }

    if (column === "weight_kg" || column === "price") {
      return Math.abs(left - right) < 0.000000001;
    }

    return left === right;
  }

  return left === right;
}

async function main() {
  let sqlite;
  let pg;

  try {
    console.log("========================================");
    console.log("PAARA PRODUCT DATA INTEGRITY CHECK");
    console.log("========================================");
    console.log("");

    // -----------------------------
    // SQLite
    // -----------------------------
    sqlite = new Database(sqlitePath, {
      readonly: true
    });

    const sqliteRows = sqlite
      .prepare(`
        SELECT
          ${columns.join(", ")}
        FROM products
        ORDER BY id
      `)
      .all();

    console.log(`SQLite products: ${sqliteRows.length}`);

    // -----------------------------
    // PostgreSQL
    // -----------------------------
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }

    const pgConnectionString = process.env.DATABASE_URL.replace(
      "sslmode=require",
      "sslmode=no-verify"
    );

    pg = new Client({
      connectionString: pgConnectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });

    await pg.connect();

    const pgResult = await pg.query(`
      SELECT
        ${columns.join(", ")}
      FROM products
      ORDER BY id
    `);

    const pgRows = pgResult.rows;

    console.log(`PostgreSQL products: ${pgRows.length}`);
    console.log("");

    // -----------------------------
    // Row count check
    // -----------------------------
    if (sqliteRows.length !== pgRows.length) {
      console.error("❌ ROW COUNT MISMATCH");
      console.error(
        `SQLite: ${sqliteRows.length} | PostgreSQL: ${pgRows.length}`
      );
      process.exitCode = 1;
      return;
    }

    // -----------------------------
    // Compare rows
    // -----------------------------
    const mismatches = [];

    for (let i = 0; i < sqliteRows.length; i++) {
      const sqliteRow = sqliteRows[i];
      const pgRow = pgRows[i];

      for (const column of columns) {
        if (!valuesEqual(column, sqliteRow[column], pgRow[column])) {
          mismatches.push({
            id: sqliteRow.id,
            column,
            sqlite: sqliteRow[column],
            postgres: pgRow[column]
          });
        }
      }
    }

    // -----------------------------
    // Result
    // -----------------------------
    console.log(`Products compared: ${sqliteRows.length}`);
    console.log(`Mismatches: ${mismatches.length}`);
    console.log("");

    if (mismatches.length === 0) {
      console.log("========================================");
      console.log("✅ PRODUCT DATA INTEGRITY: PASS");
      console.log("========================================");
      console.log("");
      console.log("SQLite and PostgreSQL product data match exactly.");
    } else {
      console.log("========================================");
      console.log("❌ PRODUCT DATA INTEGRITY: FAIL");
      console.log("========================================");
      console.log("");

      for (const mismatch of mismatches) {
        console.log(`Product ID: ${mismatch.id}`);
        console.log(`Column: ${mismatch.column}`);
        console.log(`SQLite: ${mismatch.sqlite}`);
        console.log(`PostgreSQL: ${mismatch.postgres}`);
        console.log("----------------------------------------");
      }

      process.exitCode = 1;
    }
  } catch (error) {
    console.error("");
    console.error("❌ CHECK FAILED");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (sqlite) {
      sqlite.close();
    }

    if (pg) {
      await pg.end().catch(() => {});
    }
  }
}

main();