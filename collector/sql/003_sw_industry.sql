-- Shenwan / industry classification + theme mapping

ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS theme_id TEXT,
  ADD COLUMN IF NOT EXISTS sw_l1 TEXT,
  ADD COLUMN IF NOT EXISTS sw_l2 TEXT,
  ADD COLUMN IF NOT EXISTS sw_l3 TEXT;

CREATE INDEX IF NOT EXISTS idx_instruments_theme ON instruments (theme_id);
CREATE INDEX IF NOT EXISTS idx_instruments_sw_l1 ON instruments (sw_l1);

CREATE TABLE IF NOT EXISTS sw_industries (
    code            TEXT PRIMARY KEY,          -- e.g. 851931.SI
    name            TEXT NOT NULL,             -- 三级或当前级别名称
    level           INT NOT NULL DEFAULT 3,    -- 1/2/3
    parent_code     TEXT,
    l1_name         TEXT,
    l2_name         TEXT,
    l3_name         TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instrument_sw (
    code            CHAR(6) PRIMARY KEY REFERENCES instruments(code),
    sw_code         TEXT,                      -- 三级行业代码
    sw_l1           TEXT,
    sw_l2           TEXT,
    sw_l3           TEXT,
    source          TEXT NOT NULL DEFAULT 'sw',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Map Shenwan (or EM) industry names → heatmap theme_id
CREATE TABLE IF NOT EXISTS theme_industry_map (
    id              SERIAL PRIMARY KEY,
    match_level     TEXT NOT NULL CHECK (match_level IN ('l1', 'l2', 'l3', 'name')),
    industry_name   TEXT NOT NULL,
    theme_id        TEXT NOT NULL,
    priority        INT NOT NULL DEFAULT 100,
    UNIQUE (match_level, industry_name)
);

CREATE INDEX IF NOT EXISTS idx_theme_map_name ON theme_industry_map (industry_name);

-- Seed default Shenwan L1 / L2 → 10 theme sectors
INSERT INTO theme_industry_map (match_level, industry_name, theme_id, priority) VALUES
  -- 半导体 / 电子
  ('l1', '电子', 'semiconductor', 10),
  ('l2', '半导体', 'semiconductor', 5),
  ('l2', '元件', 'semiconductor', 8),
  ('l2', '光学光电子', 'semiconductor', 20),
  ('l3', '半导体', 'semiconductor', 1),
  ('l3', '集成电路', 'semiconductor', 1),
  -- AI / 计算机通信
  ('l1', '计算机', 'ai', 10),
  ('l1', '通信', 'ai', 15),
  ('l1', '传媒', 'ai', 40),
  ('l2', '软件开发', 'ai', 5),
  ('l2', 'IT服务', 'ai', 8),
  ('l2', '计算机设备', 'ai', 12),
  ('l2', '通信设备', 'ai', 12),
  -- 新能源车
  ('l1', '汽车', 'nev', 10),
  ('l2', '汽车整车', 'nev', 5),
  ('l2', '汽车零部件', 'nev', 8),
  ('l2', '电池', 'nev', 5),
  ('l3', '锂电池', 'nev', 1),
  -- 医药
  ('l1', '医药生物', 'biotech', 10),
  ('l2', '化学制药', 'biotech', 5),
  ('l2', '中药', 'biotech', 8),
  ('l2', '生物制品', 'biotech', 5),
  ('l2', '医疗器械', 'biotech', 8),
  ('l2', '医疗服务', 'biotech', 8),
  -- 消费白酒家电
  ('l1', '食品饮料', 'liquor', 10),
  ('l1', '家用电器', 'liquor', 20),
  ('l2', '白酒', 'liquor', 1),
  ('l2', '饮料乳品', 'liquor', 8),
  ('l2', '白色家电', 'liquor', 15),
  -- 军工
  ('l1', '国防军工', 'military', 5),
  ('l2', '航天装备', 'military', 1),
  ('l2', '航空装备', 'military', 1),
  ('l2', '地面兵装', 'military', 1),
  ('l2', '航海装备', 'military', 5),
  ('l1', '交通运输', 'military', 80),
  -- 金融
  ('l1', '银行', 'finance', 5),
  ('l1', '非银金融', 'finance', 5),
  ('l2', '证券', 'finance', 1),
  ('l2', '保险', 'finance', 5),
  ('l2', '多元金融', 'finance', 10),
  -- 有色金属
  ('l1', '有色金属', 'metals', 5),
  ('l1', '钢铁', 'metals', 20),
  ('l1', '煤炭', 'metals', 40),
  ('l1', '石油石化', 'metals', 50),
  ('l2', '工业金属', 'metals', 5),
  ('l2', '贵金属', 'metals', 5),
  ('l2', '能源金属', 'metals', 5),
  -- 地产建筑
  ('l1', '房地产', 'realestate', 5),
  ('l1', '建筑装饰', 'realestate', 15),
  ('l1', '建筑材料', 'realestate', 25),
  ('l2', '房地产开发', 'realestate', 1),
  -- 电力光伏
  ('l1', '电力设备', 'greenenergy', 5),
  ('l1', '公用事业', 'greenenergy', 15),
  ('l2', '光伏设备', 'greenenergy', 1),
  ('l2', '风电设备', 'greenenergy', 5),
  ('l2', '电网设备', 'greenenergy', 8),
  ('l2', '电池', 'greenenergy', 30),
  ('l2', '电力', 'greenenergy', 10)
ON CONFLICT (match_level, industry_name) DO UPDATE SET
  theme_id = EXCLUDED.theme_id,
  priority = EXCLUDED.priority;
