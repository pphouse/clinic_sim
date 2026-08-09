/**
 * シミュレーション定数。
 *
 * 全て会話内で構築した検証モデル（med_sim2.xlsx）の前提値。仮置きであり、
 * 実在の診療報酬点数・給与水準・学費ではない。
 * 値を変えたらゴールデンテストが落ちる。落として良いのは docs/spec を先に更新したときだけ。
 */
import type { Addon, ClinicConfig, FeeRevision, Man } from './types';

export const QUARTERS_PER_YEAR = 4;
export const TOTAL_QUARTERS = 40; // 10年

// --- 診察キャパシティ
export const CLINIC_DAYS_PER_QUARTER = 60;
export const VISITS_PER_DOCTOR_PER_DAY = 32;
export const VISITS_PER_PATIENT_PER_QUARTER = 1.6;

// --- 患者ストックの挙動（★中核）
export const BASE_CHURN_RATE = 0.04;
export const TOLERABLE_WAIT_MINUTES = 20;
export const CONGESTION_EXPONENT = 2.5;
export const BASE_WAIT_MINUTES = 15;
/** 許容待ち時間の超過1分あたり、離脱率に上乗せされる率 */
export const CHURN_PER_EXCESS_MINUTE = 0.0025;
/** 超過1分あたり評判が削られる pt */
export const REPUTATION_PENALTY_PER_MINUTE = 0.6;
/** 基準評判へ戻る速さ。これが小さいので回復が遅い */
export const REPUTATION_RECOVERY_RATE = 0.15;
export const BASELINE_REPUTATION = 75;
export const INITIAL_REPUTATION = 75;
export const REPUTATION_MIN = 20;
export const REPUTATION_MAX = 100;

// --- 収益
export const POINTS_PER_VISIT = 750;
export const YEN_PER_POINT = 10;
/** 患者1人あたり四半期の自費診療単価（円） */
export const SELF_PAY_YEN_PER_PATIENT = 1800;
export const YEN_PER_MAN = 10000;

// --- 人材
export const DOCTOR_COST_PER_QUARTER = 500;
export const NURSE_COST_PER_QUARTER = 125;
export const NURSES_PER_DOCTOR = 2.5;
export const NURSE_ATTRITION_RATE = 0.05;
/** 全社合計。ここが最大のボトルネック */
export const NURSE_MARKET_HIRES_PER_QUARTER = 1.2;
export const AGENCY_FEE_PER_DOCTOR = 500;

// --- 医局
export const RELATION_PER_IGYOKU_SLOT = 20;
export const RELATION_DECAY_PER_QUARTER = 2;
export const IGYOKU_RELATION_COST_PER_QUARTER = 120;

// --- 看護学校
export const SCHOOL_CAPEX = 25000;
export const SCHOOL_OPERATING_PER_QUARTER = 1500;
export const SCHOOL_CLASS_SIZE = 40;
export const SCHOOL_TUITION_PER_YEAR = 60;
export const SCHOOL_YEARS = 3;
export const SCHOOL_GRADUATION_RATE = 0.85;
/** 残りは他院へ流出する */
export const SCHOOL_RETENTION_RATE = 0.35;

// --- コスト・財務
export const SUPPLIES_RATE = 0.18;
export const CLINIC_FIXED_COST_PER_QUARTER = 450;
export const HQ_COST_PER_QUARTER = 250;
export const CLINIC_CAPEX = 6000;
export const INITIAL_CASH = 15000;
export const CLINIC_LOAN = 8000;
export const SCHOOL_LOAN = 25000;
export const LOAN_QUARTERLY_RATE = 0.005;
export const LOAN_REPAYMENT_RATE = 0.025;

// --- 会計（エクセルには無かった。ここで新設）
/** 医療機器 5年 */
export const USEFUL_LIFE_EQUIPMENT = 20;
/** 内装 10年 */
export const USEFUL_LIFE_INTERIOR = 40;
/** 校舎 20年 */
export const USEFUL_LIFE_BUILDING = 80;
/** 開業投資のうち医療機器が占める割合。残りは内装 */
export const CLINIC_CAPEX_EQUIPMENT_SHARE = 0.6;
/** レセプトの入金遅れ。約2ヶ月 = 0.67四半期分が未収金として滞留する */
export const RECEIVABLE_QUARTERS = 0.67;
export const CORPORATE_TAX_RATE = 0.3;

export const CLINICS: ClinicConfig[] = [
  { id: 'A', name: 'A院（本院）', openQuarter: 1, newPatientPotential: 150, initialPatientStock: 3200 },
  { id: 'B', name: 'B院', openQuarter: 7, newPatientPotential: 130, initialPatientStock: 0 },
  { id: 'C', name: 'C院', openQuarter: 15, newPatientPotential: 110, initialPatientStock: 0 },
];

export const FEE_REVISIONS: FeeRevision[] = [
  { id: 'rev1', name: '改定#1', effectiveQuarter: 5, rate: -0.04 },
  { id: 'rev2', name: '改定#2', effectiveQuarter: 13, rate: 0.03 },
  { id: 'rev3', name: '改定#3', effectiveQuarter: 21, rate: -0.05 },
  { id: 'rev4', name: '改定#4', effectiveQuarter: 29, rate: 0.02 },
  { id: 'rev5', name: '改定#5', effectiveQuarter: 37, rate: -0.03 },
];

