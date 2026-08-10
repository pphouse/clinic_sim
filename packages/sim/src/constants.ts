/**
 * シミュレーション定数。
 *
 * 全て会話内で構築した検証モデル（med_sim2.xlsx）の前提値。仮置きであり、
 * 実在の診療報酬点数・給与水準・学費ではない。
 *
 * ★刻みは 1 ヶ月。検証モデルは四半期で作られていたので、
 *   **四半期で検証された値をここで月に割っている。** 割り方は2種類あり、混ぜてはいけない：
 *
 *   フロー量（金額・人数・日数）  → 3 で割る。3ヶ月足すと元の四半期値に戻る
 *   率（離脱・離職・回帰・金利）  → 複利で割る。1-(1-r)^(1/3)。3ヶ月かけて元の率になる
 *
 *   率を単純に 3 で割ると 3 ヶ月後に元より多く減る。ここを間違えると
 *   検証済みの挙動から静かにズレる。monthlyFromQuarterly() を必ず通すこと。
 */
import type {
  Addon,
  ClinicConfig,
  ClinicId,
  EmrTier,
  ExternalRelationId,
  FeeRevision,
  GoalSpec,
  Man,
} from './types';

export const MONTHS_PER_YEAR = 12;
export const MONTHS_PER_QUARTER = 3;
export const TOTAL_MONTHS = 120; // 10年

/**
 * 四半期あたりの率を1ヶ月あたりに直す。
 * 3ヶ月複利で掛けると元の四半期率に戻る（例：4%/四半期 → 1.3515%/月）。
 */
export function monthlyFromQuarterly(quarterlyRate: number): number {
  return 1 - Math.pow(1 - quarterlyRate, 1 / MONTHS_PER_QUARTER);
}

/** 四半期あたりの利率を1ヶ月あたりに直す（増える側の複利） */
export function monthlyRateFromQuarterly(quarterlyRate: number): number {
  return Math.pow(1 + quarterlyRate, 1 / MONTHS_PER_QUARTER) - 1;
}

// --- 診察キャパシティ
/** 検証モデルは 60日/四半期 */
export const CLINIC_DAYS_PER_MONTH = 60 / MONTHS_PER_QUARTER;
export const VISITS_PER_DOCTOR_PER_DAY = 32;
/** 検証モデルは 1.6回/四半期。慢性疾患でも毎月は来ない */
export const VISITS_PER_PATIENT_PER_MONTH = 1.6 / MONTHS_PER_QUARTER;

// --- 患者ストックの挙動（★中核）
/** 検証モデルの離脱率（四半期あたり）。この式は変えない */
export const BASE_CHURN_RATE_PER_QUARTER = 0.04;
/** 許容待ち時間の超過1分あたり、四半期の離脱率に上乗せされる率（月への変換前） */
export const CHURN_PER_EXCESS_MINUTE_PER_QUARTER = 0.0025;

export const TOLERABLE_WAIT_MINUTES = 20;
export const CONGESTION_EXPONENT = 2.5;
export const BASE_WAIT_MINUTES = 15;

/** 超過1分あたり評判が削られる pt。検証モデルは 0.6/四半期 */
export const REPUTATION_PENALTY_PER_MINUTE = 0.6 / MONTHS_PER_QUARTER;
/** 基準評判へ戻る速さ。検証モデルは 0.15/四半期。これが小さいので回復が遅い */
export const REPUTATION_RECOVERY_RATE = monthlyFromQuarterly(0.15);
export const BASELINE_REPUTATION = 75;
export const INITIAL_REPUTATION = 75;
export const REPUTATION_MIN = 20;
export const REPUTATION_MAX = 100;

/**
 * ★新規患者が何ヶ月前の評判で決まるか。遅延の源泉①。
 *
 * 検証モデルでは「前四半期の評判」だった。月刻みにしたときこれを 1ヶ月にすると
 * 遅延が 1/3 に縮んで、検証済みの手触り（悪化が患者減として出るまで1年）が壊れる。
 * 同じ3ヶ月を保つ。
 */
export const NEW_PATIENT_REPUTATION_LAG_MONTHS = 3;

