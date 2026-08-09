/**
 * 集計。UI はここを呼ぶ。JSX の中で足し算をしない（CLAUDE.md §2）。
 *
 * 同じ集計が複数画面に散ると必ずどこかがズレるので、
 * 「複数画面で使う数字」は例外なくこのファイルに置く。
 */
import { REPUTATION_MAX, REPUTATION_MIN } from './constants';
import type { ClinicTick, GameEvent, Man, Month, MonthResult, ScreenId } from './types';

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
