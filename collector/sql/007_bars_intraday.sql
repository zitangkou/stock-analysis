-- Intraday OHLC buckets (5 / 15 / 30 minutes) from quotes_snapshot.
-- Complements bars_5m; prefer this table for multi-interval queries.

CREATE TABLE IF NOT EXISTS bars_intraday (
    bar_ts          TIMESTAMPTZ NOT NULL,
    code            CHAR(6) NOT NULL REFERENCES instruments(code),
    interval_m      SMALLINT NOT NULL CHECK (interval_m IN (5, 15, 30)),
    open            DOUBLE PRECISION,
    high            DOUBLE PRECISION,
    low             DOUBLE PRECISION,
    close           DOUBLE PRECISION,
    volume          DOUBLE PRECISION,
    amount          DOUBLE PRECISION,
    change_pct      DOUBLE PRECISION,
    n_ticks         INT NOT NULL DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'quotes_snapshot',
    PRIMARY KEY (bar_ts, code, interval_m)
);

CREATE INDEX IF NOT EXISTS idx_bars_intraday_code_iv_ts
    ON bars_intraday (code, interval_m, bar_ts DESC);
