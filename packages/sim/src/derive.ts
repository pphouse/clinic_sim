/**
 * 集計。UI はここを呼ぶ。JSX の中で足し算をしない（CLAUDE.md §2）。
 *
 * 同じ集計が複数画面に散ると必ずどこかがズレるので、
 * 「複数画面で使う数字」は例外なくこのファイルに置く。
 */
import type { ClinicTick, GameEvent, Man, Quarter, QuarterResult, ScreenId } from './types';

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

export function deriveGroupTotals(result: QuarterResult): GroupTotals {
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
export function totalPatientStock(result: QuarterResult): number {
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
export function eventsForScreen(result: QuarterResult, screen: ScreenId): GameEvent[] {
  return result.events.filter((e) => e.screen === screen);
}

/** いちばん詰まっている院。マップ画面のバッジはこれで決める */
export function worstWait(result: QuarterResult): ClinicTick | null {
  const open = result.clinics.filter((c) => c.capacity > 0);
  if (open.length === 0) return null;
  return open.reduce((worst, c) => (c.waitMinutes > worst.waitMinutes ? c : worst));
}

/** 有利子負債の残高 */
export function totalDebt(result: QuarterResult): Man {
  const bs = result.financials.balanceSheet;
  return bs.shortTermDebt + bs.longTermDebt;
}

/**
 * 加算が「落ちていた」四半期。
 *
 * AddonStatus.lapsedByRequirement は「取得済みだが要件を満たしていない」を素直に表す。
 * ただし取得しただけで一度も要件を満たしたことがない加算（既定シナリオの在宅療養支援加算が
 * まさにこれ）は、まだ何も失っていない。**失効＝一度手にしたものを落とすこと** なので、
 * 経理や厚生局の画面で「落ちていた期間」を出すときはこちらを使う。
 */
export function addonLapseQuarters(quarters: QuarterResult[]): Quarter[] {
  const everActive = new Set<string>();
  const lapsed: Quarter[] = [];
  for (const result of quarters) {
    if (result.fee.addons.some((a) => a.lapsedByRequirement && everActive.has(a.id))) {
      lapsed.push(result.quarter);
    }
    for (const addon of result.fee.addons) {
      if (addon.active) everActive.add(addon.id);
    }
  }
  return lapsed;
}

/** 患者ストックの加重平均で見た全社評判 */
export function groupReputation(result: QuarterResult): number {
  const open = result.clinics.filter((c) => c.capacity > 0);
  const stock = open.reduce((sum, c) => sum + c.patientStock, 0);
  if (stock === 0) return 0;
  return open.reduce((sum, c) => sum + c.reputation * c.patientStock, 0) / stock;
}
