import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export function createDatabase(config) {
  const dir = path.dirname(config.sqlitePath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(config.sqlitePath);
  runMigrations(db);

  return db;
}
