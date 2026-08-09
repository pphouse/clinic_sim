/**
 * 拡張系の検証。
 *
 * ★この試験群の最重要項目は「既定シナリオが1ミリも動かないこと」。
 * 検証済みの核（baseline.golden.json）は表計算で確かめた 40 四半期であって、
 * 後から足した系がそこへ滲み出したら、検証したという事実そのものが無効になる。
 *
 * それ以外の期待値は**検証されていない**。表計算に対応する列が無く、
 * 「この方向に効く」という設計意図を固定しているだけ。数値を調整するときは
 * docs/spec/screens/ の該当仕様を先に直すこと（CLAUDE.md §4）。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  CARE_MANAGER_MAX_HOME_SHARE,
  CLINIC_FIXED_COST_PER_MONTH,
  CLINIC_RENT_SHARE,
  EXECUTIVE_SALARY_MAX,
  EXTERNAL_RELATIONS,
  MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD,
  MEDICAL_ASSOCIATION_OPENING_PENALTY,
  PERSONAL_ASSETS,
  PERSONAL_TAX_RATE,
  PHARMACY_BASE_RENT,
  PHARMACY_INVITE_CAPEX,
  PROPERTY_PRICE,
  REFERRAL_MAX_UPLIFT,
  assertBalanced,
  emrMigrationOutlook,
  monthsToAfford,
  personalRankOf,
  pharmacyRentOf,
  propertyPaybackYears,
  relationSeries,
  runSimulation,
  type MonthDecision,
  type MonthResult,
  type Scenario,
} from '../src/index';

/** 既定シナリオに意思決定を1つ足しただけのシナリオ。差分の出どころを1つに絞る */
function withDecisions(...extra: MonthDecision[]): Scenario {
  const merged = [...BASELINE_SCENARIO.decisions];
  for (const d of extra) {
    const index = merged.findIndex((m) => m.month === d.month);
    if (index >= 0) merged[index] = { ...merged[index]!, ...d };
    else merged.push(d);
  }
  return { ...BASELINE_SCENARIO, decisions: merged.sort((a, b) => a.month - b.month) };
}

const baseline = runSimulation(BASELINE_SCENARIO);
const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;

// ==================================================================
// ★既定は眠っている
// ==================================================================

describe('既定シナリオでは拡張系が一切動かない', () => {
  it('関係値は 120 ヶ月ずっと 0 のまま', () => {
    for (const m of baseline.months) {
      for (const r of m.expansion.relations.relations) {
        expect(r.value).toBe(0);
        expect(r.active).toBe(false);
      }
    }
  });

  it('係数は全ての月で 1。1 でなくなれば検証済みの患者数が動く', () => {
    for (const m of baseline.months) {
      expect(m.expansion.capacityMultiplier).toBe(1);
      expect(m.expansion.newPatientMultiplier).toBe(1);
      expect(m.expansion.selfPayMultiplier).toBe(1);
    }
  });

  it('拡張系の収入も費用も 0', () => {
    for (const m of baseline.months) {
      const is = m.financials.incomeStatement;
      expect(is.contractRevenue).toBe(0);
      expect(is.rentalRevenue).toBe(0);
      expect(is.externalRelationCost).toBe(0);
      expect(is.systemCost).toBe(0);
      expect(is.otherPayroll).toBe(0);
    }
  });

  it('カルテは紙のまま、機器も薬局も物件も無い', () => {
    const last = at(baseline, 120);
    expect(last.expansion.vendor.emrTier).toBeNull();
    expect(last.expansion.vendor.emrTierName).toBe('紙カルテ');
    expect(last.expansion.vendor.equipment.every((e) => !e.owned)).toBe(true);
    expect(last.expansion.pharmacy.pharmacies.every((p) => !p.invited)).toBe(true);
    expect(last.expansion.realEstate.properties.every((p) => !p.owned)).toBe(true);
    expect(last.expansion.personal.netWorth).toBe(0);
  });
});

// ==================================================================
// 外部関係
// ==================================================================

