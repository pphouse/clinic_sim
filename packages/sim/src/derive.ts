/**
 * 集計。UI はここを呼ぶ。JSX の中で足し算をしない（CLAUDE.md §2）。
 *
 * 同じ集計が複数画面に散ると必ずどこかがズレるので、
 * 「複数画面で使う数字」は例外なくこのファイルに置く。
 */
import {
  CLINICS,
  EMR_TIERS,
  MONTHS_PER_YEAR,
  PROPERTY_PRICE,
  REPUTATION_MAX,
  REPUTATION_MIN,
  TOLERABLE_WAIT_MINUTES,
  emrMigrationCost,
} from './constants';
import { SCHOOL_DURATION_MONTHS, SCHOOL_GRADUATES_PER_CLASS, enrolledClasses } from './staff';
import { CRITICAL_WAIT_MINUTES } from './events';
import type {
  ClinicId,
  ClinicTick,
  EmrTier,
  ExternalRelationId,
  GameEvent,
  Man,
  Month,
  MonthResult,
  RelationView,
  ScreenId,
} from './types';

export interface GroupTotals {
  /** 診療収入（保険＋自費）。学費・賃料は含まない */
  clinicRevenue: Man;
  /** 診療所の営業利益の合計。本部費・金利・減価償却を含まない */
  clinicOperatingIncome: Man;
  tuitionRevenue: Man;
  schoolOperating: Man;
  /** 学費 − 学校運営費 */
  schoolOperatingIncome: Man;
  /**
   * 検証モデル基準の営業利益＝診療所＋学校。
   * 本部費・金利・減価償却は含まない。P/L の operatingIncome とは定義が違う
   */
  operatingIncome: Man;
  /** 本部費＋医局関係維持費＋紹介会社手数料 */
  hqCost: Man;
  capex: Man;
  newBorrowing: Man;
  interest: Man;
  principalRepaid: Man;
}

export function deriveGroupTotals(result: MonthResult): GroupTotals {
  const is = result.financials.incomeStatement;
  const cf = result.financials.cashFlow;

  const clinicRevenue = is.insuranceRevenue + is.selfPayRevenue;
  const clinicOperatingIncome = result.clinics.reduce((sum, c) => sum + c.operatingIncome, 0);
  const schoolOperatingIncome = is.tuitionRevenue - is.schoolOperating;

  return {
    clinicRevenue,
    clinicOperatingIncome,
    tuitionRevenue: is.tuitionRevenue,
    schoolOperating: is.schoolOperating,
    schoolOperatingIncome,
    operatingIncome: clinicOperatingIncome + schoolOperatingIncome,
    hqCost: is.headquarters + is.igyokuRelationCost + is.agencyFees,
    capex: -cf.capitalExpenditure,
    newBorrowing: cf.newBorrowing,
    interest: is.interestExpense,
    principalRepaid: -cf.principalRepayment,
  };
}

/** 全社の通院患者ストック。このゲームの実体資産 */
export function totalPatientStock(result: MonthResult): number {
  return result.clinics.reduce((sum, c) => sum + c.patientStock, 0);
}

/**
 * 捌けなかった診察。翌期に繰り越さず、そのまま消える。
 * 診療所画面が引き算で出していたので sim 側に移した（docs/spec/screens/clinic.md）。
 */
export function unservedVisits(tick: ClinicTick): number {
  return Math.max(0, tick.demandVisits - tick.visitsServed);
}

/** その画面に出すべき通知だけを拾う。UI はこれを数えてバッジにする */
export function eventsForScreen(result: MonthResult, screen: ScreenId): GameEvent[] {
  return result.events.filter((e) => e.screen === screen);
}

/** いちばん詰まっている院。マップ画面のバッジはこれで決める */
export function worstWait(result: MonthResult): ClinicTick | null {
  const open = result.clinics.filter((c) => c.capacity > 0);
  if (open.length === 0) return null;
  return open.reduce((worst, c) => (c.waitMinutes > worst.waitMinutes ? c : worst));
}

/** 有利子負債の残高 */
export function totalDebt(result: MonthResult): Man {
  const bs = result.financials.balanceSheet;
  return bs.shortTermDebt + bs.longTermDebt;
}

/**
 * 加算が「落ちていた」月。
 *
 * AddonStatus.lapsedByRequirement は「取得済みだが要件を満たしていない」を素直に表す。
 * ただし取得しただけで一度も要件を満たしたことがない加算（既定シナリオの在宅療養支援加算が
 * まさにこれ）は、まだ何も失っていない。**失効＝一度手にしたものを落とすこと** なので、
 * 経理や厚生局の画面で「落ちていた期間」を出すときはこちらを使う。
 */
