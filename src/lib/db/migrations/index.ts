/**
 * Database migrations for Xibo Scripts
 */

import { getDb } from "#lib/db/client.ts";

/**
 * The latest database update identifier - update this when changing schema
 */
export const LATEST_UPDATE = "add menu screen items and campaign tracking";

/**
 * Run a migration that may fail if already applied (e.g., adding a column that exists)
 */
const runMigration = async (sql: string): Promise<void> => {
  try {
    await getDb().execute(sql);
  } catch {
    // Migration already applied, ignore error
  }
};

/**
 * Check if database is already up to date by reading from settings table
 */
const isDbUpToDate = async (): Promise<boolean> => {
  try {
    const result = await getDb().execute(
      "SELECT value FROM settings WHERE key = 'latest_db_update'",
    );
    return result.rows[0]?.value === LATEST_UPDATE;
  } catch {
    // Table doesn't exist or other error, need to run migrations
    return false;
  }
};

/**
 * Initialize database tables
 */
export const initDb = async (): Promise<void> => {
  // Check if database is already up to date - bail early if so
  if (await isDbUpToDate()) {
    return;
  }

  // Create settings table
  await runMigration(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create sessions table
  await runMigration(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      wrapped_data_key TEXT,
      user_id INTEGER
    )
  `);

  // Create login_attempts table
  await runMigration(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER
    )
  `);

  // Create users table for multi-user admin access
  await runMigration(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username_hash TEXT NOT NULL,
      username_index TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      wrapped_data_key TEXT,
      admin_level TEXT NOT NULL,
      invite_code_hash TEXT,
      invite_expiry TEXT
    )
  `);

  // Create unique index on username_index for fast lookups
  await runMigration(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_index ON users(username_index)`,
  );

  // Create activity_log table (unencrypted, admin-only view)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created TEXT NOT NULL,
      message TEXT NOT NULL
    )
  `);

  // Create cache table for API response caching (libsql-backed TTL cache)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires INTEGER NOT NULL
    )
  `);

  // Create businesses table
  await runMigration(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      xibo_folder_id INTEGER,
      folder_name TEXT,
      xibo_dataset_id INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  // Create business_users mapping table (many-to-many)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS business_users (
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (business_id, user_id)
    )
  `);

  // Index for reverse lookup: find all businesses for a given user
  await runMigration(
    `CREATE INDEX IF NOT EXISTS idx_business_users_user ON business_users(user_id)`,
  );

  // Create screens table (belong to a business, map to Xibo displays)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      xibo_display_id INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  // Index for screens by business
  await runMigration(
    `CREATE INDEX IF NOT EXISTS idx_screens_business ON screens(business_id)`,
  );

  // Create menu_screens table (user-configured, each becomes a Xibo layout)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS menu_screens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      screen_id INTEGER NOT NULL REFERENCES screens(id),
      template_id TEXT NOT NULL,
      display_time INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      xibo_layout_id INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  // Index for menu_screens by screen
  await runMigration(
    `CREATE INDEX IF NOT EXISTS idx_menu_screens_screen ON menu_screens(screen_id)`,
  );

  // Add xibo_campaign_id column to menu_screens
  await runMigration(
    `ALTER TABLE menu_screens ADD COLUMN xibo_campaign_id INTEGER`,
  );

  // Create menu_screen_items table (links menu screens to product dataset rows)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS menu_screen_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_screen_id INTEGER NOT NULL REFERENCES menu_screens(id),
      product_row_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);

  // Index for menu_screen_items by menu_screen
  await runMigration(
    `CREATE INDEX IF NOT EXISTS idx_menu_screen_items_menu ON menu_screen_items(menu_screen_id)`,
  );

  // Update the version marker
  await getDb().execute({
    sql:
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('latest_db_update', ?)",
    args: [LATEST_UPDATE],
  });
};

/**
 * All database tables in order for safe dropping (respects foreign key constraints)
 */
const ALL_TABLES = [
  "menu_screen_items",
  "menu_screens",
  "screens",
  "business_users",
  "businesses",
  "cache",
  "activity_log",
  "sessions",
  "users",
  "login_attempts",
  "settings",
] as const;

/**
 * Reset the database by dropping all tables
 */
export const resetDatabase = async (): Promise<void> => {
  const client = getDb();
  for (const table of ALL_TABLES) {
    await client.execute(`DROP TABLE IF EXISTS ${table}`);
  }
};
