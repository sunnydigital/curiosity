import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "curiositylm.db");
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return db;
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row: any) => row.name)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    database.exec(sql);
    database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}
