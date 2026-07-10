-- Stock market data foundation
-- Boards: SH main (60), SZ main (00), ChiNext (30)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- A. Master data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instruments (
    code            CHAR(6) PRIMARY KEY,
    name            TEXT NOT NULL,
    exchange        CHAR(2) NOT NULL CHECK (exchange IN ('SH', 'SZ')),
    board           TEXT NOT NULL CHECK (board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')),
    list_date       DATE,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'st', 'delisted', 'suspended', 'other')),
    is_st           BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruments_board ON instruments (board);
CREATE INDEX IF NOT EXISTS idx_instruments_status ON instruments (status);

CREATE TABLE IF NOT EXISTS trading_calendar (
    trade_date      DATE PRIMARY KEY,
    is_open         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS industries (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'eastmoney'
);

CREATE TABLE IF NOT EXISTS instrument_industry (
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    industry_id     TEXT NOT NULL REFERENCES industries(id),
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,
    PRIMARY KEY (code, industry_id, valid_from)
);

-- ---------------------------------------------------------------------------
-- B. Universe (replaceable ~2000 pool)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS universe_rules (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    universe_size   INT NOT NULL DEFAULT 2000,
    weight_roe      NUMERIC(6,4) NOT NULL DEFAULT 0.35,
    weight_net_profit NUMERIC(6,4) NOT NULL DEFAULT 0.25,
    weight_net_profit_yoy NUMERIC(6,4) NOT NULL DEFAULT 0.25,
    weight_liquidity NUMERIC(6,4) NOT NULL DEFAULT 0.15,
    min_list_days   INT NOT NULL DEFAULT 120,
    min_avg_amount_20d NUMERIC(20,2) NOT NULL DEFAULT 20000000,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note            TEXT
);

CREATE TABLE IF NOT EXISTS universe_members (
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    rule_id         INT NOT NULL REFERENCES universe_rules(id),
    score           NUMERIC(12,6),
    score_roe       NUMERIC(12,6),
    score_net_profit NUMERIC(12,6),
    score_net_profit_yoy NUMERIC(12,6),
    score_liquidity NUMERIC(12,6),
    reason          TEXT,
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,
    PRIMARY KEY (code, rule_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_universe_members_active
    ON universe_members (rule_id) WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS universe_overrides (
    code            CHAR(6) PRIMARY KEY REFERENCES instruments(code),
    action          TEXT NOT NULL CHECK (action IN ('force_in', 'force_out')),
    note            TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS universe_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         INT NOT NULL REFERENCES universe_rules(id),
    snapshot_date   DATE NOT NULL,
    member_count    INT NOT NULL,
    codes           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- C. Quotes & bars
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes_latest (
    code            CHAR(6) PRIMARY KEY REFERENCES instruments(code),
    ts              TIMESTAMPTZ NOT NULL,
    price           NUMERIC(16,4),
    pre_close       NUMERIC(16,4),
    open            NUMERIC(16,4),
    high            NUMERIC(16,4),
    low             NUMERIC(16,4),
    change_pct      NUMERIC(12,4),
    change_amt      NUMERIC(16,4),
    volume          NUMERIC(20,2),
    amount          NUMERIC(20,2),
    turnover_rate   NUMERIC(12,4),
    amplitude       NUMERIC(12,4),
    source          TEXT NOT NULL DEFAULT 'eastmoney',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes_snapshot (
    ts              TIMESTAMPTZ NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    price           NUMERIC(16,4),
    pre_close       NUMERIC(16,4),
    open            NUMERIC(16,4),
    high            NUMERIC(16,4),
    low             NUMERIC(16,4),
    change_pct      NUMERIC(12,4),
    change_amt      NUMERIC(16,4),
    volume          NUMERIC(20,2),
    amount          NUMERIC(20,2),
    turnover_rate   NUMERIC(12,4),
    amplitude       NUMERIC(12,4),
    source          TEXT NOT NULL DEFAULT 'eastmoney',
    PRIMARY KEY (ts, code)
);

CREATE INDEX IF NOT EXISTS idx_quotes_snapshot_code_ts
    ON quotes_snapshot (code, ts DESC);

CREATE TABLE IF NOT EXISTS bars_1d (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    open            NUMERIC(16,4),
    high            NUMERIC(16,4),
    low             NUMERIC(16,4),
    close           NUMERIC(16,4),
    volume          NUMERIC(20,2),
    amount          NUMERIC(20,2),
    turnover_rate   NUMERIC(12,4),
    change_pct      NUMERIC(12,4),
    pre_close       NUMERIC(16,4),
    adj_factor      NUMERIC(16,8),
    source          TEXT NOT NULL DEFAULT 'eastmoney',
    PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_bars_1d_code ON bars_1d (code, trade_date DESC);

CREATE TABLE IF NOT EXISTS adj_factors (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    adj_factor      NUMERIC(16,8) NOT NULL,
    PRIMARY KEY (trade_date, code)
);

-- ---------------------------------------------------------------------------
-- D. Fundamentals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fundamentals_period (
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    report_date     DATE NOT NULL,
    announce_date   DATE,
    roe             NUMERIC(12,4),
    roa             NUMERIC(12,4),
    net_profit      NUMERIC(20,2),
    net_profit_deducted NUMERIC(20,2),
    net_profit_yoy  NUMERIC(12,4),
    revenue         NUMERIC(20,2),
    revenue_yoy     NUMERIC(12,4),
    gross_margin    NUMERIC(12,4),
    net_margin      NUMERIC(12,4),
    debt_ratio      NUMERIC(12,4),
    operating_cashflow NUMERIC(20,2),
    eps             NUMERIC(16,4),
    bvps            NUMERIC(16,4),
    source          TEXT NOT NULL DEFAULT 'eastmoney',
    raw             JSONB,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (code, report_date)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_roe ON fundamentals_period (roe DESC NULLS LAST);

-- Daily valuation / share capital helpers for strategies
CREATE TABLE IF NOT EXISTS valuation_daily (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    total_mv        NUMERIC(20,2),
    circ_mv         NUMERIC(20,2),
    pe_ttm          NUMERIC(16,4),
    pb              NUMERIC(16,4),
    total_share     NUMERIC(20,2),
    float_share     NUMERIC(20,2),
    PRIMARY KEY (trade_date, code)
);

-- ---------------------------------------------------------------------------
-- E. Jobs & quant placeholders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_runs (
    id              BIGSERIAL PRIMARY KEY,
    job_name        TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'failed', 'partial')),
    rows_affected   INT DEFAULT 0,
    message         TEXT,
    detail          JSONB
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs (job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS factors_daily (
    trade_date      DATE NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    factor_name     TEXT NOT NULL,
    value           NUMERIC(24,8),
    PRIMARY KEY (trade_date, code, factor_name)
);

-- Seed default universe rule
INSERT INTO universe_rules (
    name, universe_size, weight_roe, weight_net_profit,
    weight_net_profit_yoy, weight_liquidity, min_list_days, min_avg_amount_20d, note
) VALUES (
    'default_quality_v1', 2000, 0.35, 0.25, 0.25, 0.15, 120, 20000000,
    '沪深主板+创业板；基本面优先（ROE+净利润）兼顾流动性'
) ON CONFLICT (name) DO NOTHING;