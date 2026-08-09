/**
 * 拡張系。外部関係・機器/カルテ/AI・門前薬局・不動産・個人資産。
 *
 * 検証モデル（med_sim2.xlsx）には無い後付けの系をここに集めた。
 * **既定は全て「何も起きていない」。** 意思決定で起こさない限り、
 * 関係値は 0、カルテは紙、機器も薬局も物件も無く、係数は全部 1 で返る。
 *
 * この性質は設計上の都合ではなく、検証済みの核を守るための約束：
 * 起点になる `baseline.golden.json` は 40 四半期ぶんの検証結果で、
 * ここが 1 でなくなった瞬間に検証済みの数字が動く。
 * **どの関数も「使っていないときは恒等」であることを維持する。**
 *
 * 純粋関数のみ。Date も Math.random も使わない（CLAUDE.md §1）。
 */
import {
  BREAKDOWN_CHANCE_PER_MONTH,
  BREAKDOWN_REPAIR_MONTHS,
  CARE_MANAGER_MAX_HOME_SHARE,
  CLINIC_FIXED_COST_PER_MONTH,
  EMR_TIERS,
  EQUIPMENT_CATALOG,
  EXTERNAL_RELATIONS,
  HOME_CARE_CAPACITY_DRAG,
  HOME_CARE_SELF_PAY_UPLIFT,
  LEASE_PREMIUM,
  LEASE_TERM_MONTHS,
  MAINTENANCE_RATE,
  MEDICAL_ASSOCIATION_CAPACITY_DRAG,
  MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD,
  MEDICAL_ASSOCIATION_REVENUE_PER_POINT,
  MONTHS_PER_YEAR,
  PERSONAL_ASSETS,
  PERSONAL_RANKS,
  PERSONAL_TAX_RATE,
  PHARMACY_BASE_RENT,
  PHARMACY_RENT_PER_PATIENT,
  PROPERTY_PRICE,
  CLINIC_RENT_SHARE,
  REFERRAL_MAX_UPLIFT,
  AI_TOOLS,
  emrMigrationCost,
} from './constants';
import type {
  AiToolView,
  ClinicId,
  EmrTier,
  EquipmentView,
  ExternalRelationId,
  Man,
  Month,
  OwnedEquipment,
  PersonalAssetView,
  PersonalTick,
  PharmacyTick,
  PharmacyView,
  PropertyView,
  RealEstateTick,
  RelationView,
  RelationsTick,
  Rng,
  VendorTick,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 何も起こしていない状態の関係値。3つとも 0 から始まる */
export function initialRelations(): Record<ExternalRelationId, number> {
  return { medicalAssociation: 0, referralHospital: 0, careManager: 0 };
}

export function initialRelationActivity(): Record<ExternalRelationId, boolean> {
  return { medicalAssociation: false, referralHospital: false, careManager: false };
}

// ==================================================================
// 外部関係
// ==================================================================

/**
 * 関係値を1ヶ月進める。
 *
 * 活動した月は上がり、しなかった月は下がる。**一度も活動していない相手は
 * 0 のまま下がりようがない**ので、使わない限りこの系は完全に眠っている。
 *
 * openedClinics は今月開院した数。分院を出すと医師会の関係が落ちる
 * （地域の同業者から見れば競合の出店でしかない）。これが成長ブレーキ。
 */
export function advanceRelations(input: {
  current: Record<ExternalRelationId, number>;
  active: Record<ExternalRelationId, boolean>;
  openedClinics: number;
  openingPenalty: number;
}): Record<ExternalRelationId, number> {
  const next = { ...input.current };
  for (const spec of EXTERNAL_RELATIONS) {
    const isActive = input.active[spec.id];
    const delta = isActive ? spec.gainPerMonth : -spec.decayPerMonth;
    const penalty =
      spec.id === 'medicalAssociation' ? input.openedClinics * input.openingPenalty : 0;
    next[spec.id] = clamp(next[spec.id] + delta - penalty, 0, spec.max);
  }
  return next;
}

/** 関係値から今月の効き目を引く。全て 0 なら恒等（係数 1、収入 0、費用 0） */
export function relationsTickOf(
  values: Record<ExternalRelationId, number>,
  active: Record<ExternalRelationId, boolean>,
): RelationsTick {
  const relations: RelationView[] = EXTERNAL_RELATIONS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    value: values[spec.id],
    active: active[spec.id],
    monthlyCost: spec.monthlyCost,
    effect: spec.effect,
  }));

  const shikai = values.medicalAssociation;
  const contractRevenue: Man =
    shikai >= MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD
      ? shikai * MEDICAL_ASSOCIATION_REVENUE_PER_POINT
      : 0;

  const referralUplift = REFERRAL_MAX_UPLIFT * (values.referralHospital / 100);
  const homeCareShare = CARE_MANAGER_MAX_HOME_SHARE * (values.careManager / 100);

  const totalCost = EXTERNAL_RELATIONS.reduce(
    (sum, spec) => sum + (active[spec.id] ? spec.monthlyCost : 0),
    0,
  );

  return { relations, contractRevenue, referralUplift, homeCareShare, totalCost };
}

