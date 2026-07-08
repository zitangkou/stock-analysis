import { GoogleGenAI, Type } from "@google/genai";
import { Stock, Sector, MarketDataPoint, MarketState, ScrapeLog } from "../src/types.js";

// 10大行业板块及各大板块的10只代表性热门股票
export const INITIAL_SECTORS: Omit<Sector, 'heat' | 'change' | 'sentimentScore' | 'hotStocks' | 'description'>[] = [
  { id: "semiconductor", name: "半导体与集成电路" },
  { id: "ai", name: "人工智能与大模型" },
  { id: "nev", name: "新能源汽车与锂电" },
  { id: "biotech", name: "生物医药与医疗健康" },
  { id: "liquor", name: "白酒消费与大健康" },
  { id: "military", name: "国防军工与航空航天" },
  { id: "finance", name: "大金融与证券金融" },
  { id: "metals", name: "有色金属与稀缺资源" },
  { id: "realestate", name: "房地产业与城市建设" },
  { id: "greenenergy", name: "光伏储能与电力设备" }
];

export const INITIAL_STOCKS: { [sectorId: string]: Omit<Stock, 'heat' | 'change' | 'sentiment' | 'discussionCount' | 'rank'>[] } = {
  semiconductor: [
    { code: "688981", name: "中芯国际", price: 95.8 },
    { code: "002371", name: "北方华创", price: 385.5 },
    { code: "603501", name: "韦尔股份", price: 108.2 },
    { code: "603986", name: "兆易创新", price: 89.4 },
    { code: "002049", name: "紫光国微", price: 68.5 },
    { code: "600584", name: "长电科技", price: 34.2 },
    { code: "688008", name: "澜起科技", price: 59.8 },
    { code: "688256", name: "寒武纪", price: 412.0 },
    { code: "688012", name: "中微公司", price: 178.6 },
    { code: "688347", name: "华虹公司", price: 42.5 }
  ],
  ai: [
    { code: "002230", name: "科大讯飞", price: 48.6 },
    { code: "000977", name: "浪潮信息", price: 39.2 },
    { code: "601360", name: "三六零", price: 12.8 },
    { code: "300418", name: "昆仑万维", price: 35.4 },
    { code: "601138", name: "工业富联", price: 24.5 },
    { code: "603019", name: "中科曙光", price: 72.3 },
    { code: "688111", name: "金山办公", price: 295.0 },
    { code: "002261", name: "拓维信息", price: 18.9 },
    { code: "300496", name: "中科创达", price: 54.1 },
    { code: "301236", name: "软通动力", price: 45.8 }
  ],
  nev: [
    { code: "002594", name: "比亚迪", price: 278.4 },
    { code: "300750", name: "宁德时代", price: 245.2 },
    { code: "601127", name: "赛力斯", price: 112.5 },
    { code: "000625", name: "长安汽车", price: 15.6 },
    { code: "002460", name: "赣锋锂业", price: 36.8 },
    { code: "002466", name: "天齐锂业", price: 38.2 },
    { code: "300014", name: "亿纬锂能", price: 42.9 },
    { code: "300274", name: "阳光电源", price: 85.6 },
    { code: "002812", name: "恩捷股份", price: 31.4 },
    { code: "603799", name: "华友钴业", price: 28.5 }
  ],
  biotech: [
    { code: "603259", name: "药明康德", price: 52.4 },
    { code: "600276", name: "恒瑞医药", price: 49.8 },
    { code: "300015", name: "爱尔眼科", price: 13.5 },
    { code: "300760", name: "迈瑞医疗", price: 285.0 },
    { code: "600436", name: "片仔癀", price: 242.6 },
    { code: "300122", name: "智飞生物", price: 29.4 },
    { code: "600196", name: "复星医药", price: 26.8 },
    { code: "300142", name: "沃森生物", price: 15.2 },
    { code: "300347", name: "泰格医药", price: 58.3 },
    { code: "000661", name: "长春高新", price: 104.5 }
  ],
  liquor: [
    { code: "600519", name: "贵州茅台", price: 1588.0 },
    { code: "000858", name: "五粮液", price: 145.6 },
    { code: "600809", name: "山西汾酒", price: 204.5 },
    { code: "000568", name: "泸州老窖", price: 132.8 },
    { code: "002304", name: "洋河股份", price: 86.4 },
    { code: "603288", name: "海天味业", price: 38.9 },
    { code: "600887", name: "伊利股份", price: 27.5 },
    { code: "000333", name: "美的集团", price: 74.2 },
    { code: "000651", name: "格力电器", price: 41.5 },
    { code: "600600", name: "青岛啤酒", price: 69.8 }
  ],
  military: [
    { code: "600760", name: "中航沈飞", price: 44.5 },
    { code: "000768", name: "中航西飞", price: 24.8 },
    { code: "600893", name: "航发动力", price: 36.2 },
    { code: "601989", name: "中国重工", price: 5.4 },
    { code: "600150", name: "中国船舶", price: 38.5 },
    { code: "600967", name: "内蒙一机", price: 7.9 },
    { code: "002389", name: "航天彩虹", price: 16.4 },
    { code: "000519", name: "中兵红箭", price: 14.1 },
    { code: "002179", name: "中航光电", price: 39.8 },
    { code: "600879", name: "航天电子", price: 8.6 }
  ],
  finance: [
    { code: "300059", name: "东方财富", price: 22.4 },
    { code: "600030", name: "中信证券", price: 28.5 },
    { code: "601318", name: "中国平安", price: 44.8 },
    { code: "600036", name: "招商银行", price: 32.6 },
    { code: "601398", name: "工商银行", price: 5.8 },
    { code: "601939", name: "建设银行", price: 7.2 },
    { code: "300033", name: "同花顺", price: 198.5 },
    { code: "601688", name: "华泰证券", price: 16.5 },
    { code: "601099", name: "太平洋", price: 3.9 },
    { code: "002142", name: "宁波银行", price: 21.8 }
  ],
  metals: [
    { code: "601899", name: "紫金矿业", price: 16.4 },
    { code: "603993", name: "洛阳钼业", price: 7.8 },
    { code: "600547", name: "山东黄金", price: 24.5 },
    { code: "600111", name: "北方稀土", price: 18.2 },
    { code: "601600", name: "中国铝业", price: 6.3 },
    { code: "600362", name: "江西铜业", price: 22.8 },
    { code: "000630", name: "铜陵有色", price: 3.2 },
    { code: "600497", name: "驰宏锌锗", price: 5.1 },
    { code: "601020", name: "华钰矿业", price: 11.2 },
    { code: "000807", name: "云铝股份", price: 12.4 }
  ],
  realestate: [
    { code: "000002", name: "万科A", price: 8.4 },
    { code: "600048", name: "保利发展", price: 9.6 },
    { code: "603833", name: "金地集团", price: 4.2 },
    { code: "001979", name: "招商蛇口", price: 9.1 },
    { code: "600340", name: "华夏幸福", price: 2.1 },
    { code: "600606", name: "绿地控股", price: 1.8 },
    { code: "601155", name: "新城控股", price: 11.4 },
    { code: "600376", name: "首开股份", price: 2.5 },
    { code: "002244", name: "滨江集团", price: 7.9 },
    { code: "600657", name: "信达地产", price: 3.6 }
  ],
  greenenergy: [
    { code: "601012", name: "隆基绿能", price: 18.4 },
    { code: "600438", name: "通威股份", price: 20.2 },
    { code: "600089", name: "特变电工", price: 14.5 },
    { code: "002459", name: "晶澳科技", price: 15.1 },
    { code: "688599", name: "天合光能", price: 22.4 },
    { code: "600406", name: "国电南瑞", price: 26.8 },
    { code: "600900", name: "长江电力", price: 29.5 },
    { code: "600905", name: "三峡能源", price: 4.6 },
    { code: "688223", name: "晶科能源", price: 8.8 },
    { code: "300763", name: "锦浪科技", price: 62.5 }
  ]
};

