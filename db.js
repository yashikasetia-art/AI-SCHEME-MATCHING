const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'data.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    income REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheme_key TEXT NOT NULL,
    scheme_name TEXT NOT NULL,
    scheme_name_hi TEXT NOT NULL,
    project_cost REAL NOT NULL,
    loan_amount REAL NOT NULL,
    emi TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'statusSubmitted',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;