/** 関係値が診察枠に効く分。当番医で出る時間と、在宅の訪問で出る時間 */
export function relationCapacityMultiplier(tick: RelationsTick, shikaiValue: number): number {
  const shikaiDrag = MEDICAL_ASSOCIATION_CAPACITY_DRAG * (shikaiValue / 100);
  const homeDrag = HOME_CARE_CAPACITY_DRAG * tick.homeCareShare;
  return Math.max(0.1, 1 - shikaiDrag - homeDrag);
}

/** 在宅は単価が高い。在宅比率のぶんだけ自費が乗る */
export function relationSelfPayMultiplier(tick: RelationsTick): number {
  return 1 + tick.homeCareShare * (HOME_CARE_SELF_PAY_UPLIFT - 1);
}

// ==================================================================
// システム・機器商社
// ==================================================================

export function emrTierSpecOf(tier: EmrTier | null) {
  return tier === null ? undefined : EMR_TIERS.find((t) => t.id === tier);
}

/** 紙カルテのときは「紙カルテ」と出す。null をそのまま画面に出さない */
export function emrTierName(tier: EmrTier | null): string {
  return emrTierSpecOf(tier)?.name ?? '紙カルテ';
}

/** 機器のリース料（万円/月）。総額は購入より LEASE_PREMIUM だけ高い */
export function leaseMonthlyCost(price: Man): Man {
  return (price * (1 + LEASE_PREMIUM)) / LEASE_TERM_MONTHS;
}

/** 保守料（万円/月）。年額は機器価格の MAINTENANCE_RATE */
export function maintenanceMonthlyCost(price: Man): Man {
  return (price * MAINTENANCE_RATE) / MONTHS_PER_YEAR;
}

/**
 * 保守未加入の機器を故障させる。
 *
 * **加入していれば一度も引かない。** 引かなければ rng の状態も進まないので、
 * 保守に入っている限りこの関数は完全に決定的な恒等写像になる。
 */
export function rollBreakdowns(input: {
  equipment: OwnedEquipment[];
  maintenanceContract: boolean;
  month: Month;
  rng: Rng;
}): { equipment: OwnedEquipment[]; brokenIds: string[] } {
  const brokenIds: string[] = [];
  if (input.maintenanceContract || input.equipment.length === 0) {
    return { equipment: input.equipment, brokenIds };
  }
  const next = input.equipment.map((item) => {
    // 故障中のものは復旧を待つだけ。二重に壊れない
    if (item.repairedAtMonth !== null) {
      return item.repairedAtMonth <= input.month ? { ...item, repairedAtMonth: null } : item;
    }
    if (!input.rng.chance(BREAKDOWN_CHANCE_PER_MONTH)) return item;
    brokenIds.push(item.id);
    return { ...item, repairedAtMonth: input.month + BREAKDOWN_REPAIR_MONTHS };
  });
  return { equipment: next, brokenIds };
}

