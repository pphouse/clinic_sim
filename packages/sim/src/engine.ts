/**
 * 中核エンジン。刻みは 1 ヶ月。
 *
 * 因果の鎖：
 *   診察枠（医師数 × 看護師充足率）
 *     → 稼働率 → 待ち時間
 *       → 評判（緩慢に動くストック変数）→ 3ヶ月後の新規患者
 *       → 離脱率 → 患者ストック
 *         → 収益
 *
 * 遅延の源泉は 2 つある。どちらも意図的なもので、消してはいけない：
 *   1. 新規患者が「3ヶ月前の」評判に依存する
 *   2. 評判が緩慢に動く（基準値へ戻るのに1ヶ月あたり 5.3%）
 *
 * 検証済みの挙動：医師 1 名の欠員が 1 年続くと、
 *   待ち時間は 19〜21ヶ月目に 53 分でピーク、患者ストックの底は 31〜33ヶ月目。遅延 1 年。
 *   評判は 1 年で 75 → 41 まで落ちるが、戻すのに 4 年近くかかる。
 *   壊すのは一瞬、直すのは何年。
 *
 * ★率の扱い：離脱率と評判の回帰率は四半期で検証された値なので、
 *   monthlyFromQuarterly() で複利のまま月に割る。単純に3で割らない。
 */
import {
  BASE_CHURN_RATE_PER_QUARTER,
  BASE_WAIT_MINUTES,
  BASELINE_REPUTATION,
  CHURN_PER_EXCESS_MINUTE_PER_QUARTER,
  CLINIC_DAYS_PER_MONTH,
  CLINIC_FIXED_COST_PER_MONTH,
  CONGESTION_EXPONENT,
  DOCTOR_COST_PER_MONTH,
  MONTHS_PER_QUARTER,
  MONTHS_PER_YEAR,
  NURSE_COST_PER_MONTH,
  POINTS_PER_VISIT,
  REPUTATION_MAX,
  REPUTATION_MIN,
  REPUTATION_PENALTY_PER_MINUTE,
  REPUTATION_RECOVERY_RATE,
  SELF_PAY_YEN_PER_PATIENT,
  SUPPLIES_RATE,
  TOLERABLE_WAIT_MINUTES,
  VISITS_PER_DOCTOR_PER_DAY,
  VISITS_PER_PATIENT_PER_MONTH,
  YEN_PER_MAN,
  YEN_PER_POINT,
  monthlyFromQuarterly,
} from './constants';
import type { ClinicConfig, ClinicTick, Man, Month } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 医師数から決まる診察枠（月あたり） */
export function capacityOf(doctors: number): number {
  return doctors * VISITS_PER_DOCTOR_PER_DAY * CLINIC_DAYS_PER_MONTH;
}

/**
 * 待ち時間。稼働率が 1 を超えると急激に伸びる。
 * 稼働率 1.3 で約 1.9 倍、1.6 で約 3.2 倍。
 * 稼働率は無次元なので、刻みを月にしても式は変わらない。
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
 * 回帰が遅いので、一度落ちると戻すのに何年もかかる。
 */
export function nextReputation(previous: number, waitMinutes: number): number {
  const recovered = previous + (BASELINE_REPUTATION - previous) * REPUTATION_RECOVERY_RATE;
  const damaged = recovered - excessWait(waitMinutes) * REPUTATION_PENALTY_PER_MINUTE;
  return clamp(damaged, REPUTATION_MIN, REPUTATION_MAX);
}

/** 検証モデルの離脱率（四半期あたり）。**この式は変えない** */
export function quarterlyChurnRateOf(waitMinutes: number): number {
  return (
    BASE_CHURN_RATE_PER_QUARTER + excessWait(waitMinutes) * CHURN_PER_EXCESS_MINUTE_PER_QUARTER
  );
}

/**
 * 1ヶ月あたりの離脱率。
 * 3ヶ月複利で掛けると検証モデルの四半期離脱率に一致する。
 */
export function churnRateOf(waitMinutes: number): number {
  return monthlyFromQuarterly(quarterlyChurnRateOf(waitMinutes));
}

/** 新規患者は「3ヶ月前の」評判に依存する。これが遅延の源泉 */
export function newPatientsOf(potential: number, laggedReputation: number): number {
  return (potential * laggedReputation) / BASELINE_REPUTATION;
}

export interface ClinicTickInput {
  config: ClinicConfig;
  month: Month;
  /** 前月の患者ストック。開院月は initialPatientStock を使う */
  previousStock: number;
  previousReputation: number;
  /** 3ヶ月前の評判。新規患者はこれで決まる（遅延の源泉①） */
  laggedReputation: number;
  doctors: number;
  /** 全社の看護師充足率 0〜1 */
  nurseSufficiency: number;
  /** 全社の看護師のうち、この診療所に按分される人数 */
  allocatedNurses: number;
  /** 診療報酬の実効点数指数（基準 100） */
  effectiveFeeIndex: number;
}

export function tickClinic(input: ClinicTickInput): ClinicTick {
  const { config, month, doctors, nurseSufficiency, allocatedNurses, effectiveFeeIndex } = input;
  const id = config.id;

  const isOpen = month >= config.openMonth;
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

  // 開院月は承継した患者ストックから始まる
  const isFirstMonth = month === config.openMonth;
  const openingStock = isFirstMonth ? config.initialPatientStock : input.previousStock;

  const newPatients = newPatientsOf(config.newPatientPotential, input.laggedReputation);
  const demandVisits = openingStock * VISITS_PER_PATIENT_PER_MONTH + newPatients;

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
        doctors * DOCTOR_COST_PER_MONTH +
        allocatedNurses * NURSE_COST_PER_MONTH +
        CLINIC_FIXED_COST_PER_MONTH;

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

// ---------------------------------------------------------------- 暦
//
// 年度は 4 月始まり。恣意的な選択ではなく、診療報酬改定が偶数年の 4 月に
// 施行されることに合わせている。月1＝1年目4月と置くと、既定シナリオの改定
// （13・37・61・85・109ヶ月目）が全て 4 月に落ちる。

/** 開業からの年度（1 始まり） */
export function fiscalYearOf(month: Month): number {
  return Math.floor((month - 1) / MONTHS_PER_YEAR) + 1;
}

/** 年度内の何ヶ月目か（1〜12。1 = 4月） */
export function monthOfFiscalYear(month: Month): number {
  return ((month - 1) % MONTHS_PER_YEAR) + 1;
}

/** 暦の月（1〜12） */
export function calendarMonthOf(month: Month): number {
  return ((monthOfFiscalYear(month) + 2) % MONTHS_PER_YEAR) + 1;
}

/** 年度内の四半期（1〜4）。四半期の帳票を出すときに使う */
export function quarterOfFiscalYear(month: Month): number {
  return Math.floor((monthOfFiscalYear(month) - 1) / MONTHS_PER_QUARTER) + 1;
}

/** 通算の四半期インデックス（1 始まり）。検証データとの突き合わせに使う */
export function quarterIndexOf(month: Month): number {
  return Math.floor((month - 1) / MONTHS_PER_QUARTER) + 1;
}

/** 画面に出すラベル。「2年目 10月」 */
export function monthLabel(month: Month): string {
  return `${fiscalYearOf(month)}年目 ${calendarMonthOf(month)}月`;
}

/** 内部用の短いラベル。ログとテストの見出し用 */
export function monthCode(month: Month): string {
  return `Y${fiscalYearOf(month)}M${String(monthOfFiscalYear(month)).padStart(2, '0')}`;
}
