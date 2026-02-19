-- GHL MCP Server - Sub-Account Registry
-- Stores agency sub-accounts and their API tokens

CREATE TABLE IF NOT EXISTS sub_accounts (
  id TEXT PRIMARY KEY,                    -- locationId from GHL
  name TEXT NOT NULL,                     -- Friendly name (e.g. "Dr. Smith Dental")
  api_key TEXT NOT NULL,                  -- Private Integration Token
  account_type TEXT DEFAULT 'sub_account', -- 'agency' or 'sub_account'
  is_default INTEGER DEFAULT 0,           -- 1 = default account for operations
  notes TEXT,                             -- Optional notes about this account
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for quick lookup by name
CREATE INDEX IF NOT EXISTS idx_sub_accounts_name ON sub_accounts(name);

-- Index for finding the default account
CREATE INDEX IF NOT EXISTS idx_sub_accounts_default ON sub_accounts(is_default);