export interface VendorTickInput {
  month: Month;
  emrTier: EmrTier | null;
  emrMigrationEndsAtMonth: Month | null;
  equipment: OwnedEquipment[];
  aiTools: string[];
  maintenanceContract: boolean;
  /** 機器の簿価。B/S から引く。リース分は含まれない */
  equipmentBookValue: Record<string, Man>;
}

/** 商社まわりの今月の状態。何も買っていなければ係数 1・費用 0 で返る */
export function vendorTickOf(input: VendorTickInput): VendorTick {
  const tierSpec = emrTierSpecOf(input.emrTier);
  const migrating =
    input.emrMigrationEndsAtMonth !== null && input.month < input.emrMigrationEndsAtMonth;
  const migrationMonthsLeft = migrating
    ? (input.emrMigrationEndsAtMonth ?? input.month) - input.month
    : 0;
  const migrationCapacityPenalty = migrating ? (tierSpec?.migrationCapacityPenalty ?? 0) : 0;

  const equipment: EquipmentView[] = EQUIPMENT_CATALOG.map((spec) => {
    const owned = input.equipment.find((e) => e.id === spec.id);
    const broken = owned?.repairedAtMonth != null;
    return {
      id: spec.id,
      name: spec.name,
      price: spec.price,
      owned: owned !== undefined,
      leased: owned?.leased ?? false,
      broken,
      repairedAtMonth: owned?.repairedAtMonth ?? null,
      selfPayUplift: spec.selfPayUplift,
      bookValue: input.equipmentBookValue[spec.id] ?? 0,
    };
  });

  // 故障中の機器は上乗せを失う。保守を切った代償はここで出る
  const equipmentSelfPayUplift = equipment
    .filter((e) => e.owned && !e.broken)
    .reduce((sum, e) => sum + e.selfPayUplift, 0);

  const aiTools: AiToolView[] = AI_TOOLS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    adopted: input.aiTools.includes(spec.id),
    upfrontCost: spec.upfrontCost,
    recurringCost: spec.recurringCost,
    visitsPerDoctorPerDayBonus: spec.visitsPerDoctorPerDayBonus,
  }));
  const extraVisitsPerDoctorPerDay = aiTools
    .filter((t) => t.adopted)
    .reduce((sum, t) => sum + t.visitsPerDoctorPerDayBonus, 0);

  const leaseExpense = equipment
    .filter((e) => e.owned && e.leased)
    .reduce((sum, e) => sum + leaseMonthlyCost(e.price), 0);
  const maintenance = input.maintenanceContract
    ? equipment.filter((e) => e.owned).reduce((sum, e) => sum + maintenanceMonthlyCost(e.price), 0)
    : 0;
  const aiRecurring = aiTools.filter((t) => t.adopted).reduce((sum, t) => sum + t.recurringCost, 0);
  const emrRecurring = tierSpec?.recurringCost ?? 0;

  return {
    emrTier: input.emrTier,
    emrTierName: emrTierName(input.emrTier),
    migrating,
    migrationMonthsLeft,
    migrationCapacityPenalty,
    equipment,
    aiTools,
    extraVisitsPerDoctorPerDay,
    equipmentSelfPayUplift,
    maintenanceContract: input.maintenanceContract,
    recurringCost: leaseExpense + maintenance + aiRecurring + emrRecurring,
    leaseExpense,
  };
}

/** 移行費用。データ量に比例するので、遅らせるほど高くつく */
export function migrationCostFor(tier: EmrTier, totalPatientStock: number): Man {
  const spec = EMR_TIERS.find((t) => t.id === tier);
  return spec === undefined ? 0 : emrMigrationCost(spec, totalPatientStock);
}