export function addonLapseMonths(months: MonthResult[]): Month[] {
  const everActive = new Set<string>();
  const lapsed: Month[] = [];
  for (const result of months) {
    if (result.fee.addons.some((a) => a.lapsedByRequirement && everActive.has(a.id))) {
      lapsed.push(result.month);
    }
    for (const addon of result.fee.addons) {
      if (addon.active) everActive.add(addon.id);
    }
  }
  return lapsed;
}

/** 星の数。5段階 */
export const REPUTATION_STAR_COUNT = 5;

/**
 * 評判を星に写す。
 *
 * 評判は 20〜100 で、REPUTATION_MIN=20 がちょうど星1、100 が星5になる。
 * 口コミサイトの下限が星1で、星0が無いのと同じ形になっているのは偶然だが、
 * 「最低でも1つは付いている」という手触りが実物と揃うので、この写像を採る。
 */
export function reputationStars(reputation: number): number {
  return reputation / (REPUTATION_MAX / REPUTATION_STAR_COUNT);
}

/** 星の下限。評判が下限に張り付いたときの星の数 */
export const REPUTATION_STARS_MIN = REPUTATION_MIN / (REPUTATION_MAX / REPUTATION_STAR_COUNT);

/** 患者ストックの加重平均で見た全社評判 */
export function groupReputation(result: MonthResult): number {
  const open = result.clinics.filter((c) => c.capacity > 0);
  const stock = open.reduce((sum, c) => sum + c.patientStock, 0);
  if (stock === 0) return 0;
  return open.reduce((sum, c) => sum + c.reputation * c.patientStock, 0) / stock;
}

// ---------------------------------------------------------------- 推移
//
// このゲームの主題は遅延なので、「今」だけ見せても伝わらない。
// 待ち時間が跳ねた月と、患者ストックが減り始める月のズレが目で見えて初めて
// 「壊すのは一瞬、直すのは何年」が成立する。UI で slice しないでここから取る。

/** 折れ線に載せられる系列 */
export type ClinicSeriesKey = 'patientStock' | 'waitMinutes' | 'reputation' | 'utilization';

export interface ClinicSeries {
  key: ClinicSeriesKey;
  /** 古い順。長さは要求した月数か、それ未満（開院前は詰めない） */
  values: number[];
  /** values の先頭が何ヶ月目か */
  startMonth: Month;
}

/**
 * ある院の直近 count ヶ月の推移。開院前の月は含めない。
 * upToMonth は 1 始まりの月インデックス。
 */
export function clinicSeries(
  months: MonthResult[],
  clinicId: string,
  key: ClinicSeriesKey,
  upToMonth: Month,
  count: number,
): ClinicSeries {
  const end = Math.min(upToMonth, months.length);
  const start = Math.max(1, end - count + 1);
  const values: number[] = [];
  let startMonth = start;
  for (let m = start; m <= end; m++) {
    const tick = months[m - 1]?.clinics.find((c) => c.id === clinicId);
    if (!tick) continue;
    // 開院前は capacity も stock も 0。線を 0 から立ち上げると誤読するので落とす
    if (tick.capacity === 0 && tick.patientStock === 0) {
      startMonth = m + 1;
      values.length = 0;
      continue;
    }
    values.push(tick[key]);
  }
  return { key, values, startMonth };
}

/** 前月からの増減。増減の併記が無いと、月を送っても何が動いたか分からない */
export interface ClinicDelta {
  patientStock: number;
  waitMinutes: number;
  reputation: number;
}

export function clinicDelta(
  current: MonthResult,
  previous: MonthResult | null,
  clinicId: string,
): ClinicDelta | null {
  if (!previous) return null;
  const now = current.clinics.find((c) => c.id === clinicId);
  const before = previous.clinics.find((c) => c.id === clinicId);
  if (!now || !before) return null;
  // 開院月は前月が空なので増減を出さない（前月比 +3,222人 は嘘になる）
  if (before.capacity === 0 && before.patientStock === 0) return null;
  return {
    patientStock: now.patientStock - before.patientStock,
    waitMinutes: now.waitMinutes - before.waitMinutes,
    reputation: now.reputation - before.reputation,
  };
}

// ---------------------------------------------------------------- マップ