describe('外部関係', () => {
  const spec = (id: string) => EXTERNAL_RELATIONS.find((r) => r.id === id)!;

  it('活動した月だけ関係値が上がる', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { referralHospital: true } }),
    );
    const s = spec('referralHospital');
    expect(at(run, 1).expansion.relations.relations.find((r) => r.id === 'referralHospital')!.value)
      .toBeCloseTo(s.gainPerMonth, 6);
    expect(at(run, 10).expansion.relations.relations.find((r) => r.id === 'referralHospital')!.value)
      .toBeCloseTo(s.gainPerMonth * 10, 6);
  });

  it('活動をやめると錆びる。上げるより落ちる方が遅いが、確実に落ちる', () => {
    const run = runSimulation(
      withDecisions(
        { month: 1, relationActivity: { referralHospital: true } },
        { month: 25, relationActivity: { referralHospital: false } },
      ),
    );
    const s = spec('referralHospital');
    const peak = at(run, 24).expansion.relations.relations.find((r) => r.id === 'referralHospital')!.value;
    const after = at(run, 36).expansion.relations.relations.find((r) => r.id === 'referralHospital')!.value;
    expect(peak).toBeCloseTo(s.gainPerMonth * 24, 6);
    expect(after).toBeCloseTo(peak - s.decayPerMonth * 12, 6);
  });

  it('連携基幹病院の関係が新規患者を増やす。上限は REFERRAL_MAX_UPLIFT', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { referralHospital: true } }),
    );
    // 関係値 100 に到達したあと
    const late = at(run, 100);
    expect(late.expansion.relations.relations.find((r) => r.id === 'referralHospital')!.value).toBe(100);
    expect(late.expansion.newPatientMultiplier).toBeCloseTo(1 + REFERRAL_MAX_UPLIFT, 9);
    expect(late.clinics.find((c) => c.id === 'A')!.newPatients).toBeGreaterThan(
      at(baseline, 100).clinics.find((c) => c.id === 'A')!.newPatients,
    );
  });

  it('医師会は閾値を超えてから受託が入る', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { medicalAssociation: true } }),
    );
    const first = run.months.find((m) => m.financials.incomeStatement.contractRevenue > 0);
    expect(first).toBeDefined();
    const value = (m: MonthResult) =>
      m.expansion.relations.relations.find((r) => r.id === 'medicalAssociation')!.value;
    expect(value(first!)).toBeGreaterThanOrEqual(MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD);
    expect(value(at(run, first!.month - 1))).toBeLessThan(MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD);
    // 分院の開院ペナルティのぶん、素朴な割り算より遅れて届く
    const s = spec('medicalAssociation');
    expect(first!.month).toBeGreaterThan(MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD / s.gainPerMonth);
  });

  it('★分院を開くと医師会の関係が落ちる。拡大そのものが成長ブレーキ', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { medicalAssociation: true } }),
    );
    const value = (m: number) =>
      at(run, m).expansion.relations.relations.find((r) => r.id === 'medicalAssociation')!.value;
    const s = spec('medicalAssociation');
    // 19ヶ月目に B 院が開く
    expect(value(19)).toBeCloseTo(
      value(18) + s.gainPerMonth - MEDICAL_ASSOCIATION_OPENING_PENALTY,
      6,
    );
  });

  it('ケアマネの関係は自費を上げるが診察枠を削る', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { careManager: true } }),
    );
    const late = at(run, 100);
    expect(late.expansion.relations.homeCareShare).toBeCloseTo(CARE_MANAGER_MAX_HOME_SHARE, 9);
    expect(late.expansion.selfPayMultiplier).toBeGreaterThan(1);
    expect(late.expansion.capacityMultiplier).toBeLessThan(1);
    const a = late.clinics.find((c) => c.id === 'A')!;
    const baseA = at(baseline, 100).clinics.find((c) => c.id === 'A')!;
    expect(a.effectiveCapacity).toBeLessThan(baseA.effectiveCapacity);
  });

  it('relationSeries は折れ線に渡せる長さで返る', () => {
    const run = runSimulation(
      withDecisions({ month: 1, relationActivity: { careManager: true } }),
    );
    expect(relationSeries(run.months, 'careManager', 24, 12)).toHaveLength(12);
  });
});

// ==================================================================
// システム・機器商社
// ==================================================================

