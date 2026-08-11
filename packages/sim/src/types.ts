/**
 * シミュレーション核の型定義。
 *
 * 金額は全て「万円」単位の number。表示時に円へ変換する。
 * 時刻は月インデックス（1 始まり、1〜120）のみ。Date を使わない。
 */

// ---------------------------------------------------------------- 基本

/** 月インデックス（1 = 1年目4月）。年度は4月始まり */
export type Month = number;

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

export type DistrictId = string;

/** 診療科。docs/spec/05-specialty.md */
export type SpecialtyId = 'naika' | 'shonika' | 'seikei' | 'hifuka' | 'ganka' | 'seishin';

/** 内装グレード。開業時に決めて、あとから変えられない（docs/spec/06-opening.md §4） */
export type FitoutId = 'basic' | 'standard' | 'premium';

/** 集患投資の段階。院ごとに毎月決める（docs/spec/07-awareness.md §3） */
export type MarketingLevelId = 'none' | 'local' | 'web' | 'heavy';

/**
 * 科の性格。**内科の値は検証済みの定数そのもの**（倍率ではなく実数で持つ）。
 * 既定シナリオは全て内科なので、科を足しても検証済みの数字は動かない。
 */
export interface SpecialtySpec {
  id: SpecialtyId;
  name: string;
  /** 患者1人あたり月の受診回数。整形は多い（リハビリ）、皮膚科は少ない */
  visitsPerPatientPerMonth: number;
  /** 1回あたりの点数。眼科は手術で跳ねる */
  pointsPerVisit: number;
  /** 医師1人1日あたりの診察可能数。精神科は診察が長いので少ない */
  visitsPerDoctorPerDay: number;
  /** 患者1人あたり月の自費（円）。皮膚科は美容で大きい */
  selfPayYenPerPatient: number;
  /** 四半期あたりの基礎離脱率。精神科は切れにくい、小児科は卒業していく */
  baseChurnRatePerQuarter: number;
  /** 開業時の設備投資の倍率。眼科は手術機器で重い */
  capexMultiplier: number;
  /** 医師1名が食う派遣枠。精神科・眼科は採りにくい */
  doctorScarcity: number;
  /** 一言でこの科の性格。UI がそのまま出す */
  character: string;
}

export interface ClinicConfig {
  id: ClinicId;
  name: string;
  /**
   * どの商圏に属するか。**同じ商圏の院はシェアを食い合う**（docs/spec/04-market.md）。
   * 検証モデルの3院は別々の商圏に置いてあるので、食い合いは起きない。
   */
  districtId: DistrictId;
  /**
   * 標榜する科。**1院1科**（docs/spec/05-specialty.md §8）。
   * 市場のセグメントは（商圏 × 科）なので、科が違えば同じ商圏でも食い合わない。
   */
  specialtyId: SpecialtyId;
  /** 開院する月 */
  openMonth: Month;
  /** 1ヶ月あたりの新規患者ポテンシャル（評判 75 のとき） */
  newPatientPotential: number;
  /** 承継開業なら引き継ぐ患者数。新規開業は 0 */
  initialPatientStock: number;

  // ---------------- 開業で焼き付ける値（docs/spec/06-opening.md §3）
  //
  // ★**持っていない院は従来どおりの経路を通る。**
  // BASELINE_SCENARIO の3院はどれも持たないので、検証済みの資金繰りは動かない。

  /** 開業時に決めた内装グレード。開院後は変えられない */
  fitoutId?: FitoutId;
  /**
   * その院の評判が落ち着く先。内装で決まる。
   * 未設定なら BASELINE_REPUTATION（＝恒等式）
   */
  baselineReputation?: number;
  /** 実際に払った設備投資。立地 × 科 × 内装 */
  capex?: Man;
  /** 実際に組んだ開業融資。足りない分だけ借りる */
  openingLoan?: Man;
  /**
   * 立ち上がりの強さ（docs/spec/06-opening.md §6）。
   * 患者が埋まっていない院ほど新規が増える。**落ち着き先は変わらない。**
   * 未設定なら 0（＝恒等式）
   */
  newPatientRamp?: number;
  /**
   * 開院時の認知度 0〜1（docs/spec/07-awareness.md）。
   * ★**未設定の院は認知度という概念を持たず、係数が常に 1**（＝恒等式）。
   * 承継は看板と地域の記憶を引き継ぐので高い
   */
  initialAwareness?: number;
}