// --- 収益
export const POINTS_PER_VISIT = 750;
export const YEN_PER_POINT = 10;
/** 患者1人あたり月の自費診療単価（円）。検証モデルは 1,800円/四半期 */
export const SELF_PAY_YEN_PER_PATIENT = 1800 / MONTHS_PER_QUARTER;
export const YEN_PER_MAN = 10000;

// --- 人材
export const DOCTOR_COST_PER_MONTH = 500 / MONTHS_PER_QUARTER;
export const NURSE_COST_PER_MONTH = 125 / MONTHS_PER_QUARTER;
export const NURSES_PER_DOCTOR = 2.5;
export const NURSE_ATTRITION_RATE = monthlyFromQuarterly(0.05);
/** 全社合計。ここが最大のボトルネック */
export const NURSE_MARKET_HIRES_PER_MONTH = 1.2 / MONTHS_PER_QUARTER;
export const AGENCY_FEE_PER_DOCTOR = 500;

// --- 医局
export const RELATION_PER_IGYOKU_SLOT = 20;
export const RELATION_DECAY_PER_MONTH = 2 / MONTHS_PER_QUARTER;
export const IGYOKU_RELATION_COST_PER_MONTH = 120 / MONTHS_PER_QUARTER;

// --- 看護学校
export const SCHOOL_CAPEX = 25000;
export const SCHOOL_OPERATING_PER_MONTH = 1500 / MONTHS_PER_QUARTER;
export const SCHOOL_CLASS_SIZE = 40;
export const SCHOOL_TUITION_PER_YEAR = 60;
export const SCHOOL_YEARS = 3;
export const SCHOOL_GRADUATION_RATE = 0.85;
/** 残りは他院へ流出する */
export const SCHOOL_RETENTION_RATE = 0.35;

// --- コスト・財務
export const SUPPLIES_RATE = 0.18;
export const CLINIC_FIXED_COST_PER_MONTH = 450 / MONTHS_PER_QUARTER;
export const HQ_COST_PER_MONTH = 250 / MONTHS_PER_QUARTER;
export const CLINIC_CAPEX = 6000;
export const INITIAL_CASH = 15000;
export const CLINIC_LOAN = 8000;
export const SCHOOL_LOAN = 25000;
export const LOAN_MONTHLY_RATE = monthlyRateFromQuarterly(0.005);
export const LOAN_REPAYMENT_RATE = monthlyFromQuarterly(0.025);

// --- 会計（エクセルには無かった。ここで新設）
/** 医療機器 5年 */
export const USEFUL_LIFE_EQUIPMENT = 60;
/** 内装 10年 */
export const USEFUL_LIFE_INTERIOR = 120;
/** 校舎 20年 */
export const USEFUL_LIFE_BUILDING = 240;
/** 開業投資のうち医療機器が占める割合。残りは内装 */
export const CLINIC_CAPEX_EQUIPMENT_SHARE = 0.6;
/**
 * レセプトの入金遅れ。翌月10日提出・翌々月入金なので、常に約2ヶ月分が滞留する。
 * 月刻みにしたことで、検証モデルの 0.67四半期 という半端な値が実態そのものになった。
 */
export const RECEIVABLE_MONTHS = 2;
export const CORPORATE_TAX_RATE = 0.3;

export const CLINICS: ClinicConfig[] = [
  { id: 'A', name: 'A院（本院）', openMonth: 1, newPatientPotential: 150 / MONTHS_PER_QUARTER, initialPatientStock: 3200 },
  { id: 'B', name: 'B院', openMonth: 19, newPatientPotential: 130 / MONTHS_PER_QUARTER, initialPatientStock: 0 },
  { id: 'C', name: 'C院', openMonth: 43, newPatientPotential: 110 / MONTHS_PER_QUARTER, initialPatientStock: 0 },
];