describe('システム・機器商社', () => {
  it('カルテ移行は診察枠を落とす。自分で起こす医師不足', () => {
    const run = runSimulation(withDecisions({ month: 25, migrateEmr: 'chain' }));
    expect(at(run, 25).expansion.vendor.migrating).toBe(true);
    expect(at(run, 25).expansion.capacityMultiplier).toBeLessThan(1);
    const during = at(run, 27).clinics.find((c) => c.id === 'A')!;
    const before = at(baseline, 27).clinics.find((c) => c.id === 'A')!;
    expect(during.effectiveCapacity).toBeLessThan(before.effectiveCapacity);
    expect(during.waitMinutes).toBeGreaterThan(before.waitMinutes);
    // 6ヶ月で終わる
    expect(at(run, 31).expansion.vendor.migrating).toBe(false);
    expect(at(run, 31).expansion.capacityMultiplier).toBe(1);
  });

  it('★待つほど高くつく。これがロックイン', () => {
    const outlook = emrMigrationOutlook(baseline.months, 30);
    const chain = outlook.find((o) => o.tier === 'chain')!;
    expect(chain.costIn12Months).toBeGreaterThan(chain.costNow);
    expect(chain.costOfWaiting).toBeCloseTo(chain.costIn12Months - chain.costNow, 9);
  });

  it('AI は枠を増やすが、施設基準の医師数には数えない', () => {
    const run = runSimulation(withDecisions({ month: 25, adoptAiTools: ['triage', 'imaging'] }));
    const withAi = at(run, 30);
    const without = at(baseline, 30);
    expect(withAi.expansion.vendor.extraVisitsPerDoctorPerDay).toBe(7);
    expect(withAi.clinics.find((c) => c.id === 'A')!.capacity).toBeGreaterThan(
      without.clinics.find((c) => c.id === 'A')!.capacity,
    );
    // ここが設計の要。枠は増えたのに医師数は1人も増えていない
    expect(withAi.staff.doctorsTotal).toBe(without.staff.doctorsTotal);
    expect(withAi.fee.addonTotal).toBe(without.fee.addonTotal);
  });

  it('リースは B/S に載らない。購入は載る', () => {
    const leased = runSimulation(withDecisions({ month: 25, buyEquipment: [{ id: 'ct', lease: true }] }));
    const bought = runSimulation(withDecisions({ month: 25, buyEquipment: [{ id: 'ct' }] }));
    const l = at(leased, 26).financials;
    const b = at(bought, 26).financials;
    expect(l.balanceSheet.fixedAssetsByClass.medicalEquipment).toBeCloseTo(
      at(baseline, 26).financials.balanceSheet.fixedAssetsByClass.medicalEquipment, 6);
    expect(b.balanceSheet.fixedAssetsByClass.medicalEquipment).toBeGreaterThan(
      at(baseline, 26).financials.balanceSheet.fixedAssetsByClass.medicalEquipment);
    // リースは毎月の費用として出る
    expect(l.incomeStatement.systemCost).toBeGreaterThan(0);
  });

  it('機器は自費収入を増やす', () => {
    const run = runSimulation(withDecisions({ month: 25, buyEquipment: [{ id: 'ct', lease: true }] }));
    expect(at(run, 30).expansion.vendor.equipmentSelfPayUplift).toBeCloseTo(0.25, 9);
    expect(at(run, 30).financials.incomeStatement.selfPayRevenue).toBeGreaterThan(
      at(baseline, 30).financials.incomeStatement.selfPayRevenue,
    );
  });

  it('保守に入っていれば故障しない。同じ種でも結果が動かない', () => {
    const run = runSimulation(
      withDecisions({ month: 25, buyEquipment: [{ id: 'ct' }], maintenanceContract: true }),
    );
    for (const m of run.months.slice(24)) {
      expect(m.expansion.vendor.equipment.some((e) => e.broken)).toBe(false);
    }
  });

  it('保守を切ると壊れる月が出る。同じ種なら毎回同じ月に壊れる', () => {
    const decisions: MonthDecision[] = [{ month: 25, buyEquipment: [{ id: 'ct' }], maintenanceContract: false }];
    const a = runSimulation(withDecisions(...decisions));
    const b = runSimulation(withDecisions(...decisions));
    const brokenMonths = (run: typeof a) =>
      run.months.filter((m) => m.expansion.vendor.equipment.some((e) => e.broken)).map((m) => m.month);
    expect(brokenMonths(a).length).toBeGreaterThan(0);
    expect(brokenMonths(a)).toEqual(brokenMonths(b));
  });
});

// ==================================================================
// 門前薬局
// ==================================================================

describe('門前薬局', () => {
  const run = runSimulation(withDecisions({ month: 25, invitePharmacy: ['A'] }));

  it('賃料は定額＋患者数の歩合', () => {
    const stock = at(run, 30).clinics.find((c) => c.id === 'A')!.patientStock;
    const rent = at(run, 30).expansion.pharmacy.pharmacies.find((p) => p.clinicId === 'A')!.rent;
    expect(rent).toBeCloseTo(pharmacyRentOf(stock), 9);
    expect(rent).toBeGreaterThan(PHARMACY_BASE_RENT);
  });

  it('誘致した月に一時金が出て、B/S に載る', () => {
    const cf = at(run, 25).financials.cashFlow;
    const baseCf = at(baseline, 25).financials.cashFlow;
    expect(-cf.capitalExpenditure - -baseCf.capitalExpenditure).toBeCloseTo(PHARMACY_INVITE_CAPEX, 6);
  });

  it('賃料収入は P/L の賃料行に出る', () => {
    expect(at(run, 30).financials.incomeStatement.rentalRevenue).toBeCloseTo(
      at(run, 30).expansion.pharmacy.rentalRevenue, 9);
    expect(at(run, 24).financials.incomeStatement.rentalRevenue).toBe(0);
  });
});

// ==================================================================
// 不動産
// ==================================================================

