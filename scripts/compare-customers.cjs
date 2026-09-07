const Database = require("better-sqlite3");
const { Client } = require("pg");
const path = require("path");

const sqlitePath = path.resolve(__dirname, "../paara-backend/paara.db");

const columns = [
  "id",
  "name",
  "email",
  "password_hash",
  "created_at",
  "gift_card_balance"
];

const numericColumns = new Set([
  "id",
  "gift_card_balance"
]);

function normalizeValue(column, value) {
  if (value === null || value === undefined) {
    return null;
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

  if (column === "gift_card_balance") {
    return Math.abs(left - right) < 0.000000001;
  }

  return left === right;
}

async function main() {
  let sqlite;
  let pg;

  try {
    console.log("========================================");
    console.log("PAARA CUSTOMER DATA INTEGRITY CHECK");
    console.log("========================================");
    console.log("");

    sqlite = new Database(sqlitePath, {
      readonly: true
    });

    const sqliteRows = sqlite
      .prepare(`
        SELECT
          ${columns.join(", ")}
        FROM customers
        ORDER BY id
      `)
      .all();

    console.log(`SQLite customers: ${sqliteRows.length}`);

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
      FROM customers
      ORDER BY id
    `);

    const pgRows = pgResult.rows;

    console.log(`PostgreSQL customers: ${pgRows.length}`);
    console.log("");

    if (sqliteRows.length !== pgRows.length) {
      console.error("❌ ROW COUNT MISMATCH");
      console.error(
        `SQLite: ${sqliteRows.length} | PostgreSQL: ${pgRows.length}`
      );
      process.exitCode = 1;
      return;
    }

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

    console.log(`Customers compared: ${sqliteRows.length}`);
    console.log(`Mismatches: ${mismatches.length}`);
    console.log("");

    if (mismatches.length === 0) {
      console.log("========================================");
      console.log("✅ CUSTOMER DATA INTEGRITY: PASS");
      console.log("========================================");
      console.log("");
      console.log("SQLite and PostgreSQL customer data match exactly.");
    } else {
      console.log("========================================");
      console.log("❌ CUSTOMER DATA INTEGRITY: FAIL");
      console.log("========================================");
      console.log("");

      for (const mismatch of mismatches) {
        console.log(`Customer ID: ${mismatch.id}`);
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