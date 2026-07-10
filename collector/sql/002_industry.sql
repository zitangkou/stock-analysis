-- Theme sector support: store Eastmoney/akshare industry name on instruments
ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS industry TEXT;

CREATE INDEX IF NOT EXISTS idx_instruments_industry ON instruments (industry);