export interface ClinicState {
  id: ClinicId;
  /** 前月の待ち時間。シェアは前月の魅力で決まるので持ち歩く必要がある */
  waitMinutes: number;
  /** 通院患者ストック。このゲームの実体資産 */
  patientStock: number;
  /** 評判 20〜100。落ちるのは速く、戻るのは遅い */
  reputation: number;
  /**
   * 直近の評判の履歴（新しい順）。新規患者は3ヶ月前の評判で決まるので、
   * NEW_PATIENT_REPUTATION_LAG_MONTHS 件だけ持ち歩く。セーブデータにも要る。
   */
  reputationHistory: number[];
  doctors: number;
  /**
   * 認知度 0〜1。その商圏の人がこの医院を知っているか。
   * 認知度を持たない院（＝シナリオが直接持っている院）は 1 のまま動かない
   */
  awareness: number;
}

/** 1 ヶ月の診療所シミュレーション結果 */
export interface ClinicTick {
  id: ClinicId;
  specialtyId: SpecialtyId;
  specialtyName: string;
  /**
   * 院の素性。**分院はプレイ中に増えるので、UI が CLINICS 定数を読んではいけない。**
   * 読むと「最初から決まっている3院」しか描けない。
   */
  name: string;
  openMonth: Month;
  open: boolean;
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
  /** 商圏でのシェア 0〜1。競合が居なければ 1 */
  marketShare: number;
  insuranceRevenue: Man;
  selfPayRevenue: Man;
  operatingCost: Man;
  operatingIncome: Man;
  /** 認知度 0〜1。認知度を持たない院は 1 */
  awareness: number;
  /** いま打っている集患投資が届く先。認知度はここへ向かって動く */
  awarenessCeiling: number;
  marketingLevel: MarketingLevelId;
  /** その院の今月の広告宣伝費 */
  marketingCost: Man;
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
  /** プレイヤーが置きたかった人数の合計 */
  doctorsPlanned: number;
  /** ★調達できずに空いたままの席。ここが 0 でないと計画どおりに動いていない */
  doctorsUnfilled: number;

  nurses: number;
  nursesRequired: number;
  /** MIN(1, 在籍 / 必要)。1 未満だと診察枠が絞られる */
  nurseSufficiency: number;
  nursesFromSchool: number;
  nursesFromMarket: number;
  /** 医局へ当直を出しているか。出していると関係が育つ代わりに枠が落ちる */
  igyokuDuty: boolean;
}

// ---------------------------------------------------------------- 診療報酬

export interface FeeRevision {
  id: string;
  name: string;
  effectiveMonth: Month;
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
  expiresAtMonth: Month;
}

export interface AddonStatus {
  id: string;
  acquired: boolean;
  acquiredAtMonth: Month | null;
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
  acquiredAtMonth: Month;
  acquisitionCost: Man;
  /** 耐用年数（月数）。医療機器 60、内装 120、校舎 240 */
  usefulLifeMonths: number;
  /** 残存簿価 */
  bookValue: Man;
}

