// scripts/migrate-to-turso.js
// One-off script to copy data from local SQLite to Turso
// Run once locally: node scripts/migrate-to-turso.js

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env');
  process.exit(1);
}

const turso = createClient({ url: tursoUrl, authToken: tursoToken });

const sqlitePath = path.resolve(__dirname, '..', 'database.sqlite');
if (!fs.existsSync(sqlitePath)) {
  console.error('Local database.sqlite not found at', sqlitePath);
  process.exit(1);
}

const sqlite = new sqlite3.Database(sqlitePath);

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

async function migrate() {
  try {
    const tables = await all(
      sqlite,
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    console.log('Tables found:', tables.map(t => t.name).join(', '));

    for (const { name } of tables) {
      const rows = await all(sqlite, `SELECT * FROM ${name}`);
      console.log(`\n${name}: ${rows.length} rows`);
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT OR REPLACE INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})`;

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        try {
          await turso.execute({ sql: insertSql, args: values });
          inserted++;
        } catch (err) {
          console.warn(`  Failed row in ${name}:`, err.message);
        }
      }
      console.log(`  Inserted ${inserted}/${rows.length}`);
    }
    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    sqlite.close();
  }
}

migrate();