/** 改定は偶数年の4月に施行される。月1＝1年目4月なので、13・37・61…が4月にあたる */
export const FEE_REVISIONS: FeeRevision[] = [
  { id: 'rev1', name: '改定#1', effectiveMonth: 13, rate: -0.04 },
  { id: 'rev2', name: '改定#2', effectiveMonth: 37, rate: 0.03 },
  { id: 'rev3', name: '改定#3', effectiveMonth: 61, rate: -0.05 },
  { id: 'rev4', name: '改定#4', effectiveMonth: 85, rate: 0.02 },
  { id: 'rev5', name: '改定#5', effectiveMonth: 109, rate: -0.03 },
];

/**
 * 加算。検証の結果、このゲームの実質的な主戦場はここだと分かっている。
 * 5つ揃うと点数が +19% 乗り、改定のマイナス(-5%)を打ち消してしまう。
 *
 * 名称は検証モデルのもので、実在の加算名とは一致しない
 * （実在は「生活習慣病管理料」「医療DX推進体制整備加算」など）。
 */
export const ADDONS: Addon[] = [
  { id: 'kinou', name: '機能強化加算', effect: 0.03, acquisitionCost: 800, requiredDoctors: 3, requiredNurseSufficiency: 0.9, expiresAtMonth: 121 },
  { id: 'zaitaku', name: '在宅療養支援加算', effect: 0.06, acquisitionCost: 2500, requiredDoctors: 5, requiredNurseSufficiency: 0.95, expiresAtMonth: 121 },
  { id: 'seikatsu', name: '生活習慣病管理加算', effect: 0.05, acquisitionCost: 1200, requiredDoctors: 4, requiredNurseSufficiency: 0.9, expiresAtMonth: 121 },
  { id: 'jikangai', name: '時間外対応加算', effect: 0.02, acquisitionCost: 600, requiredDoctors: 6, requiredNurseSufficiency: 0.9, expiresAtMonth: 121 },
  { id: 'dx', name: '医療DX推進加算', effect: 0.03, acquisitionCost: 1500, requiredDoctors: 5, requiredNurseSufficiency: 0.85, expiresAtMonth: 121 },
];

// ==================================================================
// ★ここから下は検証モデル（med_sim2.xlsx）に無い新規追加。
//
// **全て既定でオフ。** 既定シナリオは一切使わないので、
// 追加しても baseline.golden.json / baseline.monthly.json の数字は動かない。
// 検証済みの核を壊さずに系を足すための約束であり、破ってはいけない。
//
// ここの数値は**検証されていない**。表計算で確かめた値ではなく、
// 「この方向に効く」という設計意図だけが根拠。調整の余地しかない。
// ==================================================================

// --- 外部関係（地域医師会・連携基幹病院・ケアマネ）
//
// 3つとも「毎月活動すると関係が育ち、やめると錆びる」という同じ形にした。
// **効き先を変えることで別物にしている。** 形まで変えると覚えることが3倍になる。

export interface ExternalRelationSpec {
  id: ExternalRelationId;
  name: string;
  /** 活動を続けている月の費用 */
  monthlyCost: Man;
  /** 活動した月の上昇 */
  gainPerMonth: number;
  /** 活動しなかった月の低下 */
  decayPerMonth: number;
  max: number;
  /** この関係が何に効くか。UI がそのまま出す */
  effect: string;
}

export const EXTERNAL_RELATIONS: ExternalRelationSpec[] = [
  {
    id: 'medicalAssociation',
    name: '地域医師会',
    monthlyCost: 15,
    gainPerMonth: 1.5,
    decayPerMonth: 0.5,
    max: 100,
    effect: '休日当番医・学校医・自治体健診の受託。収入になるが診察枠を食う',
  },
  {
    id: 'referralHospital',
    name: '連携基幹病院',
    monthlyCost: 25,
    gainPerMonth: 1.2,
    decayPerMonth: 0.6,
    max: 100,
    effect: '紹介患者。新規患者ポテンシャルが最大 +25%',
  },
  {
    id: 'careManager',
    name: 'ケアマネ・地域包括',
    monthlyCost: 20,
    gainPerMonth: 1.4,
    decayPerMonth: 0.5,
    max: 100,
    effect: '在宅の紹介。単価は上がるが訪問で診察枠を食う',
  },
];