export interface Loan {
  id: string;
  name: string;
  principal: Man;
  outstanding: Man;
  /** 1ヶ月あたりの金利 */
  monthlyRate: number;
  /** 残高に対する1ヶ月あたりの元金返済率 */
  monthlyRepaymentRate: number;
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
  /** 受託収入（休日当番医・学校医・自治体健診）。実務でいう「その他医業収入」 */
  contractRevenue: Man;
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
  /** 外部関係の活動費（医師会・連携基幹病院・ケアマネ） */
  externalRelationCost: Man;
  /** 電子カルテ・AI の月額、機器のリース料と保守料 */
  systemCost: Man;
  /** 広告宣伝費（集患投資）。販管費なので営業利益の上 */
  marketing: Man;
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
  /** 医業未収金。レセプトは 2 ヶ月遅れで入金される */
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
  month: Month;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

// ---------------------------------------------------------------- 拡張系
//
// 検証モデル（med_sim2.xlsx）に無い後付けの系。**既定では全て眠っている。**
// 意思決定で起こさない限り、値は 0 と null のままで、係数は 1 のまま。
// この性質があるので、足しても検証済みのゴールデンが動かない。

/** 外部関係の相手。医局（igyoku）とは別系統 */
export type ExternalRelationId = 'medicalAssociation' | 'referralHospital' | 'careManager';

/** 電子カルテのティア。null は紙カルテ */
export type EmrTier = 'single' | 'chain' | 'enterprise';

export interface RelationView {
  id: ExternalRelationId;
  name: string;
  /** 0〜100 */
  value: number;
  /** 今月、活動に出たか */
  active: boolean;
  monthlyCost: Man;
  effect: string;
}

export interface RelationsTick {
  relations: RelationView[];
  /** 医師会の受託収入（休日当番医・学校医・健診） */
  contractRevenue: Man;
  /** 基幹病院からの紹介による新規患者の上乗せ率 */
  referralUplift: number;
  /** ケアマネ経由の在宅比率 */
  homeCareShare: number;
  totalCost: Man;
}

export interface EquipmentView {
  id: string;
  name: string;
  price: Man;
  /** 取得済みか */
  owned: boolean;
  /** リースなら true。B/S に載らない */
  leased: boolean;
  /** 故障中。保守未加入のときだけ起きる */
  broken: boolean;
  /** 復旧する月 */
  repairedAtMonth: Month | null;
  /** 稼働しているときの自費収入の上乗せ率 */
  selfPayUplift: number;
  /** 簿価。リースは 0 */
  bookValue: Man;
}

export interface AiToolView {
  id: string;
  name: string;
  adopted: boolean;
  upfrontCost: Man;
  recurringCost: Man;
  visitsPerDoctorPerDayBonus: number;
}

export interface VendorTick {
  emrTier: EmrTier | null;
  emrTierName: string;
  /** 移行の痛みが続いている最中か */
  migrating: boolean;
  migrationMonthsLeft: number;
  /** 移行中に落ちている診察枠の率 */
  migrationCapacityPenalty: number;
  equipment: EquipmentView[];
  aiTools: AiToolView[];
  /** AI による医師1人1日あたりの上乗せ */
  extraVisitsPerDoctorPerDay: number;
  /** 稼働中の機器による自費収入の上乗せ率 */
  equipmentSelfPayUplift: number;
  maintenanceContract: boolean;
  /** カルテ月額＋AI月額＋保守料＋リース料 */
  recurringCost: Man;
  leaseExpense: Man;
}

export interface PharmacyView {
  clinicId: ClinicId;
  clinicName: string;
  invited: boolean;
  invitedAtMonth: Month | null;
  /** 今月の賃料収入。定額＋患者数の歩合 */
  rent: Man;
}

export interface PharmacyTick {
  pharmacies: PharmacyView[];
  rentalRevenue: Man;
}

export interface PropertyView {
  clinicId: ClinicId;
  clinicName: string;
  owned: boolean;
  ownedSinceMonth: Month | null;
  price: Man;
  bookValue: Man;
  /** 保有に切り替えて消えた家賃（万円/月）。テナントのままなら 0 */
  rentSaved: Man;
  /** 買ったら消える家賃（万円/月）。買う前に回収年数を出すために要る */
  rentIfOwned: Man;
  /** 単純な回収年数。物件価格 ÷ 年間の家賃 */
  paybackYears: number;
}

export interface RealEstateTick {
  properties: PropertyView[];
  rentSaved: Man;
  bookValue: Man;
}

export interface PersonalAssetView {
  id: string;
  name: string;
  price: Man;
  prestige: number;
  note: string;
  owned: boolean;
}

export interface PersonalTick {
  /** 今月の役員報酬（法人の費用） */
  salary: Man;
  /** 税・社会保険を引いた手取り */
  netSalary: Man;
  cumulativeSalary: Man;
  cash: Man;
  assets: PersonalAssetView[];
  assetValue: Man;
  prestige: number;
  rank: string;
  /** 個人の現金＋見栄資産の取得価額 */
  netWorth: Man;
}

/** 拡張系の1ヶ月ぶんの出力。既定シナリオでは全て「何も起きていない」形になる */
export interface ExpansionTick {
  relations: RelationsTick;
  vendor: VendorTick;
  pharmacy: PharmacyTick;
  realEstate: RealEstateTick;
  personal: PersonalTick;
  /** 診察枠に掛かった係数の合計。1 なら誰も枠を削っていない */
  capacityMultiplier: number;
  newPatientMultiplier: number;
  selfPayMultiplier: number;
}

// ---------------------------------------------------------------- 全体

/** 保有機器の実体。UI ではなく state が持つ */
export interface OwnedEquipment {
  id: string;
  leased: boolean;
  acquiredAtMonth: Month;
  /** 故障中なら復旧月。null なら稼働中 */
  repairedAtMonth: Month | null;
}

export interface GameState {
  month: Month;
  rngSeed: number;
  clinics: ClinicState[];
  igyokuRelation: number;
  agencyHiresCumulative: number;
  nurses: number;
  schoolOpenedAtMonth: Month | null;
  addons: AddonStatus[];
  assets: FixedAsset[];
  loans: Loan[];
  cash: Man;
  accountsReceivable: Man;
  paidInCapital: Man;
  retainedEarnings: Man;