/**
 * 加算。検証の結果、このゲームの実質的な主戦場はここだと分かっている。
 * 5つ揃うと点数が +19% 乗り、改定のマイナス(-5%)を打ち消してしまう。
 */
export const ADDONS: Addon[] = [
  { id: 'kinou', name: '機能強化加算', effect: 0.03, acquisitionCost: 800, requiredDoctors: 3, requiredNurseSufficiency: 0.9, expiresAtQuarter: 41 },
  { id: 'zaitaku', name: '在宅療養支援加算', effect: 0.06, acquisitionCost: 2500, requiredDoctors: 5, requiredNurseSufficiency: 0.95, expiresAtQuarter: 41 },
  { id: 'seikatsu', name: '生活習慣病管理加算', effect: 0.05, acquisitionCost: 1200, requiredDoctors: 4, requiredNurseSufficiency: 0.9, expiresAtQuarter: 41 },
  { id: 'jikangai', name: '時間外対応加算', effect: 0.02, acquisitionCost: 600, requiredDoctors: 6, requiredNurseSufficiency: 0.9, expiresAtQuarter: 41 },
  { id: 'dx', name: '医療DX推進加算', effect: 0.03, acquisitionCost: 1500, requiredDoctors: 5, requiredNurseSufficiency: 0.85, expiresAtQuarter: 41 },
];

// ==================================================================
// 設備・システム（docs/spec/screens/vendor.md）
// エクセルの検証モデルには無い。新規追加のため、ゴールデンテストの対象外。
// 実装したら vendor.test.ts で個別に検証すること。
// ==================================================================

/** リースは購入より総額で 15% 割高。代わりに資産計上せず現金が平準化される */
export const LEASE_PREMIUM = 0.15;
export const LEASE_TERM_QUARTERS = 20;
/** 保守契約の年額。機器価格に対する率 */
export const MAINTENANCE_RATE = 0.08;
/** 保守未加入で故障したときの復旧までの四半期数 */
export const BREAKDOWN_REPAIR_QUARTERS = 2;

export type EmrTier = 'single' | 'chain' | 'enterprise';

export interface EmrTierSpec {
  id: EmrTier;
  name: string;
  upfrontCost: Man;
  /** 四半期あたりの保守料 */
  recurringCost: Man;
  /** 法人統合に対応するか。false だと分院を跨いだ運用ができない */
  supportsMultiSite: boolean;
  /** 医療DX推進加算の要件を満たすか */
  satisfiesDxAddon: boolean;
  /** 移行時に診察枠が落ちる率 */
  migrationCapacityPenalty: number;
  /** 枠が落ちている四半期数 */
  migrationPenaltyQuarters: number;
}

/**
 * カルテ移行は「プレイヤーが自分で起こす医師不足」。
 * 診察枠が落ちる → 待ち時間 → 評判 → 4四半期後に患者ストック、という
 * 検証済みの経路をそのまま通る。
 */
export const EMR_TIERS: EmrTierSpec[] = [
  { id: 'single',     name: '単院向け',     upfrontCost: 300,  recurringCost: 45,  supportsMultiSite: false, satisfiesDxAddon: false, migrationCapacityPenalty: 0,    migrationPenaltyQuarters: 0 },
  { id: 'chain',      name: 'チェーン対応', upfrontCost: 1500, recurringCost: 180, supportsMultiSite: true,  satisfiesDxAddon: true,  migrationCapacityPenalty: 0.20, migrationPenaltyQuarters: 2 },
  { id: 'enterprise', name: '大手統合',     upfrontCost: 4000, recurringCost: 450, supportsMultiSite: true,  satisfiesDxAddon: true,  migrationCapacityPenalty: 0.25, migrationPenaltyQuarters: 3 },
];

/** 移行費用の基準となる患者データ量。遅らせるほど高くつく */
export const EMR_MIGRATION_BASE_PATIENTS = 3000;

/**
 * 移行費用はデータ量に比例する。これがロックイン。
 * 序盤に安物を選ぶと、中盤で身動きが取れなくなる。
 */
export function emrMigrationCost(tier: EmrTierSpec, totalPatientStock: number): Man {
  return tier.upfrontCost * (1 + totalPatientStock / EMR_MIGRATION_BASE_PATIENTS);
}

export interface AiToolSpec {
  id: string;
  name: string;
  upfrontCost: Man;
  recurringCost: Man;
  /** 医師1人1日あたりの診察可能数への上乗せ */
  visitsPerDoctorPerDayBonus: number;
}

/**
 * ★設計上の要点：AI は診察枠を増やすが、施設基準の「必要医師数」にはカウントされない。
 *
 * 常勤医1名 = +32人/日 かつ 施設基準を満たす（コスト 500万/四半期）
 * AI        = +3〜4人/日 で 施設基準は満たさない（コスト 数十万/四半期）
 *
 * 安く捌けるようになるのに点数は上がらない、という歪みがこの機能の存在理由。
 * この非対称を消すと、AI はただの「効率化ボタン」になって判断が消える。
 */
export const AI_TOOLS: AiToolSpec[] = [
  { id: 'triage',   name: '問診AI',     upfrontCost: 400,  recurringCost: 30, visitsPerDoctorPerDayBonus: 3 },
  { id: 'imaging',  name: '画像診断AI', upfrontCost: 1200, recurringCost: 60, visitsPerDoctorPerDayBonus: 4 },
];