describe('不動産', () => {
  const run = runSimulation(withDecisions({ month: 25, buyProperty: ['A'] }));

  it('保有に切り替えると家賃が消える', () => {
    const saved = at(run, 30).expansion.realEstate.rentSaved;
    expect(saved).toBeCloseTo(CLINIC_FIXED_COST_PER_MONTH * CLINIC_RENT_SHARE, 9);
    expect(at(run, 30).financials.incomeStatement.rent).toBeCloseTo(
      at(baseline, 30).financials.incomeStatement.rent - saved, 6);
  });

  it('代わりに建物の償却が乗る', () => {
    expect(at(run, 30).financials.incomeStatement.depreciation).toBeGreaterThan(
      at(baseline, 30).financials.incomeStatement.depreciation);
  });

  it('回収年数は家賃 ÷ 物件価格の単純な割り算', () => {
    const years = propertyPaybackYears(CLINIC_FIXED_COST_PER_MONTH * CLINIC_RENT_SHARE);
    expect(years).toBeCloseTo(PROPERTY_PRICE / (CLINIC_FIXED_COST_PER_MONTH * CLINIC_RENT_SHARE * 12), 6);
    expect(propertyPaybackYears(0)).toBeNull();
  });
});

// ==================================================================
// 個人資産
// ==================================================================

describe('個人資産', () => {
  const run = runSimulation(withDecisions({ month: 13, executiveSalary: 200 }));

  it('役員報酬は法人の費用で、手取りが個人へ積み上がる', () => {
    expect(at(run, 13).financials.incomeStatement.otherPayroll).toBe(200);
    expect(at(run, 13).expansion.personal.netSalary).toBeCloseTo(200 * (1 - PERSONAL_TAX_RATE), 9);
    expect(at(run, 24).expansion.personal.cash).toBeCloseTo(
      200 * (1 - PERSONAL_TAX_RATE) * 12, 6);
  });

  it('上限で頭打ちになる。法人を空にはできない', () => {
    const greedy = runSimulation(withDecisions({ month: 13, executiveSalary: 99999 }));
    expect(at(greedy, 13).expansion.personal.salary).toBe(EXECUTIVE_SALARY_MAX);
  });

  it('★見栄資産は法人の数字に一切効かない', () => {
    const rich = runSimulation(
      withDecisions(
        { month: 13, executiveSalary: 300 },
        { month: 60, buyPersonalAssets: ['watch', 'car'] },
      ),
    );
    const plain = runSimulation(withDecisions({ month: 13, executiveSalary: 300 }));
    expect(at(rich, 80).clinics.find((c) => c.id === 'A')!.patientStock).toBe(
      at(plain, 80).clinics.find((c) => c.id === 'A')!.patientStock);
    expect(at(rich, 80).financials.balanceSheet.cash).toBeCloseTo(
      at(plain, 80).financials.balanceSheet.cash, 6);
    // 個人の側だけが動く
    expect(at(rich, 80).expansion.personal.prestige).toBeGreaterThan(0);
    expect(at(plain, 80).expansion.personal.prestige).toBe(0);
  });

  it('現金が足りなければ買えない', () => {
    const broke = runSimulation(withDecisions({ month: 13, buyPersonalAssets: ['cruiser'] }));
    expect(at(broke, 13).expansion.personal.assets.find((a) => a.id === 'cruiser')!.owned).toBe(false);
  });

  it('称号は見栄の点数から引く', () => {
    expect(personalRankOf(0)).toBe('働きづめの勤務医');
    const all = PERSONAL_ASSETS.reduce((sum, a) => sum + a.prestige, 0);
    expect(personalRankOf(all)).toBe('医療法人グループ総帥');
  });

  it('あと何ヶ月で買えるかを出す', () => {
    expect(monthsToAfford(1000, 1000, 100)).toBe(0);
    expect(monthsToAfford(1000, 500, 100)).toBe(5);
    expect(monthsToAfford(1000, 0, 0)).toBeNull();
  });
});

// ==================================================================
// 会計の不変条件は拡張系を入れても崩れない
// ==================================================================

describe('拡張系を全部入れても貸借は一致する', () => {
  it('120ヶ月ぶん', () => {
    const run = runSimulation(
      withDecisions(
        {
          month: 13,
          relationActivity: { medicalAssociation: true, referralHospital: true, careManager: true },
          executiveSalary: 150,
        },
        { month: 25, migrateEmr: 'chain', buyEquipment: [{ id: 'xray' }, { id: 'ct', lease: true }], maintenanceContract: true },
        { month: 31, invitePharmacy: ['A', 'B'], buyProperty: ['A'] },
        { month: 49, adoptAiTools: ['triage', 'imaging'] },
        { month: 61, buyPersonalAssets: ['watch', 'car'] },
      ),
    );
    for (const m of run.months) assertBalanced(m.financials.balanceSheet);
    expect(run.months).toHaveLength(120);
  });
});