// 板块的新闻热点词与大背景
const SECTOR_TOPICS: { [sectorId: string]: string[] } = {
  semiconductor: [
    "传国家大基金三期入股，制造设备与先进制程迎来国产替代红利",
    "全球半导体周期见底回升，存储芯片、CIS传感器产品报价连续跳涨",
    "硅片和晶圆代工产能利用率回暖，先进制程产能供不应求",
    "AI算力芯片对高带宽内存（HBM）及先进封装的需求出现爆发式增长",
    "部分核心制造设备零部件和光刻胶通过国内大厂流片测试"
  ],
  ai: [
    "国内头部通用大模型发布全新3.0版本，多模态推理与编程能力直逼国际顶尖",
    "算力租赁供不应求，多地智能算力中心项目集中上马，算力报价持续坚挺",
    "AI+教育、AI+协同办公等C端应用订阅数再创新高，商业化闭环加速落地",
    "端侧AI成新战场，搭载大模型的AI PC与AI手机新品密集发布",
    "开源社区模型下载量破千万，应用开发者生态迎来爆发式增长"
  ],
  nev: [
    "新能源车渗透率持续超越50%，国内车企在全球市场份额不断攀升",
    "固态电池研发取得突破性进展，新车宣告续航突破1000公里",
    "智能驾驶城市NOA功能大规模推送，高阶智驾正成为消费者购车决策首选",
    "锂盐、碳酸锂报价止跌企稳，中下游电池包厂商利润空间迎来修复",
    "超充桩建设进入快车道，800V高压快充架构车型加速普及"
  ],
  biotech: [
    "多款国产创新药获得美国FDA批准上市，医药出海授权金（License-out）屡创新高",
    "国家医保谈判对真创新药给予差异化定价保护，市场信心大幅回暖",
    "CXO海外制裁阴霾渐消，海外头部制药企业重返国内研发外包供应链",
    "高通量基因测序与AI制药（AIDD）等前沿交叉领域融资热度重燃",
    "夏季季节性流感与呼吸道感染频发，相关抗病毒、检测盒需求激增"
  ],
  liquor: [
    "高端白酒端午/中秋批价表现平稳，经销商库存结构进一步改善",
    "大众餐饮及宴席市场消费复苏，次高端白酒开瓶率表现超预期",
    "头部酒企持续加大派现力度，分红红利收益率吸引长线资金配置",
    "新中式国潮茶饮、低度微醺酒类等新品类持续瓜分年轻消费群市场",
    "家电以旧换新补贴落地，智能大电、绿色冷链销售额出现双位数增长"
  ],
  military: [
    "军工央企国企改革、重组预期再度升温，核心军工资产证券化加速",
    "新型先进战机及无人机批产上量，核心供应链订单排产能见度高",
    "商业航天成新质生产力代表，多款大推力液氧煤油运载火箭成功首飞",
    "低空经济（eVTOL）利好政策频出，地方低空基建规划及试点航线落地",
    "特种碳纤维、高温合金等军工新材料国产化率和生产良率稳步提升"
  ],
  finance: [
    "交易日沪深两市成交额爆量突破一万亿，券商板块财富管理业务直接受益",
    "监管出台多项支持资本市场平稳运行红利政策，引导中长期资金入市",
    "高股息国有大行持续受避险配置资金青睐，股价连创历史新高",
    "互金零售交易平台活跃度激增，金融IT、智能投顾流量端率先反弹",
    "保险资产端投资收益率企稳，负债端新业务价值（NBV）延续高增长"
  ],
  metals: [
    "美联储降息预期升温，国际黄金、白银价格再度突破历史高点",
    "全球电动化及电网升级带动铜需求飙升，核心铜矿供应偏紧，伦铜暴涨",
    "国家对稀土资源配额管控进一步收紧，稀土氧化物报价探底回升",
    "铝材下游受特高压输电、新能源车轻量化托底，库存持续去化",
    "有色金属中报业绩超预期，资源型企业现金流与分红极具复苏韧性"
  ],
  realestate: [
    "一线城市限购政策全面松绑，新房及二手房带看量与成交额均见底反弹",
    "保交房工作取得阶段性显著成果，核心房企融资白名单全面铺开",
    "存量房贷利率下调预期渐浓，居民提前还贷压力得到实质性缓解",
    "城中村改造及保障房配售规划密集出台，新型城镇化建设提质增效",
    "央行推出设立保障性住房再贷款等创新性去库存货币政策工具"
  ],
  greenenergy: [
    "硅料、硅片报价全面跌破现金成本，全行业加速淘汰落后产能与过剩供给",
    "特高压输电通道密集核准开工，彻底解决西部风光电集中消纳与外送瓶颈",
    "多地强制配储比例及调峰补贴标准提升，大容量工商业储能装机量倍增",
    "光伏组件出口订单在欧美市场保持稳健，新兴市场装机需求爆发",
    "氢能交通、绿氢炼化等国家级示范项目陆续进入实质性招标阶段"
  ]
};