/**
 * ここを割ると受託が回ってこない水準。
 * 「顔を出していない先生には当番を振らない」という閾値であって、
 * 開院の可否ではない（開院を関係値で止めると、既定シナリオの開院月が動いて
 * 検証済みの結果が壊れる）。
 */
export const MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD = 50;
/** 受託収入。関係値1あたり万円/月。関係100で 30万/月 */
export const MEDICAL_ASSOCIATION_REVENUE_PER_POINT = 0.3;
/** 当番医に出る分、自院の診察枠が落ちる。関係100で −8% */
export const MEDICAL_ASSOCIATION_CAPACITY_DRAG = 0.08;
/**
 * 分院を開くと関係値が下がる。**拡大そのものが成長ブレーキになる。**
 * 地域の同業者からすれば、チェーンの分院は競合の出店でしかない。
 */
export const MEDICAL_ASSOCIATION_OPENING_PENALTY = 8;
/** 連携度100のときの新規患者の上乗せ */
export const REFERRAL_MAX_UPLIFT = 0.25;
/** ケアマネ関係100のときの在宅比率 */
export const CARE_MANAGER_MAX_HOME_SHARE = 0.3;
/** 在宅患者の自費単価の上乗せ（在宅比率にかかる） */
export const HOME_CARE_SELF_PAY_UPLIFT = 1.2;
/** 在宅は訪問に時間を食う。在宅比率あたり診察枠が落ちる率 */
export const HOME_CARE_CAPACITY_DRAG = 0.25;

// --- 門前薬局
/** 誘致の一時金 */
export const PHARMACY_INVITE_CAPEX = 1200;
/** 定額の賃料 */
export const PHARMACY_BASE_RENT = 60;
/** 患者1人あたりの歩合賃料（万円/月） */
export const PHARMACY_RENT_PER_PATIENT = 0.008;

// --- 不動産（テナント→自社保有）
/** 1院ぶんの物件価格 */
export const PROPERTY_PRICE = 9000;
/**
 * 院の固定費のうち家賃が占める割合。
 * 保有に切り替えるとこの分が消え、代わりに建物の減価償却が乗る。
 */
export const CLINIC_RENT_SHARE = 0.5;

// --- 個人資産
/**
 * 役員報酬の上限（万円/月）。青天井にすると法人を空にできてしまう。
 * 年 6,000 万。数院を持つ医療法人の理事長として不自然でない上限にしてある。
 */
export const EXECUTIVE_SALARY_MAX = 500;
/** 役員報酬にかかる個人の税・社会保険。手取りはこの分だけ減る */
export const PERSONAL_TAX_RATE = 0.45;

export interface PersonalAssetSpec {
  id: string;
  name: string;
  price: Man;
  /** 見栄の点数。合計で称号が決まる */
  prestige: number;
  note: string;
}

/**
 * 見栄レイヤー。**法人の数字には一切効かない。**
 *
 * 効かせたくなるが、効かせた瞬間に「クルーザーを買うと患者が増える」という
 * 嘘の因果ができる。ここは進捗を測る物差しであって、意思決定ではない。
 */
export const PERSONAL_ASSETS: PersonalAssetSpec[] = [
  { id: 'watch', name: '機械式時計', price: 300, prestige: 5, note: '学会で目に入る' },
  { id: 'car', name: 'ドイツ車', price: 1200, prestige: 12, note: '駐車場に置く' },
  { id: 'villa', name: '軽井沢の別荘', price: 8000, prestige: 30, note: '夏に行かない' },
  { id: 'house', name: '都心のマンション', price: 12000, prestige: 40, note: '住む' },
  { id: 'cruiser', name: 'クルーザー', price: 20000, prestige: 60, note: '維持費は聞かない' },
];

/** 見栄の点数から称号を引く表。上から順に見て、最初に届いたものを使う */
export const PERSONAL_RANKS: { minPrestige: number; label: string }[] = [
  { minPrestige: 100, label: '医療法人グループ総帥' },
  { minPrestige: 60, label: '地域の名士' },
  { minPrestige: 30, label: '開業医としては成功' },
  { minPrestige: 10, label: '人並みの院長' },
  { minPrestige: 0, label: '働きづめの勤務医' },
];

