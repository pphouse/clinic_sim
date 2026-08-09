/**
 * シミュレーション核の型定義。
 *
 * 金額は全て「万円」単位の number。表示時に円へ変換する。
 * 時刻は四半期インデックス（1 始まり）のみ。Date を使わない。
 */

// ---------------------------------------------------------------- 基本

/** 四半期インデックス（1 = Y1Q1） */
export type Quarter = number;

/** 万円単位の金額 */
export type Man = number;

export type ClinicId = string;

/** 決定的な乱数。seed から作る。Math.random() は使わない */
export interface Rng {
  next(): number;
  int(minInclusive: number, maxExclusive: number): number;
  /** 確率 p で true */
  chance(p: number): boolean;
}

// ---------------------------------------------------------------- 診療所

export interface ClinicConfig {
  id: ClinicId;
  name: string;
  /** 開院する四半期 */
  openQuarter: Quarter;
  /** 四半期あたりの新規患者ポテンシャル（評判 75 のとき） */
  newPatientPotential: number;
  /** 承継開業なら引き継ぐ患者数。新規開業は 0 */
  initialPatientStock: number;
}

export interface ClinicState {
  id: ClinicId;
  /** 通院患者ストック。このゲームの実体資産 */
  patientStock: number;
  /** 評判 20〜100。落ちるのは速く、戻るのは遅い */
  reputation: number;
  doctors: number;
}

/** 1 四半期の診療所シミュレーション結果 */
export interface ClinicTick {
  id: ClinicId;
  newPatients: number;
  patientStock: number;
  /** 診察の需要（延べ回数） */
  demandVisits: number;
  /** 医師数から決まる枠 */
  capacity: number;
  /** capacity × 看護師充足率。実際に診られる上限 */
  effectiveCapacity: number;
  utilization: number;
  waitMinutes: number;
  reputation: number;
  churnRate: number;
  /** MIN(需要, 実効枠)。捌けなかった分は収益にならない */
  visitsServed: number;
  insuranceRevenue: Man;
  selfPayRevenue: Man;
  operatingCost: Man;
  operatingIncome: Man;
}

// ---------------------------------------------------------------- 人材

export interface StaffTick {
  doctorsByClinic: Record<ClinicId, number>;
  doctorsTotal: number;
  /** 医局関係値 0〜120。金では買えない */
  igyokuRelation: number;
  /** 関係値から決まる派遣枠 */
  igyokuSlots: number;
  /** 紹介会社経由の累計採用数 */
  agencyHiresCumulative: number;
  doctorsProcurable: number;
  /** 計画医師数 > 調達可能数 */
  doctorShortfall: boolean;

  nurses: number;
  nursesRequired: number;
  /** MIN(1, 在籍 / 必要)。1 未満だと診察枠が絞られる */
  nurseSufficiency: number;
  nursesFromSchool: number;
  nursesFromMarket: number;
}

// ---------------------------------------------------------------- 診療報酬

export interface FeeRevision {
  id: string;
  name: string;
  effectiveQuarter: Quarter;
  /** 基礎点数の変動率。-0.04 = 4% 減 */
  rate: number;
}

export interface Addon {
  id: string;
  name: string;
  /** 点数への上乗せ率 */
  effect: number;
  acquisitionCost: Man;
  /** 施設基準：必要な全社医師数 */
  requiredDoctors: number;
  /** 施設基準：必要な看護師充足率 */
  requiredNurseSufficiency: number;
  /** 制度上の期限 */
  expiresAtQuarter: Quarter;
}

export interface AddonStatus {
  id: string;
  acquired: boolean;
  acquiredAtQuarter: Quarter | null;
  /** 要件を満たしていて、かつ期限内 */
  active: boolean;
  /** 取得済みだが要件を割って落ちている */
  lapsedByRequirement: boolean;
}

export interface FeeTick {
  /** 改定の累積。基準 100 */
  feePointIndex: number;
  /** 有効な加算の合計率 */
  addonTotal: number;
  /** feePointIndex × (1 + addonTotal) */
  effectiveFeeIndex: number;
  addons: AddonStatus[];
}

// ---------------------------------------------------------------- 会計
//
// エクセルの検証モデルには B/S が無く、開業投資を即時費用処理していた。
// ここでは資産計上して減価償却する。看護学校の 2.5 億は費用ではなく校舎という資産。

export type AssetClass = 'medicalEquipment' | 'interior' | 'building' | 'intangible';