// ==================================================================
// 門前薬局
// ==================================================================

/**
 * 賃料は定額＋患者数の歩合。**診療とは別系統の安定収入。**
 * 患者が減れば賃料も減るので、完全な独立収入ではない。
 */
export function pharmacyRentOf(patientStock: number): Man {
  return PHARMACY_BASE_RENT + patientStock * PHARMACY_RENT_PER_PATIENT;
}

export function pharmacyTickOf(input: {
  clinics: { id: ClinicId; name: string; patientStock: number; open: boolean }[];
  invitedAt: Record<ClinicId, Month>;
}): PharmacyTick {
  const pharmacies: PharmacyView[] = input.clinics.map((c) => {
    const invitedAtMonth = input.invitedAt[c.id] ?? null;
    const invited = invitedAtMonth !== null;
    return {
      clinicId: c.id,
      clinicName: c.name,
      invited,
      invitedAtMonth,
      rent: invited && c.open ? pharmacyRentOf(c.patientStock) : 0,
    };
  });
  return {
    pharmacies,
    rentalRevenue: pharmacies.reduce((sum, p) => sum + p.rent, 0),
  };
}

// ==================================================================
// 不動産
// ==================================================================

/** 保有に切り替えた院の家賃は消える。代わりに建物の償却が乗る */
export function realEstateTickOf(input: {
  clinics: { id: ClinicId; name: string; open: boolean }[];
  ownedSince: Record<ClinicId, Month>;
  bookValueByClinic: Record<ClinicId, Man>;
}): RealEstateTick {
  const properties: PropertyView[] = input.clinics.map((c) => {
    const ownedSinceMonth = input.ownedSince[c.id] ?? null;
    const owned = ownedSinceMonth !== null;
    return {
      clinicId: c.id,
      clinicName: c.name,
      owned,
      ownedSinceMonth,
      price: PROPERTY_PRICE,
      bookValue: input.bookValueByClinic[c.id] ?? 0,
      rentSaved: owned && c.open ? CLINIC_FIXED_COST_PER_MONTH * CLINIC_RENT_SHARE : 0,
    };
  });
  return {
    properties,
    rentSaved: properties.reduce((sum, p) => sum + p.rentSaved, 0),
    bookValue: properties.reduce((sum, p) => sum + p.bookValue, 0),
  };
}

/** その院の固定費に掛ける係数。保有していれば家賃ぶんだけ落ちる */
export function rentMultiplierFor(owned: boolean): number {
  return owned ? 1 - CLINIC_RENT_SHARE : 1;
}

// ==================================================================
// 個人資産
// ==================================================================

export function personalRankOf(prestige: number): string {
  return PERSONAL_RANKS.find((r) => prestige >= r.minPrestige)?.label ?? PERSONAL_RANKS[0]!.label;
}

/**
 * 見栄レイヤー。**法人の数字には一切効かない。**
 * 効かせた瞬間に「クルーザーを買うと患者が増える」という嘘の因果ができる。
 */
export function personalTickOf(input: {
  salary: Man;
  cumulativeSalary: Man;
  cash: Man;
  owned: string[];
}): PersonalTick {
  const assets: PersonalAssetView[] = PERSONAL_ASSETS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    price: spec.price,
    prestige: spec.prestige,
    note: spec.note,
    owned: input.owned.includes(spec.id),
  }));
  const assetValue = assets.filter((a) => a.owned).reduce((sum, a) => sum + a.price, 0);
  const prestige = assets.filter((a) => a.owned).reduce((sum, a) => sum + a.prestige, 0);
  const netSalary = input.salary * (1 - PERSONAL_TAX_RATE);

  return {
    salary: input.salary,
    netSalary,
    cumulativeSalary: input.cumulativeSalary,
    cash: input.cash,
    assets,
    assetValue,
    prestige,
    rank: personalRankOf(prestige),
    netWorth: input.cash + assetValue,
  };
}