// --- 医療機器（システム・機器商社の1タブ目）
export interface EquipmentSpec {
  id: string;
  name: string;
  price: Man;
  /** 自費診療収入への上乗せ率。故障中は失われる */
  selfPayUplift: number;
}

/**
 * 機器は診察枠を増やさない。**自費収入だけを増やす。**
 * 枠を増やす手段（医師・AI）と効き先を分けておかないと、
 * 「とりあえず全部買う」が最適解になって判断が消える。
 */
export const EQUIPMENT_CATALOG: EquipmentSpec[] = [
  { id: 'xray', name: 'デジタルX線', price: 1200, selfPayUplift: 0.08 },
  { id: 'endoscope', name: '内視鏡', price: 2400, selfPayUplift: 0.15 },
  { id: 'ct', name: 'CT', price: 6000, selfPayUplift: 0.25 },
];

/** 保守未加入の機器が1ヶ月に壊れる確率 */
export const BREAKDOWN_CHANCE_PER_MONTH = 0.02;

// ==================================================================
// 設備・システム（docs/spec/screens/vendor.md）
// エクセルの検証モデルには無い。新規追加のため、ゴールデンテストの対象外。
// 実装したら vendor.test.ts で個別に検証すること。
// ==================================================================

/** リースは購入より総額で 15% 割高。代わりに資産計上せず現金が平準化される */
export const LEASE_PREMIUM = 0.15;
export const LEASE_TERM_MONTHS = 60;
/** 保守契約の年額。機器価格に対する率 */
export const MAINTENANCE_RATE = 0.08;
/** 保守未加入で故障したときの復旧までの月数 */
export const BREAKDOWN_REPAIR_MONTHS = 6;

export interface EmrTierSpec {
  id: EmrTier;
  name: string;
  upfrontCost: number;
  /** 1ヶ月あたりの保守料 */
  recurringCost: number;
  /** 法人統合に対応するか。false だと分院を跨いだ運用ができない */
  supportsMultiSite: boolean;
  /** 医療DX推進加算の要件を満たすか */
  satisfiesDxAddon: boolean;
  /** 移行時に診察枠が落ちる率 */
  migrationCapacityPenalty: number;
  /** 枠が落ちている月数 */
  migrationPenaltyMonths: number;
}

/**
 * カルテ移行は「プレイヤーが自分で起こす医師不足」。
 * 診察枠が落ちる → 待ち時間 → 評判 → 1年後に患者ストック、という
 * 検証済みの経路をそのまま通る。
 */
export const EMR_TIERS: EmrTierSpec[] = [
  { id: 'single',     name: '単院向け',     upfrontCost: 300,  recurringCost: 15, supportsMultiSite: false, satisfiesDxAddon: false, migrationCapacityPenalty: 0,    migrationPenaltyMonths: 0 },
  { id: 'chain',      name: 'チェーン対応', upfrontCost: 1500, recurringCost: 60, supportsMultiSite: true,  satisfiesDxAddon: true,  migrationCapacityPenalty: 0.20, migrationPenaltyMonths: 6 },
  { id: 'enterprise', name: '大手統合',     upfrontCost: 4000, recurringCost: 150, supportsMultiSite: true, satisfiesDxAddon: true,  migrationCapacityPenalty: 0.25, migrationPenaltyMonths: 9 },
];

/** 移行費用の基準となる患者データ量。遅らせるほど高くつく */
export const EMR_MIGRATION_BASE_PATIENTS = 3000;

/**
 * 移行費用はデータ量に比例する。これがロックイン。
 * 序盤に安物を選ぶと、中盤で身動きが取れなくなる。
 */
export function emrMigrationCost(tier: EmrTierSpec, totalPatientStock: number): number {
  return tier.upfrontCost * (1 + totalPatientStock / EMR_MIGRATION_BASE_PATIENTS);
}

export interface AiToolSpec {
  id: string;
  name: string;
  upfrontCost: number;
  recurringCost: number;
  /** 医師1人1日あたりの診察可能数への上乗せ */
  visitsPerDoctorPerDayBonus: number;
}