/** 減価償却の対象。定額法 */
export interface FixedAsset {
  id: string;
  name: string;
  assetClass: AssetClass;
  acquiredAtQuarter: Quarter;
  acquisitionCost: Man;
  /** 耐用年数（四半期数）。医療機器 20Q、内装 40Q、校舎 80Q */
  usefulLifeQuarters: number;
  /** 残存簿価 */
  bookValue: Man;
}

export interface Loan {
  id: string;
  name: string;
  principal: Man;
  outstanding: Man;
  /** 四半期あたりの金利 */
  quarterlyRate: number;
  /** 残高に対する四半期あたりの元金返済率 */
  quarterlyRepaymentRate: number;
}

/** 損益計算書 */
export interface IncomeStatement {
  /** 保険診療収入 */
  insuranceRevenue: Man;
  /** 自費診療収入 */
  selfPayRevenue: Man;
  /** 学費収入（看護学校） */
  tuitionRevenue: Man;
  /** 賃料収入（門前薬局など） */
  rentalRevenue: Man;
  totalRevenue: Man;

  /** 医薬品・診療材料費 */
  medicalSupplies: Man;
  /** 医師人件費 */
  doctorPayroll: Man;
  /** 看護師人件費 */
  nursePayroll: Man;
  /** その他人件費 */
  otherPayroll: Man;
  /** 地代家賃 */
  rent: Man;
  /** 減価償却費。B/S と連動する */
  depreciation: Man;
  /** 学校運営費 */
  schoolOperating: Man;
  /** 紹介会社手数料 */
  agencyFees: Man;
  /** 医局関係維持費 */
  igyokuRelationCost: Man;
  /** 本部費 */
  headquarters: Man;
  totalExpenses: Man;

  operatingIncome: Man;
  interestExpense: Man;
  ordinaryIncome: Man;
  /** 返還請求など（厚生局の指導） */
  extraordinaryLoss: Man;
  pretaxIncome: Man;
  tax: Man;
  netIncome: Man;
}

/** 貸借対照表。assets === liabilities + equity を必ず満たす */
export interface BalanceSheet {
  // 資産
  cash: Man;
  /** 医業未収金。レセプトは約 2 ヶ月遅れで入金される */
  accountsReceivable: Man;
  inventory: Man;
  currentAssets: Man;

  /** 減価償却後の簿価合計 */
  fixedAssets: Man;
  fixedAssetsByClass: Record<AssetClass, Man>;
  totalAssets: Man;

  // 負債
  accountsPayable: Man;
  /** 1 年以内返済の借入 */
  shortTermDebt: Man;
  longTermDebt: Man;
  totalLiabilities: Man;

  // 純資産
  paidInCapital: Man;
  retainedEarnings: Man;
  totalEquity: Man;
}

/** キャッシュフロー計算書（間接法） */
export interface CashFlowStatement {
  netIncome: Man;
  depreciation: Man;
  /** 医業未収金の増減。増えると現金は減る */
  changeInReceivables: Man;
  changeInPayables: Man;
  operatingCashFlow: Man;

  /** 設備投資。マイナスで持つ */
  capitalExpenditure: Man;
  investingCashFlow: Man;

  newBorrowing: Man;
  principalRepayment: Man;
  financingCashFlow: Man;

  netChangeInCash: Man;
  cashAtEnd: Man;
}

export interface FinancialStatements {
  quarter: Quarter;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

// ---------------------------------------------------------------- 全体

export interface GameState {
  quarter: Quarter;
  rngSeed: number;
  clinics: ClinicState[];
  igyokuRelation: number;
  agencyHiresCumulative: number;
  nurses: number;
  schoolOpenedAtQuarter: Quarter | null;
  addons: AddonStatus[];
  assets: FixedAsset[];
  loans: Loan[];
  cash: Man;
  accountsReceivable: Man;
  paidInCapital: Man;
  retainedEarnings: Man;
}

/** 1 四半期の全出力。UI はこれだけを読む */
export interface QuarterResult {
  quarter: Quarter;
  label: string;
  clinics: ClinicTick[];
  staff: StaffTick;
  fee: FeeTick;
  financials: FinancialStatements;
  events: GameEvent[];
}

export interface GameEvent {
  id: string;
  quarter: Quarter;
  severity: 'info' | 'warning' | 'critical';
  /** UI の通知バッジをどの画面に出すか */
  screen: ScreenId;
  title: string;
  body: string;
}

export type ScreenId =
  | 'map'
  | 'hq'
  | 'clinic'
  | 'igyoku'
  | 'agency'
  | 'medicalAssociation'
  | 'referralHospital'
  | 'careManager'
  | 'bureau'
  | 'pharmacy'
  | 'nursingSchool'
  | 'bank'
  | 'realEstate'
  | 'accounting'
  | 'personnel'
  | 'personalWealth';