/** 混雑の3段階。しきい値は sim が持つ。UI に 20 や 45 を直書きさせない */
export type Congestion = 'calm' | 'warning' | 'critical';

export function congestionOf(waitMinutes: number): Congestion {
  if (waitMinutes >= CRITICAL_WAIT_MINUTES) return 'critical';
  if (waitMinutes > TOLERABLE_WAIT_MINUTES) return 'warning';
  return 'calm';
}

export interface ClinicSummary {
  id: ClinicId;
  name: string;
  /** 開院済みか */
  open: boolean;
  openMonth: Month;
  patientStock: number;
  waitMinutes: number;
  reputation: number;
  doctors: number;
  congestion: Congestion;
  /** その院に紐づく通知の数。マップのバッジに使う */
  eventCount: number;
}

/**
 * 各院の現在地。マップ画面が読む。
 *
 * **他院との比較はマップの仕事**（診療所画面ではやらない）。
 * 横並びで見て初めて「B院だけ空いている」が分かるので、並べる形はここで作る。
 */
/**
 * ★result.clinics から作る。CLINICS 定数を読まない。
 * 分院はプレイ中に増えるので、定数を読むと「最初から決まっている3院」しか描けない。
 */
export function clinicSummaries(result: MonthResult): ClinicSummary[] {
  return result.clinics.map((tick) => ({
    id: tick.id,
    name: tick.name,
    open: tick.open,
    openMonth: tick.openMonth,
    patientStock: tick.patientStock,
    waitMinutes: tick.waitMinutes,
    reputation: tick.reputation,
    doctors: result.staff.doctorsByClinic[tick.id] ?? 0,
    congestion: congestionOf(tick.waitMinutes),
    eventCount: result.events.filter((e) => e.clinicId === tick.id).length,
  }));
}

/** 全社の当月サマリ。マップ上部に出す */
export interface GroupSummary {
  patientStock: number;
  patientStockDelta: number | null;
  cash: Man;
  cashDelta: number | null;
  operatingIncome: Man;
}

export function groupSummary(result: MonthResult, previous: MonthResult | null): GroupSummary {
  const cash = result.financials.balanceSheet.cash;
  const stock = totalPatientStock(result);
  return {
    patientStock: stock,
    patientStockDelta: previous ? stock - totalPatientStock(previous) : null,
    cash,
    cashDelta: previous ? cash - previous.financials.balanceSheet.cash : null,
    operatingIncome: deriveGroupTotals(result).operatingIncome,
  };
}

// ---------------------------------------------------------------- 看護学校

/**
 * 学校の現在地。看護学校画面が読む。
 *
 * 開校月は GameState にしか無いが、UI に状態管理を持たせたくない。
 * **学校運営費が立っている最初の月＝開校月**なので、履歴から引く。
 */
export interface SchoolStatus {
  open: boolean;
  openedAtMonth: Month | null;
  /** 在学中の学年数（0〜3） */
  enrolledClasses: number;
  /** 次に卒業生が出る月 */
  nextGraduationMonth: Month | null;
  /** 1学年が卒業したときに自法人へ残る人数 */
  graduatesPerClass: number;
  /** 今月入職した卒業生 */
  graduatedThisMonth: number;
}

export function schoolStatus(months: MonthResult[], upToMonth: Month): SchoolStatus {
  const opened = months.find((m) => m.financials.incomeStatement.schoolOperating > 0);
  const openedAtMonth = opened?.month ?? null;
  const current = months[upToMonth - 1];
  if (openedAtMonth === null || upToMonth < openedAtMonth || !current) {
    return {
      open: false,
      openedAtMonth,
      enrolledClasses: 0,
      nextGraduationMonth: null,
      graduatesPerClass: SCHOOL_GRADUATES_PER_CLASS,
      graduatedThisMonth: 0,
    };
  }
  const first = openedAtMonth + SCHOOL_DURATION_MONTHS;
  const nextGraduationMonth =
    upToMonth < first
      ? first
      : first + Math.ceil((upToMonth - first + 1) / MONTHS_PER_YEAR) * MONTHS_PER_YEAR;
  return {
    open: true,
    openedAtMonth,
    enrolledClasses: enrolledClasses(upToMonth, openedAtMonth),
    nextGraduationMonth,
    graduatesPerClass: SCHOOL_GRADUATES_PER_CLASS,
    graduatedThisMonth: current.staff.nursesFromSchool,
  };
}