/**
 * ★設計上の要点：AI は診察枠を増やすが、施設基準の「必要医師数」にはカウントされない。
 *
 * 常勤医1名 = +32人/日 かつ 施設基準を満たす
 * AI        = +3〜4人/日 で 施設基準は満たさない（コストは桁違いに安い）
 *
 * 安く捌けるようになるのに点数は上がらない、という歪みがこの機能の存在理由。
 * この非対称を消すと、AI はただの「効率化ボタン」になって判断が消える。
 */
export const AI_TOOLS: AiToolSpec[] = [
  { id: 'triage',   name: '問診AI',     upfrontCost: 400,  recurringCost: 10, visitsPerDoctorPerDayBonus: 3 },
  { id: 'imaging',  name: '画像診断AI', upfrontCost: 1200, recurringCost: 20, visitsPerDoctorPerDayBonus: 4 },
];

// ==================================================================
// ゴール・終局・突発事象・分院の候補地
//
// ここも検証モデルには無い。**「いつ終わるか」と「何をもって勝ちか」は
// 表計算では決められなかった部分**で、ゲームとして遊べるようにするために足した。
// ==================================================================

/**
 * ゴールは3本立てで、**互いに食い合う**ようにしてある。
 *
 *   個人資産 ← 役員報酬。取れば取るほど法人が痩せる
 *   規模     ← 分院。出せば出すほど現金が消え、医師会の関係も落ちる
 *   法人価値 ← 内部留保。個人へ移さず、分院にも使わず、貯めた分だけ増える
 *
 * どれか1つでも届けば上がり。**3本同時に狙うと1本も届かない**という配分にしてある。
 * 「正解の勝ち筋」を1つに決めてしまうと、経営の判断がパズルの正解探しになる。
 */
// ★目標値は**このモデルで実際に届く水準**に合わせて置いた。
// 初期資本 1.5 億、A院の患者 3,200 人から始めて 10 年。
// 検証済みの数式は「拡大するほど儲かる」形をしていない（枠を先に買うと死ぬ）ので、
// 「10院に増やす」ような目標を置くと、どの遊び方でも届かない飾りになる。
// 実際の到達点を測ってから決めた数字であり、**理想でも願望でもない。**
export const GOALS: GoalSpec[] = [
  {
    id: 'personalWealth',
    name: '資産家',
    description: '院長個人の資産（現金＋見栄資産）を 1.5 億円まで積む',
    target: 15000,
    unit: '万円',
  },
  {
    id: 'scale',
    name: '規模',
    description: '全社の通院患者を 8,000 人まで増やす',
    target: 8000,
    unit: '人',
  },
  {
    id: 'corporate',
    name: '内部留保',
    // ★純資産ではなく**内部留保**（＝利益の蓄積）で測る。
    // 純資産だと開始時点の資本金 1.5 億がそのまま乗ってしまい、
    // 「何もしない」が達成率 62% になる。測りたいのは10年で何を積んだか
    description: '10年で内部留保（利益の蓄積）を 5,000 万円積む',
    target: 5000,
    unit: '万円',
  },
];

/**
 * 債務超過が何ヶ月続いたら終わりか。
 *
 * ★1ヶ月で終わらせない理由：検証で分かったとおり、看護学校の 2.5 億は
 * 費用ではなく校舎という資産で、あのときの「最低現金 −1.8億」は
 * **債務超過ではなく資金繰りの谷**だった。谷で殺すと、正しい大型投資が全部
 * 悪手になってしまう。1年沈みっぱなしなら、それはもう谷ではない。
 */
export const BANKRUPTCY_GRACE_MONTHS = 12;

/** 終局の称号。達成率の合計から引く。上から見て最初に届いたもの */
export const ENDING_TITLES: { minScore: number; title: string }[] = [
  { minScore: 2.5, title: '医療法人グループ総帥' },
  { minScore: 1.5, title: '地域一番の経営者' },
  { minScore: 1.0, title: '目標を達成した院長' },
  { minScore: 0.6, title: '堅実な開業医' },
  { minScore: 0.3, title: '生き延びた院長' },
  { minScore: 0, title: '志半ばの院長' },
];

