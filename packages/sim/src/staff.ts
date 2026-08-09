/**
 * 人材の調達。
 *
 * 医師と看護師では詰まり方が違う。ここを混ぜると設計が崩れる。
 *
 *   医師   … 枠の問題。医局関係値と紹介会社でしか増やせない。金を積んでも即日は来ない
 *   看護師 … 流量の問題。市場からは3ヶ月で 1.2 人しか採れない。学校を建てると
 *            3 年後から毎年まとまって入るが、定着するのは卒業生の 35% だけ
 *
 * 看護師は全社プールで持ち、各院へは医師数で按分する。
 * 充足率が 1 を割ると診察枠がそのまま絞られる（engine.ts の effectiveCapacity）。
 */
import {
  NURSES_PER_DOCTOR,
  NURSE_ATTRITION_RATE,
  NURSE_MARKET_HIRES_PER_MONTH,
  MONTHS_PER_YEAR,
  RELATION_PER_IGYOKU_SLOT,
  SCHOOL_CLASS_SIZE,
  SCHOOL_GRADUATION_RATE,
  SCHOOL_RETENTION_RATE,
  SCHOOL_TUITION_PER_YEAR,
  SCHOOL_YEARS,
} from './constants';
import type { ClinicId, Man, Month } from './types';

/** 1学年が卒業したときに自法人へ残る人数。40 × 85% × 35% = 11.9。年1回まとめて入る */
export const SCHOOL_GRADUATES_PER_CLASS =
  SCHOOL_CLASS_SIZE * SCHOOL_GRADUATION_RATE * SCHOOL_RETENTION_RATE;

/** 在学期間（月）。3年 = 36ヶ月 */
export const SCHOOL_DURATION_MONTHS = SCHOOL_YEARS * MONTHS_PER_YEAR;

/** 医局関係値から決まる派遣枠。20 ごとに 1 枠 */
export function igyokuSlotsOf(relation: number): number {
  return Math.floor(relation / RELATION_PER_IGYOKU_SLOT);
}

/** 医師数から決まる必要看護師数 */
export function nursesRequiredFor(doctorsTotal: number): number {
  return doctorsTotal * NURSES_PER_DOCTOR;
}

export function nurseSufficiencyOf(nurses: number, required: number): number {
  if (required <= 0) return 1;
  return Math.min(1, nurses / required);
}

/** 卒業生が出る月か。開校の 3 年後から、毎年 1 学年ずつまとめて */
export function isGraduationMonth(
  month: Month,
  schoolOpenedAtMonth: Month | null,
): boolean {
  if (schoolOpenedAtMonth === null) return false;
  const elapsed = month - schoolOpenedAtMonth;
  return elapsed >= SCHOOL_DURATION_MONTHS && elapsed % MONTHS_PER_YEAR === 0;
}

/** 在学中の学年数。学費はこの数だけ立つ */
export function enrolledClasses(
  month: Month,
  schoolOpenedAtMonth: Month | null,
): number {
  if (schoolOpenedAtMonth === null || month < schoolOpenedAtMonth) return 0;
  let count = 0;
  for (let enrolled = schoolOpenedAtMonth; enrolled <= month; enrolled += MONTHS_PER_YEAR) {
    if (enrolled > month - SCHOOL_DURATION_MONTHS) count++;
  }
  return count;
}

/** 学費収入。年額を月に均す */
export function tuitionRevenueFor(classes: number): Man {
  return (classes * SCHOOL_CLASS_SIZE * SCHOOL_TUITION_PER_YEAR) / MONTHS_PER_YEAR;
}

export interface NurseTickInput {
  previousNurses: number;
  required: number;
  /** この月に入職する自校の卒業生 */
  graduates: number;
}

export interface NurseTickOutput {
  nurses: number;
  fromSchool: number;
  fromMarket: number;
}

/**
 * 看護師の増減。
 *
 *   在籍 × (1 - 離職率) ＋ 卒業生 ＋ 市場採用（不足分まで、上限 1.2 人/Q）
 *
 * 必要数を超えては抱えない。医師が減った月に在籍が必要数まで落ちるのはこのため。
 */
export function tickNurses(input: NurseTickInput): NurseTickOutput {
  const retained = input.previousNurses * (1 - NURSE_ATTRITION_RATE);
  const fromSchool = input.graduates;
  const shortfall = Math.max(0, input.required - (retained + fromSchool));
  const fromMarket = Math.min(NURSE_MARKET_HIRES_PER_MONTH, shortfall);
  const nurses = Math.min(input.required, retained + fromSchool + fromMarket);
  return { nurses, fromSchool, fromMarket };
}

/** 全社の看護師を各院へ医師数で按分する */
export function allocateNurses(
  nurses: number,
  doctorsByClinic: Record<ClinicId, number>,
): Record<ClinicId, number> {
  const total = Object.values(doctorsByClinic).reduce((a, b) => a + b, 0);
  const out: Record<ClinicId, number> = {};
  for (const [id, doctors] of Object.entries(doctorsByClinic)) {
    out[id] = total === 0 ? 0 : nurses * (doctors / total);
  }
  return out;
}
