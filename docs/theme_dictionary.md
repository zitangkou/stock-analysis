# 题材字典（观察单元）

观察单元是 **题材/概念**，不是沪/深/创业板交易所板块。

| theme_id | 显示名 | 行业关键词（优先级从高到低） | 典型成分示例 |
|---|---|---|---|
| semiconductor | 半导体与电子 | 半导体、集成电路、芯片、电子元件 | 韦尔股份、北方华创 |
| ai | 人工智能与软件 | 软件开发、互联网服务、计算机设备、通信设备、游戏 | 科大讯飞、中科曙光 |
| nev | 新能源车 | 汽车整车、汽车零部件、电池、锂电 | 比亚迪、宁德时代 |
| biotech | 生物医药 | 化学制药、中药、生物制品、医疗器械、医疗服务 | 恒瑞医药、药明康德 |
| liquor | 白酒与消费 | 白酒、饮料乳品、白色家电 | 贵州茅台、五粮液 |
| military | 国防军工 | 航天、航空、地面兵装、航海、军工 | 中航沈飞、航发动力 |
| finance | 大金融 | 证券、银行、保险、多元金融 | 中信证券、招商银行 |
| metals | 有色金属 | 工业金属、贵金属、能源金属、钢铁 | 紫金矿业、山东黄金 |
| realestate | 房地产 | 房地产开发、房地产、建筑装饰 | 保利发展、万科A |
| greenenergy | 光伏电力 | 光伏设备、风电设备、电网设备、电力 | 隆基绿能、阳光电源 |

## 映射优先级

1. `instruments.theme_id`（库内已写）
2. 精选代码表 `CODE_TO_THEME`（`server/sectorThemes.ts`）
3. `theme_industry_map` / 行业关键词（`apply-themes`）
4. 静态概念成分 [`data/concept_members.csv`](../data/concept_members.csv)（后续可扩展导入）

## 扩展概念

新增概念时：先在 CSV 增加 `concept_code,concept_name,stock_code,theme_id`，再写导入 job（Phase 后续）；不要依赖云上东财概念接口。