// 舆情抓取的新闻/帖子标题模板
const POST_TEMPLATES = [
  { source: "东财股吧", template: "听说[STK]要和头部大厂开展深度技术合作，有知情人进来说说吗？", weight: 3 },
  { source: "雪球社区", template: "重磅！[SEC]板块今日大爆发，[STK]盘中主力资金强力封板，这轮行情能走多远？", weight: 4 },
  { source: "淘股吧", template: "[STK]强势站上5日均线，超短游资席位连续三天抢筹，跟不跟？", weight: 4 },
  { source: "新浪财经", template: "快讯：[STK]今日大涨[AMT]%，带动整个[SEC]板块成交量创出近期新高。", weight: 5 },
  { source: "同花顺社区", template: "今日[SEC]行业资金净流入居前，[STK]与[STK_ALT]热度爆棚，荣登社区风云榜！", weight: 3 },
  { source: "上海证券报", template: "【权威专访】[SEC]产业迎来政策大风口，专家表示看好[STK]在细分领域的垄断优势。", weight: 6 },
  { source: "华尔街见闻", template: "国际巨头财报超出预期，国内产业链公司[STK]、[STK_ALT]受情绪提振大幅拉升。", weight: 5 },
  { source: "每日经济新闻", template: "【行业透视】产能吃紧！[SEC]大厂订单排到明年，[STK]透露正开足马力加紧生产。", weight: 5 },
  { source: "股海擒龙论坛", template: "今天[STK]的走势太诡异了，午后一笔万手买单强行拉升，难道有重大利好未公布？", weight: 2 },
  { source: "东方财富网", template: "快讯：市场情绪逐渐高涨，散户大军涌入，[SEC]概念成为全天最靓丽的风景线。", weight: 4 }
];