// ==================================================================
// 拡張系の derive（外部関係・商社・薬局・不動産・個人資産）
//
// **画面で計算しない**（CLAUDE.md §2）。7画面ぶんの「並べる前のひと手間」を
// ここに集める。同じ計算が画面ごとに散ると必ずどこかがズレる。
// ==================================================================

/** 外部関係の推移。折れ線に渡す */
export function relationSeries(
  months: MonthResult[],
  id: ExternalRelationId,
  upToMonth: Month,
  count: number,
): number[] {
  const end = Math.min(upToMonth, months.length);
  const start = Math.max(1, end - count + 1);
  const values: number[] = [];
  for (let m = start; m <= end; m++) {
    const view = months[m - 1]?.expansion.relations.relations.find((r) => r.id === id);
    if (view) values.push(view.value);
  }
  return values;
}

export function relationView(result: MonthResult, id: ExternalRelationId): RelationView | undefined {
  return result.expansion.relations.relations.find((r) => r.id === id);
}

/**
 * カルテ移行の見積り。**待つことのコストを数字にする**のがこの関数の唯一の仕事
 * （docs/spec/screens/vendor.md）。
 *
 * 12ヶ月後の患者数は、直近12ヶ月の実績から素直に線形で伸ばす。
 * 予測を凝ってもゲームの判断は変わらないし、外れたときに嘘をついたことになる。
 */
export interface EmrMigrationOutlook {
  tier: EmrTier;
  tierName: string;
  /** 現在のティアと同じなら移行の必要が無い */
  current: boolean;
  costNow: Man;
  costIn12Months: Man;
  /** 1年待つと増える額 */
  costOfWaiting: Man;
  capacityPenalty: number;
  penaltyMonths: number;
}

export function emrMigrationOutlook(
  months: MonthResult[],
  upToMonth: Month,
): EmrMigrationOutlook[] {
  const current = months[upToMonth - 1];
  const stockNow = current ? totalPatientStock(current) : 0;

  const ago = months[Math.max(0, upToMonth - 1 - MONTHS_PER_YEAR)];
  const stockAgo = ago ? totalPatientStock(ago) : stockNow;
  const projected = Math.max(0, stockNow + (stockNow - stockAgo));

  return EMR_TIERS.map((tier) => {
    const costNow = emrMigrationCost(tier, stockNow);
    const costIn12Months = emrMigrationCost(tier, projected);
    return {
      tier: tier.id,
      tierName: tier.name,
      current: current?.expansion.vendor.emrTier === tier.id,
      costNow,
      costIn12Months,
      costOfWaiting: costIn12Months - costNow,
      capacityPenalty: tier.migrationCapacityPenalty,
      penaltyMonths: tier.migrationPenaltyMonths,
    };
  });
}

/** 門前薬局の賃料収入の推移 */
export function pharmacyRentSeries(
  months: MonthResult[],
  upToMonth: Month,
  count: number,
): number[] {
  const end = Math.min(upToMonth, months.length);
  const start = Math.max(1, end - count + 1);
  const values: number[] = [];
  for (let m = start; m <= end; m++) {
    const tick = months[m - 1];
    if (tick) values.push(tick.expansion.pharmacy.rentalRevenue);
  }
  return values;
}

/**
 * 物件を買ったときの回収年数。
 * 家賃が消えるだけなので、割引もキャピタルゲインも見ない。**単純な割り算**。
 */
export function propertyPaybackYears(rentSavedPerMonth: Man): number | null {
  if (rentSavedPerMonth <= 0) return null;
  return PROPERTY_PRICE / (rentSavedPerMonth * MONTHS_PER_YEAR);
}

/** 個人資産の推移（現金＋見栄資産の取得価額） */
export function personalNetWorthSeries(
  months: MonthResult[],
  upToMonth: Month,
  count: number,
): number[] {
  const end = Math.min(upToMonth, months.length);
  const start = Math.max(1, end - count + 1);
  const values: number[] = [];
  for (let m = start; m <= end; m++) {
    const tick = months[m - 1];
    if (tick) values.push(tick.expansion.personal.netWorth);
  }
  return values;
}

/** その見栄資産があと何ヶ月の手取りで買えるか。買えないものに「あと◯ヶ月」を出す */
export function monthsToAfford(price: Man, cash: Man, netSalaryPerMonth: Man): number | null {
  if (cash >= price) return 0;
  if (netSalaryPerMonth <= 0) return null;
  return Math.ceil((price - cash) / netSalaryPerMonth);
}
