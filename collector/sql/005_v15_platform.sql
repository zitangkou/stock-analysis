-- V1.5: limit-up pool (board-aware), concept members CSV, daily money-flow proxy.
-- Cloud-safe: derived from quotes / local CSV — no Eastmoney dependency.

CREATE TABLE IF NOT EXISTS concept_members (
    concept_code    TEXT NOT NULL,
    concept_name    TEXT NOT NULL,
    stock_code      CHAR(6) NOT NULL REFERENCES instruments(code),
    theme_id        TEXT,
    note            TEXT,
    source          TEXT NOT NULL DEFAULT 'csv',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (concept_code, stock_code)
);

CREATE INDEX IF NOT EXISTS idx_concept_members_stock
    ON concept_members (stock_code);
CREATE INDEX IF NOT EXISTS idx_concept_members_theme
    ON concept_members (theme_id);

-- Board-aware limit-up snapshot (rebuilt each quotes/heat cycle)
CREATE TABLE IF NOT EXISTS limit_up_pool (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    name            TEXT,
    board           TEXT NOT NULL,          -- main | chi_next | st
    threshold_pct   DOUBLE PRECISION NOT NULL,
    change_pct      DOUBLE PRECISION,
    price           DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    volume          DOUBLE PRECISION,
    turnover_rate   DOUBLE PRECISION,
    theme_id        TEXT,
    is_limit_up     BOOLEAN NOT NULL DEFAULT TRUE,
    source          TEXT NOT NULL DEFAULT 'quotes_derived',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_limit_up_pool_date
    ON limit_up_pool (trade_date DESC);

-- Daily money-flow proxy (signed amount × change); optional AKShare fill later
CREATE TABLE IF NOT EXISTS money_flow_daily (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    net_inflow      DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    change_pct      DOUBLE PRECISION,
    data_quality    TEXT NOT NULL DEFAULT 'proxy',
    source          TEXT NOT NULL DEFAULT 'amount_x_pct',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_money_flow_daily_date
    ON money_flow_daily (trade_date DESC);