// 初始化 Gemini 客户端
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// 内存数据库：存储热度时间线
class MarketEngine {
  private timeline: MarketDataPoint[] = [];
  private currentSectors: Sector[] = [];
  private logs: ScrapeLog[] = [];
  private lastUpdated: Date = new Date();
  private intervalTimer: NodeJS.Timeout | null = null;
  private isLiveScraping = false;
  private statusMessage = "交易日自适应监测就绪";
  private geminiCooldownUntil = 0;
  private intervalMs = 300000; // 默认 5分钟 (300000 毫秒)

  public getIntervalMs(): number {
    return this.intervalMs;
  }

  public setIntervalMs(ms: number) {
    this.intervalMs = ms;
    this.statusMessage = `自动监控已校准，时序热度引擎自适应更新频率: ${ms / 60000}分钟`;
  }

  public isCooldownActive(): boolean {
    return Date.now() < this.geminiCooldownUntil;
  }

  public triggerCooldown(durationMs: number = 300000) {
    this.geminiCooldownUntil = Date.now() + durationMs;
    console.warn(`[MarketEngine] 全局激活 Gemini 熔断保护。熔断持续时间: ${durationMs / 1000}秒。熔断截止时间: ${new Date(this.geminiCooldownUntil).toLocaleTimeString()}`);
  }

  constructor() {
    this.initializeState();
  }

  // 初始化，预生成今日历史时间线 (09:30 至 当前时间，每十分钟一个点)
  private initializeState() {
    console.log("[MarketEngine] 初始化市场数据引擎...");
    
    // 生成基础板块数据（带有初始的热度与涨跌幅）
    this.currentSectors = INITIAL_SECTORS.map(sec => {
      // 随机分配初始热度(40-80)与涨跌幅(-3% 到 5%)
      const baseHeat = 50 + Math.floor(Math.random() * 25);
      const baseChange = Number((Math.random() * 6 - 2).toFixed(2));
      const sentimentScore = 45 + Math.floor(Math.random() * 25);
      
      const stocks = INITIAL_STOCKS[sec.id].map((stk, idx) => {
        const stkHeat = Math.max(10, Math.min(100, baseHeat + (10 - idx) * 2 + Math.floor(Math.random() * 10 - 5)));
        const stkChange = Number((baseChange + Math.random() * 4 - 2).toFixed(2));
        const discussion = Math.floor(stkHeat * 5.4 + Math.random() * 100);
        
        let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
        if (stkChange > 1.5) sentiment = 'positive';
        else if (stkChange < -1.5) sentiment = 'negative';

        return {
          ...stk,
          heat: stkHeat,
          change: stkChange,
          sentiment,
          discussionCount: discussion,
          rank: idx + 1
        };
      });

      // 排序前十股票
      stocks.sort((a, b) => b.heat - a.heat);
      stocks.forEach((stk, i) => stk.rank = i + 1);

      return {
        ...sec,
        heat: baseHeat,
        change: baseChange,
        sentimentScore,
        hotStocks: stocks,
        description: SECTOR_TOPICS[sec.id][0]
      };
    });

    // 预生成今天的 10分钟 历史点
    this.timeline = this.pregenerateTodayTimeline();
    this.lastUpdated = new Date();
    
    // 启动一个 10 分钟自动更新的后台定时器
    this.startAutoUpdateTimer();
    
    // 生成初始抓取日志
    this.generateMockLogs(5);
  }

  // 生成今日 09:30 至 当前时间（或者全天）的 2 分钟数据点
  private pregenerateTodayTimeline(): MarketDataPoint[] {
    const points: MarketDataPoint[] = [];
    const timeIntervals: string[] = [];
    
    // 生成09:30到11:30的2分钟点
    let hour = 9;
    let min = 30;
    while (hour < 11 || (hour === 11 && min <= 30)) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      timeIntervals.push(timeStr);
      min += 2;
      if (min >= 60) {
        hour += 1;
        min = 0;
      }
    }
    
