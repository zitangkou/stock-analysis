-- Phase-1 heat platform: persisted heat scores, rotation slots, alerts.
-- Evolves existing schema; does NOT rename tables to ER t_* names.

CREATE TABLE IF NOT EXISTS heat_rules (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE DEFAULT 'default',
    w_change        DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    w_amount        DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    w_turnover      DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    w_momentum      DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO heat_rules (name) VALUES ('default')
ON CONFLICT (name) DO NOTHING;

-- Per-stock heat snapshot (one row per compute cycle)
CREATE TABLE IF NOT EXISTS heat_score_stock (
    ts              TIMESTAMPTZ NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    theme_id        TEXT,
    heat            DOUBLE PRECISION NOT NULL,
    momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
    acceleration    DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_pct      DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    turnover_rate   DOUBLE PRECISION,
    -- proxy fields when real money-flow / limit APIs unavailable
    net_inflow_proxy DOUBLE PRECISION,
    is_limit_up_approx BOOLEAN NOT NULL DEFAULT FALSE,
    data_quality    TEXT NOT NULL DEFAULT 'proxy',  -- full | proxy | partial
    components      JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (ts, code)
);

CREATE INDEX IF NOT EXISTS idx_heat_stock_code_ts ON heat_score_stock (code, ts DESC);
CREATE INDEX IF NOT EXISTS idx_heat_stock_theme_ts ON heat_score_stock (theme_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_heat_stock_ts ON heat_score_stock (ts DESC);

-- Latest stock heat (fast read path for UI)
CREATE TABLE IF NOT EXISTS heat_score_stock_latest (
    code            CHAR(6) PRIMARY KEY REFERENCES instruments(code),
    ts              TIMESTAMPTZ NOT NULL,
    theme_id        TEXT,
    heat            DOUBLE PRECISION NOT NULL,
    momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
    acceleration    DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_pct      DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    turnover_rate   DOUBLE PRECISION,
    net_inflow_proxy DOUBLE PRECISION,
    is_limit_up_approx BOOLEAN NOT NULL DEFAULT FALSE,
    data_quality    TEXT NOT NULL DEFAULT 'proxy',
    components      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_heat_stock_latest_theme ON heat_score_stock_latest (theme_id, heat DESC);

-- Per-theme heat snapshot
CREATE TABLE IF NOT EXISTS heat_score_sector (
    ts              TIMESTAMPTZ NOT NULL,
    theme_id        TEXT NOT NULL,
    heat            DOUBLE PRECISION NOT NULL,
    momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
    acceleration    DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_pct      DOUBLE PRECISION,
    amount_sum      DOUBLE PRECISION,
    up_count        INT NOT NULL DEFAULT 0,
    down_count      INT NOT NULL DEFAULT 0,
    stock_count     INT NOT NULL DEFAULT 0,
    net_inflow_proxy DOUBLE PRECISION,
    data_quality    TEXT NOT NULL DEFAULT 'proxy',
    components      JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (ts, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_heat_sector_ts ON heat_score_sector (ts DESC);

CREATE TABLE IF NOT EXISTS heat_score_sector_latest (
    theme_id        TEXT PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL,
    heat            DOUBLE PRECISION NOT NULL,
    momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
    acceleration    DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_pct      DOUBLE PRECISION,
    amount_sum      DOUBLE PRECISION,
    up_count        INT NOT NULL DEFAULT 0,
    down_count      INT NOT NULL DEFAULT 0,
    stock_count     INT NOT NULL DEFAULT 0,
    net_inflow_proxy DOUBLE PRECISION,
    data_quality    TEXT NOT NULL DEFAULT 'proxy',
    components      JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Aggregated sector quote snapshot (optional companion to heat)
CREATE TABLE IF NOT EXISTS sector_quote_snapshot (
    ts              TIMESTAMPTZ NOT NULL,
    theme_id        TEXT NOT NULL,
    change_pct      DOUBLE PRECISION,
    amount_sum      DOUBLE PRECISION,
    up_count        INT NOT NULL DEFAULT 0,
    down_count      INT NOT NULL DEFAULT 0,
    stock_count     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ts, theme_id)
);

-- 30-minute rotation matrix slots
CREATE TABLE IF NOT EXISTS rotation_matrix (
    trade_date      DATE NOT NULL,
    slot_30m        INT NOT NULL,          -- 0=09:30, 1=10:00, ...
    theme_id        TEXT NOT NULL,
    rank            INT NOT NULL,
    heat            DOUBLE PRECISION NOT NULL,
    change_pct      DOUBLE PRECISION,
    momentum        DOUBLE PRECISION,
    PRIMARY KEY (trade_date, slot_30m, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_rotation_date ON rotation_matrix (trade_date DESC, slot_30m);

-- Alert rules + records (system rules only in phase-1; no multi-user)
CREATE TABLE IF NOT EXISTS alert_rule (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    rule_type       TEXT NOT NULL,          -- sector_heat_surge | stock_heat_surge | limit_up_approx
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    params          JSONB NOT NULL DEFAULT '{}'::jsonb,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_record (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         INT REFERENCES alert_rule(id),
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_type      TEXT NOT NULL,
    target          TEXT NOT NULL,          -- theme_id or stock code
    target_name     TEXT,
    message         TEXT NOT NULL,
    trigger_value   DOUBLE PRECISION,
    threshold       DOUBLE PRECISION,
    priority        TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alert_record_ts ON alert_record (ts DESC);

INSERT INTO alert_rule (name, rule_type, enabled, params, description) VALUES
  ('题材热力突增', 'sector_heat_surge', TRUE,
   '{"min_heat": 75, "min_momentum": 8}'::jsonb,
   '题材热力≥75 且动量≥8 时触发'),
  ('个股热力突增', 'stock_heat_surge', TRUE,
   '{"min_heat": 85, "min_momentum": 10}'::jsonb,
   '个股热力≥85 且动量≥10 时触发'),
  ('近似涨停关注', 'limit_up_approx', TRUE,
   '{"min_change_pct": 9.5}'::jsonb,
   '涨跌幅≥9.5% 近似涨停（非正式涨停池）')
ON CONFLICT (name) DO NOTHING;

-- Retention helper note: heat history trimmed by compute-heat job (default 14 days)
