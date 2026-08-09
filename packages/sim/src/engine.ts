/**
 * 中核エンジン。
 *
 * 因果の鎖：
 *   診察枠（医師数 × 看護師充足率）
 *     → 稼働率 → 待ち時間
 *       → 評判（緩慢に動くストック変数）→ 翌四半期の新規患者
 *       → 離脱率 → 患者ストック
 *         → 収益
 *
 * 遅延の源泉は 2 つある。どちらも意図的なもので、消してはいけない：
 *   1. 新規患者が「前四半期の」評判に依存する（1Q の遅れ）
 *   2. 評判が緩慢に動く（REPUTATION_RECOVERY_RATE = 0.15）
 *
 * 検証済みの挙動：医師 1 名の欠員が 4 四半期続くと、
 *   待ち時間は Q7 に 53 分でピーク、患者ストックの底は Q11。遅延 4 四半期。
 *   評判は 4 四半期で 75 → 41 まで落ちるが、戻すのに 15 四半期かかる。
 *   壊すのは一瞬、直すのは何年。
 */
import {
  BASE_CHURN_RATE,
  BASE_WAIT_MINUTES,
  BASELINE_REPUTATION,
  CHURN_PER_EXCESS_MINUTE,
  CLINIC_DAYS_PER_QUARTER,
  CLINIC_FIXED_COST_PER_QUARTER,
  CONGESTION_EXPONENT,
  DOCTOR_COST_PER_QUARTER,
  NURSE_COST_PER_QUARTER,
  POINTS_PER_VISIT,
  REPUTATION_MAX,
  REPUTATION_MIN,
  REPUTATION_PENALTY_PER_MINUTE,
  REPUTATION_RECOVERY_RATE,
  SELF_PAY_YEN_PER_PATIENT,
  SUPPLIES_RATE,
  TOLERABLE_WAIT_MINUTES,
  VISITS_PER_DOCTOR_PER_DAY,
  VISITS_PER_PATIENT_PER_QUARTER,
  YEN_PER_MAN,
  YEN_PER_POINT,
} from './constants';
import type { ClinicConfig, ClinicTick, Man, Quarter } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 医師数から決まる診察枠 */
export function capacityOf(doctors: number): number {
  return doctors * VISITS_PER_DOCTOR_PER_DAY * CLINIC_DAYS_PER_QUARTER;
}

/**
 * 待ち時間。稼働率が 1 を超えると急激に伸びる。
 * 稼働率 1.3 で約 1.9 倍、1.6 で約 3.2 倍。
 */
export function waitMinutesOf(utilization: number): number {
  if (utilization <= 0) return 0;
  return BASE_WAIT_MINUTES * Math.pow(Math.max(1, utilization), CONGESTION_EXPONENT);
}

/** 許容待ち時間の超過分。ここが 0 なら評判も離脱も動かない */
export function excessWait(waitMinutes: number): number {
  return Math.max(0, waitMinutes - TOLERABLE_WAIT_MINUTES);
}

/**
 * 評判の更新。基準値へ緩やかに回帰しつつ、待ち時間の超過で削られる。
 * 回帰が遅い（0.15/Q）ので、一度落ちると戻すのに何年もかかる。
 */
export function nextReputation(previous: number, waitMinutes: number): number {
  const recovered = previous + (BASELINE_REPUTATION - previous) * REPUTATION_RECOVERY_RATE;
  const damaged = recovered - excessWait(waitMinutes) * REPUTATION_PENALTY_PER_MINUTE;
  return clamp(damaged, REPUTATION_MIN, REPUTATION_MAX);
}

export function churnRateOf(waitMinutes: number): number {
  return BASE_CHURN_RATE + excessWait(waitMinutes) * CHURN_PER_EXCESS_MINUTE;
}

/** 新規患者は「前四半期の」評判に依存する。これが遅延の源泉 */
export function newPatientsOf(potential: number, previousReputation: number): number {
  return (potential * previousReputation) / BASELINE_REPUTATION;
}

export interface ClinicTickInput {
  config: ClinicConfig;
  quarter: Quarter;
  /** 前四半期の患者ストック。開院四半期は initialPatientStock を使う */
  previousStock: number;
  previousReputation: number;
  doctors: number;
  /** 全社の看護師充足率 0〜1 */
  nurseSufficiency: number;
  /** 全社の看護師のうち、この診療所に按分される人数 */
  allocatedNurses: number;
  /** 診療報酬の実効点数指数（基準 100） */
  effectiveFeeIndex: number;
}

export function tickClinic(input: ClinicTickInput): ClinicTick {
  const { config, quarter, doctors, nurseSufficiency, allocatedNurses, effectiveFeeIndex } = input;
  const id = config.id;

  const isOpen = quarter >= config.openQuarter;
  if (!isOpen) {
    return {
      id,
      newPatients: 0, patientStock: 0, demandVisits: 0,
      capacity: 0, effectiveCapacity: 0, utilization: 0,
      waitMinutes: 0, reputation: input.previousReputation, churnRate: 0,
      visitsServed: 0, insuranceRevenue: 0, selfPayRevenue: 0,
      operatingCost: 0, operatingIncome: 0,
    };
  }

  // 開院四半期は承継した患者ストックから始まる
  const isFirstQuarter = quarter === config.openQuarter;
  const openingStock = isFirstQuarter ? config.initialPatientStock : input.previousStock;

  const newPatients = newPatientsOf(config.newPatientPotential, input.previousReputation);
  const demandVisits = openingStock * VISITS_PER_PATIENT_PER_QUARTER + newPatients;

  const capacity = capacityOf(doctors);
  const effectiveCapacity = capacity * nurseSufficiency;
  const utilization = effectiveCapacity === 0 ? 0 : demandVisits / effectiveCapacity;
  const waitMinutes = effectiveCapacity === 0 ? 0 : waitMinutesOf(utilization);

  const reputation = nextReputation(input.previousReputation, waitMinutes);
  const churnRate = churnRateOf(waitMinutes);
  const patientStock = openingStock * (1 - churnRate) + newPatients;

  // 捌けなかった需要は収益にならない。待ち時間として跳ね返るだけ
  const visitsServed = Math.min(demandVisits, effectiveCapacity);

  const insuranceRevenue: Man =
    (visitsServed * POINTS_PER_VISIT * YEN_PER_POINT * (effectiveFeeIndex / 100)) / YEN_PER_MAN;
  const selfPayRevenue: Man = (patientStock * SELF_PAY_YEN_PER_PATIENT) / YEN_PER_MAN;

  const operatingCost: Man =
    doctors === 0
      ? 0
      : (insuranceRevenue + selfPayRevenue) * SUPPLIES_RATE +
        doctors * DOCTOR_COST_PER_QUARTER +
        allocatedNurses * NURSE_COST_PER_QUARTER +
        CLINIC_FIXED_COST_PER_QUARTER;

  return {
    id,
    newPatients,
    patientStock,
    demandVisits,
    capacity,
    effectiveCapacity,
    utilization,
    waitMinutes,
    reputation,
    churnRate,
    visitsServed,
    insuranceRevenue,
    selfPayRevenue,
    operatingCost,
    operatingIncome: insuranceRevenue + selfPayRevenue - operatingCost,
  };
}

export function quarterLabel(q: Quarter): string {
  const year = Math.floor((q - 1) / 4) + 1;
  const quarter = ((q - 1) % 4) + 1;
  return `Y${year}Q${quarter}`;
}
