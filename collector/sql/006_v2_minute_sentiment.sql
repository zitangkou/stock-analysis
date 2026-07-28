-- V2 foundations: 5-minute bars aggregated from quotes_snapshot; sentiment stub.
-- Full-market tick/L2 and guba scrape are intentionally out of scope.

CREATE TABLE IF NOT EXISTS bars_5m (
    bar_ts          TIMESTAMPTZ NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    open            DOUBLE PRECISION,
    high            DOUBLE PRECISION,
    low             DOUBLE PRECISION,
    close           DOUBLE PRECISION,
    volume          DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    change_pct      DOUBLE PRECISION,
    n_ticks         INT NOT NULL DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'quotes_snapshot',
    PRIMARY KEY (bar_ts, code)
);

CREATE INDEX IF NOT EXISTS idx_bars_5m_code_ts
    ON bars_5m (code, bar_ts DESC);

-- Lightweight sentiment / headline stub (manual or future RSS ingest)
CREATE TABLE IF NOT EXISTS sentiment_events (
    id              BIGSERIAL PRIMARY KEY,
    event_ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    code            CHAR(6) REFERENCES instruments(code),
    theme_id        TEXT,
    title           TEXT NOT NULL,
    summary         TEXT,
    sentiment       DOUBLE PRECISION,       -- -1..+1
    source          TEXT NOT NULL DEFAULT 'manual',
    url             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentiment_events_ts
    ON sentiment_events (event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_events_code
    ON sentiment_events (code, event_ts DESC);