  // ---- 拡張系。既定では空・null・0
  externalRelations: Record<ExternalRelationId, number>;
  /** いま活動を続けている相手 */
  externalRelationActive: Record<ExternalRelationId, boolean>;
  emrTier: EmrTier | null;
  /** 移行の痛みが終わる月 */
  emrMigrationEndsAtMonth: Month | null;
  aiTools: string[];
  equipment: OwnedEquipment[];
  maintenanceContract: boolean;
  /** 門前薬局を誘致した月。院ごと */
  pharmacyInvitedAt: Record<ClinicId, Month>;
  /** 物件を取得した月。院ごと */
  propertyOwnedSince: Record<ClinicId, Month>;
  executiveSalary: Man;
  cumulativeExecutiveSalary: Man;
  personalCash: Man;
  personalAssets: string[];
  /** 盤上の競合。既定シナリオでは空 */
  competitors: CompetitorState[];
  /**
   * 開業据置の明ける月（docs/spec/06-opening.md §7）。
   * **最初の開業の1回だけ立つ。** 意思決定で開院しない既定シナリオでは null のまま。
   */
  openingGraceUntilMonth: Month | null;
}

/** 1 ヶ月の全出力。UI はこれだけを読む */
export interface MonthResult {
  month: Month;
  label: string;
  clinics: ClinicTick[];
  staff: StaffTick;
  fee: FeeTick;
  financials: FinancialStatements;
  events: GameEvent[];
  /** 拡張系。既定シナリオでは全項目が「何もしていない」状態で返る */
  expansion: ExpansionTick;
  /** 3本のゴールの進捗と、終わったかどうか */
  goals: GoalTick;
  /** 商圏。競合が居なければシェアは全て 1 */
  market: MarketTick;
}

export interface GameEvent {
  id: string;
  month: Month;
  /** どの院の話か。全社の話なら未設定。id 文字列から院を推測させないために持つ */
  clinicId?: ClinicId;
  severity: 'info' | 'warning' | 'critical';
  /** UI の通知バッジをどの画面に出すか */
  screen: ScreenId;
  title: string;
  body: string;
}

// ---------------------------------------------------------------- 商圏と競合
//
// 検証モデルには競合が居なかった。隣に分院を出しても本院の患者は1人も減らなかった。
// **既定シナリオは競合0・1商圏1院なので、シェアは常に 1 で恒等式のまま**
// （docs/spec/04-market.md）。

export interface DistrictSpec {
  id: DistrictId;
  name: string;
  /** 街の性格。開院画面に出す */
  character: string;
  /** 科ごとの需要係数。内科は全商圏 1.0（商圏ポテンシャルの校正を壊さないため） */
  demandBias: Record<SpecialtyId, number>;
  /**
   * 商圏に月あたり発生する新規患者。**独占したときの数。**
   * 同じ商圏の院はこれを分け合う（それぞれのシェアを掛ける）。
   */
  newPatientPotential: number;
}

export interface CompetitorSpec {
  id: string;
  name: string;
  districtId: DistrictId;
  /** 同じ科の相手としか取り合わない */
  specialtyId: SpecialtyId;
  /** 魅力の基礎。20〜100。自院の評判に相当する */
  strength: number;
}

/** 盤上の競合。撤退の判定のために「弱い月」を数える */
export interface CompetitorState extends CompetitorSpec {
  openedAtMonth: Month;
  /** シェアが撤退水準を下回り続けている月数 */
  weakMonths: number;
  /** 撤退した月。null なら営業中 */
  closedAtMonth: Month | null;
}

export interface CompetitorView {
  id: string;
  name: string;
  districtId: DistrictId;
  specialtyId: SpecialtyId;
  strength: number;
  share: number;
  /** 撤退まであと何ヶ月か。押し込めていなければ null */
  monthsToExit: number | null;
  openedAtMonth: Month;
}

export interface DistrictClinicView {
  id: ClinicId;
  name: string;
  /** 評判 × 待ち時間ペナルティ */
  attractiveness: number;
  share: number;
}

/** 市場のセグメント。**商圏そのものではなく（商圏 × 科）** */
export interface DistrictView {
  id: DistrictId;
  name: string;
  specialtyId: SpecialtyId;
  specialtyName: string;
  clinics: DistrictClinicView[];
  competitors: CompetitorView[];
  /** 自社の合計シェア */
  ownShare: number;
}

export interface MarketTick {
  districts: DistrictView[];
  /** 今月撤退した競合 */
  closed: CompetitorView[];
}

// ---------------------------------------------------------------- ゴールと終局
//
// ★このゲームには「正解の勝ち方」を1つに絞らない。
// 個人資産・規模・法人価値のどれで上がってもよく、**互いに食い合う**ところが主題。
// 役員報酬を取れば個人は太るが法人は痩せる。分院を出せば規模は伸びるが現金が消える。

export type GoalId = 'personalWealth' | 'scale' | 'corporate';

export interface GoalSpec {
  id: GoalId;
  name: string;
  /** 何を達成すれば上がりか。UI がそのまま出す */
  description: string;
  target: number;
  unit: string;
}

export interface GoalProgress {
  id: GoalId;
  name: string;
  description: string;
  /** 今の値 */
  value: number;
  target: number;
  unit: string;
  /** 0〜1。1 で達成 */
  ratio: number;
  achieved: boolean;
  /** 達成した月。まだなら null */
  achievedAtMonth: Month | null;
}

export type EndReason = 'goal' | 'bankrupt' | 'timeUp';

export interface EndState {
  /** 終わっているか */
  ended: boolean;
  reason: EndReason | null;
  month: Month | null;
  /** 達成したゴール。bankrupt / timeUp なら空 */
  achieved: GoalId[];
  /** 称号。3つのゴールの進捗から引く */
  title: string;
  /** 債務超過が続いている月数。BANKRUPTCY_GRACE_MONTHS に達すると終わる */
  insolventMonths: number;
}

export interface GoalTick {
  goals: GoalProgress[];
  end: EndState;
}

// ---------------------------------------------------------------- 突発事象

export type RandomEventId =
  | 'doctorResigned'
  | 'nurseExodus'
  | 'competitorOpened'
  | 'bureauAudit'
  | 'epidemic';

/** 起きてしまった突発事象。効果は既に state へ適用済み */
export interface RandomEventOccurrence {
  id: RandomEventId;
  month: Month;
  clinicId?: ClinicId;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
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
  | 'vendor'
  | 'personalWealth';