// --- 分院の候補地
//
// 「どこに出すか」を選ばせるために、ポテンシャルと承継の有無を振ってある。
// **承継は患者が付いてくる代わりに高い。** 新規は安いが評判が育つまで空く。

export interface ClinicSite {
  id: ClinicId;
  name: string;
  /** 一言で立地の性格。UI がそのまま出す */
  character: string;
  newPatientPotential: number;
  /** 承継なら引き継ぐ患者数 */
  initialPatientStock: number;
  capex: Man;
  /** 開院時に引ける融資 */
  loan: Man;
}

export const CLINIC_SITES: ClinicSite[] = [
  {
    id: 'B',
    name: 'B院（駅前）',
    character: '人通りは多いが家賃も高い。新規開業',
    newPatientPotential: 130 / MONTHS_PER_QUARTER,
    initialPatientStock: 0,
    capex: 6000,
    loan: 8000,
  },
  {
    id: 'C',
    name: 'C院（住宅地）',
    character: '落ち着いた住宅地。新規開業',
    newPatientPotential: 110 / MONTHS_PER_QUARTER,
    initialPatientStock: 0,
    capex: 6000,
    loan: 8000,
  },
  {
    id: 'D',
    name: 'D院（承継）',
    character: '引退する先生の医院を引き継ぐ。患者が付いてくるが高い',
    newPatientPotential: 90 / MONTHS_PER_QUARTER,
    initialPatientStock: 1800,
    capex: 11000,
    loan: 12000,
  },
  {
    id: 'E',
    name: 'E院（新興住宅地）',
    character: '若い世帯が増えている。伸びしろは大きい',
    newPatientPotential: 160 / MONTHS_PER_QUARTER,
    initialPatientStock: 0,
    capex: 7000,
    loan: 9000,
  },
];

// --- 医局への当直派遣
//
// 関係値を上げる手段。**金では買えない**（IGYOKU_RELATION_COST_PER_MONTH は
// 下がらないようにするための費用であって、上げるためのものではない）。
// 代わりに診察枠を差し出す。外部関係と同じ「続けると育ち、やめると止まる」形。
/** 当直を引き受けている月の関係値の上昇 */
export const IGYOKU_DUTY_GAIN_PER_MONTH = 1;
/** そのあいだ落ちる診察枠。医師が大学の当直に出ている分 */
export const IGYOKU_DUTY_CAPACITY_DRAG = 0.05;

// --- 銀行（プレイヤーが引く借入）
/** 1回に引ける額 */
export const BANK_LOAN_UNIT = 5000;
/** 純資産に対して何倍まで借りられるか。ここを超えると銀行が首を縦に振らない */
export const BANK_LEVERAGE_LIMIT = 4;

// --- 突発事象
//
// ★全て features.randomEvents がオンのときだけ引く。
// 既定シナリオはオフなので、検証済みの 120 ヶ月は一度も乱数を引かない。

/** 常勤医1名が1ヶ月に辞める確率 */
export const DOCTOR_RESIGN_CHANCE = 0.005;
/** 看護師の突発離職が起きる確率と、そのときに抜ける人数 */
export const NURSE_EXODUS_CHANCE = 0.012;
export const NURSE_EXODUS_COUNT = 3;
/** 近隣に競合が開業する確率。その院の新規患者ポテンシャルが恒久的に落ちる */
export const COMPETITOR_CHANCE = 0.005;
export const COMPETITOR_POTENTIAL_LOSS = 0.15;
/** 厚生局の個別指導。加算を多く持っているほど返還額が大きい */
export const AUDIT_CHANCE = 0.008;
/** 返還請求額＝有効な加算の合計率 × 保険診療収入 × この倍率 */
export const AUDIT_CLAWBACK_MONTHS = 6;
/** 感染症の流行。需要が増えるが、枠が足りなければ待ち時間に化ける */
export const EPIDEMIC_CHANCE = 0.02;
export const EPIDEMIC_DEMAND_UPLIFT = 0.2;
export const EPIDEMIC_MONTHS = 3;