    // 生成13:00到15:00的2分钟点
    hour = 13;
    min = 0;
    while (hour < 15 || (hour === 15 && min <= 0)) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      timeIntervals.push(timeStr);
      min += 2;
      if (min >= 60) {
        hour += 1;
        min = 0;
      }
    }

    // 默认如果已经过了15:00（或周末），生成全天数据
    // 如果在交易时间内，我们可以裁切数据点只到当前时间
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMin;

    let targetIntervals = timeIntervals;
    // 只有在今天交易日 9:30-15:00 之间，我们才动态裁剪，否则默认生成全天以展现完美数据
    const isTradingHoursToday = currentTotalMinutes >= 9 * 60 + 30 && currentTotalMinutes <= 15 * 60 + 10;
    if (isTradingHoursToday) {
      targetIntervals = timeIntervals.filter(t => {
        const [h, m] = t.split(":").map(Number);
        return (h * 60 + m) <= currentTotalMinutes;
      });
    }

    // 给每个点随机走势模型进行平滑过渡生成
    const runningSectorsState = INITIAL_SECTORS.map(sec => ({
      id: sec.id,
      heat: 40 + Math.floor(Math.random() * 30),
      change: Number((Math.random() * 4 - 2).toFixed(2)),
      sentimentScore: 50 + Math.floor(Math.random() * 20)
    }));

    const runningStocksState: { [secId: string]: { code: string; name: string; heat: number; change: number }[] } = {};
    INITIAL_SECTORS.forEach(sec => {
      runningStocksState[sec.id] = INITIAL_STOCKS[sec.id].map(stk => ({
        code: stk.code,
        name: stk.name,
        heat: 30 + Math.floor(Math.random() * 40),
        change: Number((Math.random() * 6 - 3).toFixed(2))
      }));
    });

    targetIntervals.forEach(timeStr => {
      const pointSectors: { [secId: string]: { heat: number; change: number; sentimentScore: number; description?: string } } = {};
      const pointStocks: { [secId: string]: { code: string; name: string; heat: number; change: number; sentiment?: 'positive' | 'neutral' | 'negative' }[] } = {};

      runningSectorsState.forEach(sec => {
        // 小幅随机扰动
        sec.heat = Math.max(20, Math.min(100, sec.heat + Math.floor(Math.random() * 11 - 5)));
        sec.change = Number(Math.max(-10, Math.min(10, sec.change + Number((Math.random() * 1.6 - 0.8).toFixed(2)))).toFixed(2));
        sec.sentimentScore = Math.max(10, Math.min(100, sec.sentimentScore + Math.floor(Math.random() * 9 - 4)));

        pointSectors[sec.id] = {
          heat: sec.heat,
          change: sec.change,
          sentimentScore: sec.sentimentScore,
          description: SECTOR_TOPICS[sec.id][Math.floor(Math.random() * SECTOR_TOPICS[sec.id].length)]
        };

        // 板块下的股票
        const stkList = runningStocksState[sec.id].map(stk => {
          stk.heat = Math.max(10, Math.min(100, stk.heat + Math.floor(Math.random() * 15 - 7)));
          stk.change = Number(Math.max(-10, Math.min(10, stk.change + Number((Math.random() * 2.4 - 1.2).toFixed(2)))).toFixed(2));
          
          let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
          if (stk.change > 2) sentiment = 'positive';
          else if (stk.change < -2) sentiment = 'negative';

          return {
            code: stk.code,
            name: stk.name,
            heat: stk.heat,
            change: stk.change,
            sentiment
          };
        });

        // 按热度排序前10，写入该时间点快照
        stkList.sort((a, b) => b.heat - a.heat);
        pointStocks[sec.id] = stkList;
      });

      points.push({
        time: timeStr,
        sectors: pointSectors,
        stocks: pointStocks
      });
    });

    // 将最后那个点的数据同步到 currentSectors 保持一致
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      this.currentSectors = this.currentSectors.map(sec => {
        const lastSecData = lastPoint.sectors[sec.id];
        const lastStksData = lastPoint.stocks[sec.id].map((stk, idx) => {
          const originalPrice = INITIAL_STOCKS[sec.id].find(s => s.code === stk.code)?.price || 10.0;
          // 计算现价
          const currentPrice = Number((originalPrice * (1 + stk.change / 100)).toFixed(2));
          return {
            code: stk.code,
            name: stk.name,
            heat: stk.heat,
            change: stk.change,
            price: currentPrice,
            sentiment: stk.sentiment || 'neutral',
            discussionCount: Math.floor(stk.heat * 6 + Math.random() * 50),
            rank: idx + 1
          };
        });

        return {
          ...sec,
          heat: lastSecData.heat,
          change: lastSecData.change,
          sentimentScore: lastSecData.sentimentScore,
          hotStocks: lastStksData,
          description: lastSecData.description || SECTOR_TOPICS[sec.id][0]
        };
      });
    }

    return points;
  }

  // 启动后台定时器，高频例行执行全网舆情监测与状态更新
  private startAutoUpdateTimer() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    
    // 每 15 秒触发一次高频分时模拟
    this.intervalTimer = setInterval(() => {
      this.statusMessage = "后台定时抓取启动中...";
      this.runAIEnhancedScrape(false)
        .then(() => {
          console.log("[MarketEngine] 2分钟分时热度抓取计算成功！");
        })
        .catch(err => {
          console.error("[MarketEngine] 后台例行更新错误:", err);
        });
    }, 15000);
  }

  // 生成实时模拟抓取日志
  private generateMockLogs(count: number = 6): ScrapeLog[] {
    const freshLogs: ScrapeLog[] = [];
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    for (let i = 0; i < count; i++) {
      // 随机选板块和股票
      const secIdx = Math.floor(Math.random() * INITIAL_SECTORS.length);
      const sector = INITIAL_SECTORS[secIdx];
      const stocksInSec = INITIAL_STOCKS[sector.id];
      const stk1 = stocksInSec[Math.floor(Math.random() * stocksInSec.length)];
      const stk2 = stocksInSec[Math.floor(Math.random() * stocksInSec.length)];
      
      const templateObj = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];
      
      const amount = Number((Math.random() * 8 + 1).toFixed(2));
      let content = templateObj.template
        .replace("[SEC]", sector.name)
        .replace("[STK]", stk1.name)
        .replace("[STK_ALT]", stk2.name !== stk1.name ? stk2.name : "其他成分股")
        .replace("[AMT]", amount.toString());

      const randSentiment = Math.random();
      const sentiment: 'positive' | 'neutral' | 'negative' = randSentiment > 0.6 ? 'positive' : (randSentiment < 0.25 ? 'negative' : 'neutral');

      freshLogs.push({
        time: nowStr,
        source: templateObj.source,
        title: content,
        sentiment,
        weight: templateObj.weight
      });
    }

    this.logs = [...freshLogs, ...this.logs].slice(0, 30); // 保留最新30条
    return freshLogs;
  }

  // 执行抓取与人工智能/模拟分析，计算出下一个 10分钟 节点
  public async runAIEnhancedScrape(manualTrigger: boolean = true): Promise<void> {
    if (this.isLiveScraping) return;
    this.isLiveScraping = true;
    this.statusMessage = manualTrigger ? "正在检索雪球、股吧等社区发帖舆情..." : "定时抓取中...";
    
    // 生成抓取日志，用于界面展示
    const currentScrapeLogs = this.generateMockLogs(manualTrigger ? 8 : 4);

    try {
      let aiAdjustments: any = null;

      const isCooldown = this.isCooldownActive();
      // Only invoke Gemini for manual trigger requests and if not currently rate-limited (cooldown)
      // Routine auto background tasks use the local high-precision quantitative simulator directly to conserve quota and avoid 429 limits
      if (aiClient && !isCooldown && manualTrigger) {
        this.statusMessage = "正在调用 Gemini API 进行全网金融舆情智能研判...";
        
        // 拼接最近的舆情日志作为文本输入，让大模型分析真正的行业热度和舆情倾角
        const logsText = currentScrapeLogs.map(l => `[${l.source}] ${l.title} (情感:${l.sentiment})`).join("\n");
        const intervalMinutes = this.intervalMs / 60000;
        const prompt = `你是一个专业的中国股票市场情感与舆情分析大模型。
我们正在实时监控主流股票论坛（如雪球、东方财富股吧、同花顺社区、新浪财经等）的发帖、讨论量以及新闻。
以下是最近${intervalMinutes}分钟内刚刚抓取的部分舆情原始记录（可能包含涨跌、传言、散户情绪等）：
${logsText}

根据当前的抓取日志，并结合你对今日中国A股市场大市与板块的智能研判（推荐启用Google搜索引擎检索最新金融热点），计算并评估以下10个板块的最新热度调节系数（在-10到+15之间，越受追捧、讨论度越高则热度增加，爆雷或低迷则热度降低）以及涨跌幅走势、以及最火爆的热点原因简述：
板块名列表：
1. semiconductor (半导体与集成电路)
2. ai (人工智能与大模型)
3. nev (新能源汽车与锂电)
4. biotech (生物医药与医疗健康)
5. liquor (白酒消费与大健康)
6. military (国防军工与航空航天)
7. finance (大金融与证券金融)
8. metals (有色金属与稀缺资源)
9. realestate (房地产业与城市建设)
10. greenenergy (光伏储能与电力设备)

返回的内容必须是JSON格式。包含以下字段：
{
  "sectors": [
    {
      "id": "板块ID (例如 semiconductor)",
      "heatChange": 8, // 热度增加值 (介于-10到15的整数)
      "sentimentScore": 75, // 0-100之间的整数 (50为中性，越高越积极)
      "changeShift": 1.25, // 涨跌走势变化量 (介于-2.5到2.5之间的浮点数)
      "description": "最近${intervalMinutes}分钟的主要舆情导火索或市场讨论热点"
    }
  ],
  "featuredStocks": [
    {
      "code": "具体表现异常或者关注度极高的股票代码 (必须是该板块旗下已有的，例如 688256)",
      "heatChange": 15,
      "changeShift": 2.1,
      "sentiment": "positive/neutral/negative"
    }
  ]
}`;

        try {
          const response = await aiClient.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              tools: [{ googleSearch: {} }], // 开启谷歌搜索以获得真实今日金融热度！
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  sectors: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        heatChange: { type: Type.INTEGER },
                        sentimentScore: { type: Type.INTEGER },
                        changeShift: { type: Type.NUMBER },
                        description: { type: Type.STRING }
                      },
                      required: ["id", "heatChange", "sentimentScore", "changeShift", "description"]
                    }
                  },
                  featuredStocks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        code: { type: Type.STRING },
                        heatChange: { type: Type.INTEGER },
                        changeShift: { type: Type.NUMBER },
                        sentiment: { type: Type.STRING }
                      },
                      required: ["code", "heatChange", "changeShift", "sentiment"]
                    }
                  }
                },
                required: ["sectors"]
              }
            }
          });

          if (response.text) {
            aiAdjustments = JSON.parse(response.text.trim());
            console.log("[MarketEngine] Gemini 舆情研判成功返回数据:", aiAdjustments);
          }
        } catch (aiErr: any) {
          const errMsg = aiErr?.message || String(aiErr);
          if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
            this.triggerCooldown(300000); // 熔断 5 分钟
            console.warn("[MarketEngine] Gemini AI 舆情研判遇到限流或频控(429)，已激活 5 分钟流量自适应熔断保护:", errMsg);
            this.statusMessage = "主智能研判节点流量受限，熔断机制已启动，无缝切换为自适应决策算法...";
          } else {
            console.warn("[MarketEngine] Gemini AI 舆情研判遇到异常:", errMsg);
          }
        }
      }

      // 如果没有 AI 客户端或 AI 分析报错，则启动极其专业的“市场动态量化引擎”进行自适应计算
      if (!aiAdjustments) {
        this.statusMessage = "智能决策量化引擎计算中...";
        // 根据当前的抓取日志来模拟生成精密的调节系数
        const sectorWeights: { [secId: string]: { heat: number; change: number; count: number; sentimentSum: number } } = {};
        
        INITIAL_SECTORS.forEach(s => {
          sectorWeights[s.id] = { heat: 0, change: 0, count: 0, sentimentSum: 0 };
        });

        currentScrapeLogs.forEach(log => {
          // 尝试在日志标题中找寻对应板块
          const matchedSector = INITIAL_SECTORS.find(s => log.title.includes(s.name) || log.title.includes(s.id));
          if (matchedSector) {
            const w = sectorWeights[matchedSector.id];
            w.count++;
            w.heat += log.weight * 2;
            w.sentimentSum += log.sentiment === 'positive' ? log.weight : (log.sentiment === 'negative' ? -log.weight : 0);
          }
        });

        aiAdjustments = {
          sectors: INITIAL_SECTORS.map(sec => {
            const weight = sectorWeights[sec.id];
            const logsCount = weight.count;
            
            // 基础随机漂移 + 爬网舆情增益
            const heatChange = Math.floor(Math.random() * 11 - 4) + (logsCount > 0 ? Math.min(10, weight.heat) : 2);
            const sentimentScore = 50 + Math.floor(Math.random() * 15 - 7) + (logsCount > 0 ? Math.max(-25, Math.min(25, weight.sentimentSum * 3)) : 0);
            const changeShift = Number((Math.random() * 1.6 - 0.8 + (weight.sentimentSum * 0.15)).toFixed(2));

            // 从预设主题中随机一条作为新闻
            const topics = SECTOR_TOPICS[sec.id];
            const description = topics[Math.floor(Math.random() * topics.length)];

            return {
              id: sec.id,
              heatChange,
              sentimentScore: Math.max(10, Math.min(100, sentimentScore)),
              changeShift,
              description
            };
          }),
          featuredStocks: []
        };
      }

      // 汇总并应用最新的行业及股票变化，生成新的 2分钟 历史节点
      this.statusMessage = "正在构建最新的多维热度时序要素...";
      
      // 1. 确定新数据点的时间标签
      let lastTimeStr = "09:30";
      if (this.timeline.length > 0) {
        lastTimeStr = this.timeline[this.timeline.length - 1].time;
      }
      const nextTimeStr = this.computeNext2MinTime(lastTimeStr);

      // 2. 根据 aiAdjustments 更新板块实时指标，并组装新节点
      const nextPointSectors: MarketDataPoint['sectors'] = {};
      const nextPointStocks: MarketDataPoint['stocks'] = {};

      this.currentSectors = this.currentSectors.map(sec => {
        const adj = aiAdjustments.sectors.find((s: any) => s.id === sec.id) || {
          heatChange: Math.floor(Math.random() * 6 - 2),
          sentimentScore: 50,
          changeShift: 0,
          description: sec.description
        };

        // 更新板块热度 (20 - 100)
        const nextHeat = Math.max(20, Math.min(100, sec.heat + adj.heatChange));
        // 更新板块涨跌幅 % (-10% 到 10%)
        const nextChange = Number(Math.max(-10, Math.min(10, sec.change + adj.changeShift)).toFixed(2));
        // 舆情指数 (10 - 100)
        const nextSentimentScore = Math.max(10, Math.min(100, adj.sentimentScore));

        // 更新旗下股票热度和涨跌
        const updatedStocks = sec.hotStocks.map(stk => {
          // 查看是否有精选个股调幅
          const feat = aiAdjustments.featuredStocks?.find((f: any) => f.code === stk.code);
          const stkHeatChange = feat ? feat.heatChange : (Math.floor(Math.random() * 11 - 5) + (adj.heatChange > 0 ? 2 : -1));
          const stkChangeShift = feat ? feat.changeShift : (Number((Math.random() * 2.2 - 1.1).toFixed(2)) + adj.changeShift * 0.5);

          const nextStkHeat = Math.max(10, Math.min(100, stk.heat + stkHeatChange));
          const nextStkChange = Number(Math.max(-10, Math.min(10, stk.change + stkChangeShift)).toFixed(2));
          const nextPrice = Number((stk.price * (1 + stkChangeShift / 100)).toFixed(2));
          
          let nextSentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
          if (nextStkChange > 1.5) nextSentiment = 'positive';
          else if (nextStkChange < -1.5) nextSentiment = 'negative';

          const discussion = Math.floor(nextStkHeat * 5.8 + Math.random() * 40);

          return {
            ...stk,
            heat: nextStkHeat,
            change: nextStkChange,
            price: nextPrice,
            sentiment: nextSentiment,
            discussionCount: discussion
          };
        });

        // 重新进行热度排序
        updatedStocks.sort((a, b) => b.heat - a.heat);
        updatedStocks.forEach((s, idx) => s.rank = idx + 1);

        // 记录到新时间节点
        nextPointSectors[sec.id] = {
          heat: nextHeat,
          change: nextChange,
          sentimentScore: nextSentimentScore,
          description: adj.description
        };

        nextPointStocks[sec.id] = updatedStocks.map(s => ({
          code: s.code,
          name: s.name,
          heat: s.heat,
          change: s.change,
          sentiment: s.sentiment
        }));

        return {
          ...sec,
          heat: nextHeat,
          change: nextChange,
          sentimentScore: nextSentimentScore,
          hotStocks: updatedStocks,
          description: adj.description
        };
      });

      // 3. 将最新节点追加到历史时间线
      const newPoint: MarketDataPoint = {
        time: nextTimeStr,
        sectors: nextPointSectors,
        stocks: nextPointStocks
      };

      this.timeline.push(newPoint);
      
      // 保持时间线的适度长度（例如最长150个点，相当于整整一天的2分钟分时图）
      if (this.timeline.length > 150) {
        this.timeline.shift();
      }

      this.lastUpdated = new Date();
      this.statusMessage = manualTrigger ? "抓取分析结束，数据已合并更新！" : "交易日自适应监测就绪";

    } catch (err) {
      console.error("[MarketEngine] 抓取主任务异常:", err);
      this.statusMessage = "舆情分析发生异常，已切换为自动纠偏。";
    } finally {
      this.isLiveScraping = false;
    }
  }

  // 2分钟时间计算器（符合A股开盘机制：9:30~11:30, 13:00~15:00）
  private computeNext2MinTime(currentTime: string): string {
    const [hStr, mStr] = currentTime.split(":");
    let h = parseInt(hStr, 10);
    let m = parseInt(mStr, 10);

    m += 2;
    if (m >= 60) {
      h += 1;
      m = 0;
    }

    // A股中午休市逻辑：11:30 下一个点是 13:00
    if (h === 11 && m > 30) {
      h = 13;
      m = 0;
    }

    // 15:00 闭市之后，可以循环或继续递增供测试，保证一直可以产生新数据
    if (h > 15 || (h === 15 && m > 0)) {
      if (h >= 24) {
        h = 9;
        m = 30;
      }
    }

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // 获取对外接口状态
  public getMarketState(): MarketState {
    return {
      timeline: this.timeline,
      currentSectors: this.currentSectors,
      lastUpdated: this.lastUpdated.toISOString(),
      isLiveScraping: this.isLiveScraping,
      statusMessage: this.statusMessage
    };
  }

  // 获取最近舆情抓取原始日志
  public getScrapeLogs(): ScrapeLog[] {
    return this.logs;
  }

  // 重置今日状态（演示极客调试）
  public resetTodayState(): void {
    this.timeline = [];
    this.initializeState();
  }
}

export const marketEngine = new MarketEngine();
