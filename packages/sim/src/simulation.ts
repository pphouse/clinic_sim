/**
 * 40 四半期を回す本体。
 *
 * 1 四半期の順番は固定。入れ替えると検証済みの結果が変わる：
 *
 *   1. 意思決定を適用する（医師配置・開院・開校・加算取得・紹介会社・医局）
 *   2. 人材を確定する（看護師の増減 → 充足率）
 *   3. 診療報酬を確定する（改定の累積 × 有効な加算）… 充足率に依存するのでこの順
 *   4. 各院を tick する（枠 → 待ち時間 → 評判・離脱 → 患者ストック → 収益）
 *   5. 三表を組む（資産計上・減価償却・未収金・借入）
 *
 * 3 が 2 の後にあるのは、加算の施設基準が「その四半期の」充足率で判定されるため。
 * 既定シナリオでは Q9・Q15 がこれで落ちる。
 */
import {
  AGENCY_FEE_PER_DOCTOR,
  CLINICS,
  CLINIC_CAPEX,
  CLINIC_CAPEX_EQUIPMENT_SHARE,
  CLINIC_FIXED_COST_PER_QUARTER,
  CLINIC_LOAN,
  DOCTOR_COST_PER_QUARTER,
  HQ_COST_PER_QUARTER,
  IGYOKU_RELATION_COST_PER_QUARTER,
  INITIAL_CASH,
  INITIAL_REPUTATION,
  LOAN_QUARTERLY_RATE,
  LOAN_REPAYMENT_RATE,
  NURSE_COST_PER_QUARTER,
  RELATION_DECAY_PER_QUARTER,
  SCHOOL_CAPEX,
  SCHOOL_LOAN,
  SCHOOL_OPERATING_PER_QUARTER,
  SUPPLIES_RATE,
  USEFUL_LIFE_BUILDING,
  USEFUL_LIFE_EQUIPMENT,
  USEFUL_LIFE_INTERIOR,
  ADDONS,
} from './constants';
import { buildStatements, depreciateAll, serviceLoans } from './accounting';
import { collectEvents } from './events';
import { initialAddonStatuses, tickFee } from './fee';
import { quarterLabel, tickClinic } from './engine';
import { BASELINE_SCENARIO, decisionAt, type Scenario } from './scenario';
import {
  SCHOOL_GRADUATES_PER_CLASS,
  allocateNurses,
  enrolledClasses,
  igyokuSlotsOf,
  isGraduationQuarter,
  nurseSufficiencyOf,
  nursesRequiredFor,
  tickNurses,
  tuitionRevenueFor,
} from './staff';
import type {
  ClinicId,
  ClinicState,
  ClinicTick,
  FixedAsset,
  GameState,
  IncomeStatement,
  Loan,
  Man,
  QuarterResult,
  StaffTick,
} from './types';

/** 医局関係値の上限。types.ts のコメントどおり 0〜120 */
export const IGYOKU_RELATION_MAX = 120;

export interface SimulationRun {
  scenarioId: string;
  quarters: QuarterResult[];
  finalState: GameState;
}

type MutableState = GameState & {
  doctorPlan: Record<ClinicId, number>;
  maintainIgyoku: boolean;
};

function initialState(scenario: Scenario): MutableState {
  return {
    quarter: 0,
    rngSeed: scenario.seed,
    clinics: CLINICS.map<ClinicState>((c) => ({
      id: c.id,
      patientStock: 0,
      reputation: INITIAL_REPUTATION,
      doctors: 0,
    })),
    igyokuRelation: scenario.initialIgyokuRelation,
    agencyHiresCumulative: 0,
    nurses: scenario.initialNurses,
    schoolOpenedAtQuarter: null,
    addons: initialAddonStatuses(),
    assets: [],
    loans: [],
    cash: INITIAL_CASH,
    accountsReceivable: 0,
    paidInCapital: INITIAL_CASH,
    retainedEarnings: 0,
    doctorPlan: Object.fromEntries(CLINICS.map((c) => [c.id, 0])),
    maintainIgyoku: true,
  };
}

function clinicAssets(clinicId: ClinicId, quarter: number): FixedAsset[] {
  const equipment = CLINIC_CAPEX * CLINIC_CAPEX_EQUIPMENT_SHARE;
  return [
    {
      id: `clinic-${clinicId}-equipment`,
      name: `${clinicId}院 医療機器`,
      assetClass: 'medicalEquipment',
      acquiredAtQuarter: quarter,
      acquisitionCost: equipment,
      usefulLifeQuarters: USEFUL_LIFE_EQUIPMENT,
      bookValue: equipment,
    },
    {
      id: `clinic-${clinicId}-interior`,
      name: `${clinicId}院 内装`,
      assetClass: 'interior',
      acquiredAtQuarter: quarter,
      acquisitionCost: CLINIC_CAPEX - equipment,
      usefulLifeQuarters: USEFUL_LIFE_INTERIOR,
      bookValue: CLINIC_CAPEX - equipment,
    },
  ];
}

export function runSimulation(scenario: Scenario = BASELINE_SCENARIO): SimulationRun {
  const state = initialState(scenario);
  const clinicNames = Object.fromEntries(CLINICS.map((c) => [c.id, c.name]));
  const quarters: QuarterResult[] = [];

  for (let quarter = 1; quarter <= scenario.totalQuarters; quarter++) {
    const decision = decisionAt(scenario, quarter);

    // ---------------------------------------------------------- 1. 意思決定
    let capitalExpenditure: Man = 0;
    let newBorrowing: Man = 0;
    let agencyFees: Man = 0;

    if (decision?.doctorsByClinic) {
      for (const [id, count] of Object.entries(decision.doctorsByClinic)) {
        if (count !== undefined) state.doctorPlan[id] = count;
      }
    }
    if (decision?.maintainIgyoku !== undefined) state.maintainIgyoku = decision.maintainIgyoku;

    for (const config of CLINICS) {
      if (config.openQuarter !== quarter) continue;
      capitalExpenditure += CLINIC_CAPEX;
      state.assets.push(...clinicAssets(config.id, quarter));
      newBorrowing += CLINIC_LOAN;
      state.loans.push({
        id: `loan-clinic-${config.id}`,
        name: `${config.name} 開業資金`,
        principal: CLINIC_LOAN,
        outstanding: CLINIC_LOAN,
        quarterlyRate: LOAN_QUARTERLY_RATE,
        quarterlyRepaymentRate: LOAN_REPAYMENT_RATE,
      });
    }

    if (decision?.openSchool && state.schoolOpenedAtQuarter === null) {
      state.schoolOpenedAtQuarter = quarter;
      capitalExpenditure += SCHOOL_CAPEX;
      state.assets.push({
        id: 'school-building',
        name: '看護学校 校舎',
        assetClass: 'building',
        acquiredAtQuarter: quarter,
        acquisitionCost: SCHOOL_CAPEX,
        usefulLifeQuarters: USEFUL_LIFE_BUILDING,
        bookValue: SCHOOL_CAPEX,
      });
      newBorrowing += SCHOOL_LOAN;
      state.loans.push({
        id: 'loan-school',
        name: '看護学校 設備資金',
        principal: SCHOOL_LOAN,
        outstanding: SCHOOL_LOAN,
        quarterlyRate: LOAN_QUARTERLY_RATE,
        quarterlyRepaymentRate: LOAN_REPAYMENT_RATE,
      });
    }

    // 加算の取得費は資産計上する。即時費用にすると取得の判断が歪む（docs/spec/02-accounting.md）
    const acquire = decision?.acquireAddons ?? [];
    for (const addonId of acquire) {
      const addon = ADDONS.find((a) => a.id === addonId);
      if (!addon) continue;
      capitalExpenditure += addon.acquisitionCost;
      state.assets.push({
        id: `addon-${addon.id}`,
        name: `${addon.name} 取得投資`,
        assetClass: 'medicalEquipment',
        acquiredAtQuarter: quarter,
        acquisitionCost: addon.acquisitionCost,
        usefulLifeQuarters: USEFUL_LIFE_EQUIPMENT,
        bookValue: addon.acquisitionCost,
      });
    }

    if (decision?.agencyHires) {
      state.agencyHiresCumulative += decision.agencyHires;
      agencyFees += decision.agencyHires * AGENCY_FEE_PER_DOCTOR;
    }

    // 関係値は維持費を払っていれば据え置き、払わなければ減衰する。上げるのは金ではない
    const relationDelta = decision?.igyokuRelationDelta ?? 0;
    state.igyokuRelation = Math.max(
      0,
      Math.min(
        IGYOKU_RELATION_MAX,
        state.igyokuRelation + relationDelta - (state.maintainIgyoku ? 0 : RELATION_DECAY_PER_QUARTER),
      ),
    );

    // ---------------------------------------------------------- 2. 人材
    const doctorsByClinic: Record<ClinicId, number> = {};
    for (const config of CLINICS) {
      doctorsByClinic[config.id] = quarter >= config.openQuarter ? (state.doctorPlan[config.id] ?? 0) : 0;
    }
    const doctorsTotal = Object.values(doctorsByClinic).reduce((a, b) => a + b, 0);

    const nursesRequired = nursesRequiredFor(doctorsTotal);
    const graduates = isGraduationQuarter(quarter, state.schoolOpenedAtQuarter)
      ? SCHOOL_GRADUATES_PER_CLASS
      : 0;
    const nurseTick = tickNurses({
      previousNurses: state.nurses,
      required: nursesRequired,
      graduates,
    });
    state.nurses = nurseTick.nurses;
    const nurseSufficiency = nurseSufficiencyOf(state.nurses, nursesRequired);
    const allocated = allocateNurses(state.nurses, doctorsByClinic);

    const igyokuSlots = igyokuSlotsOf(state.igyokuRelation);
    const doctorsProcurable = igyokuSlots + state.agencyHiresCumulative;
    const staff: StaffTick = {
      doctorsByClinic,
      doctorsTotal,
      igyokuRelation: state.igyokuRelation,
      igyokuSlots,
      agencyHiresCumulative: state.agencyHiresCumulative,
      doctorsProcurable,
      doctorShortfall: doctorsTotal > doctorsProcurable,
      nurses: state.nurses,
      nursesRequired,
      nurseSufficiency,
      nursesFromSchool: nurseTick.fromSchool,
      nursesFromMarket: nurseTick.fromMarket,
    };

    // ---------------------------------------------------------- 3. 診療報酬
    const previousAddons = state.addons;
    const fee = tickFee({
      quarter,
      previous: previousAddons,
      acquire,
      doctorsTotal,
      nurseSufficiency,
    });
    state.addons = fee.addons;

    // ---------------------------------------------------------- 4. 診療所
    const clinicTicks: ClinicTick[] = [];
    let insuranceRevenue: Man = 0;
    let selfPayRevenue: Man = 0;
    let medicalSupplies: Man = 0;
    let doctorPayroll: Man = 0;
    let nursePayroll: Man = 0;
    let rent: Man = 0;

    for (const config of CLINICS) {
      const previous = state.clinics.find((c) => c.id === config.id);
      if (!previous) continue;
      const doctors = doctorsByClinic[config.id] ?? 0;
      const tick = tickClinic({
        config,
        quarter,
        previousStock: previous.patientStock,
        previousReputation: previous.reputation,
        doctors,
        nurseSufficiency,
        allocatedNurses: allocated[config.id] ?? 0,
        effectiveFeeIndex: fee.effectiveFeeIndex,
      });
      clinicTicks.push(tick);

      previous.patientStock = tick.patientStock;
      previous.reputation = tick.reputation;
      previous.doctors = doctors;

      insuranceRevenue += tick.insuranceRevenue;
      selfPayRevenue += tick.selfPayRevenue;

      // 費用の内訳は tickClinic の operatingCost と同じ条件で積む。
      // ここがズレると P/L と診療所タブの数字が食い違う
      const active = quarter >= config.openQuarter && doctors > 0;
      if (active) {
        medicalSupplies += (tick.insuranceRevenue + tick.selfPayRevenue) * SUPPLIES_RATE;
        doctorPayroll += doctors * DOCTOR_COST_PER_QUARTER;
        nursePayroll += (allocated[config.id] ?? 0) * NURSE_COST_PER_QUARTER;
        rent += CLINIC_FIXED_COST_PER_QUARTER;
      }
    }

    // ---------------------------------------------------------- 5. 会計
    const schoolOpen = state.schoolOpenedAtQuarter !== null;
    const tuitionRevenue = tuitionRevenueFor(
      enrolledClasses(quarter, state.schoolOpenedAtQuarter),
    );
    const schoolOperating = schoolOpen ? SCHOOL_OPERATING_PER_QUARTER : 0;

    const serviced = serviceLoans(state.loans);
    state.loans = serviced.loans;

    const depreciated = depreciateAll(state.assets, quarter);
    state.assets = depreciated.assets;

    const incomeLines: BuildLines = {
      insuranceRevenue,
      selfPayRevenue,
      tuitionRevenue,
      rentalRevenue: 0,
      medicalSupplies,
      doctorPayroll,
      nursePayroll,
      otherPayroll: 0,
      rent,
      depreciation: depreciated.depreciation,
      schoolOperating,
      agencyFees,
      igyokuRelationCost: state.maintainIgyoku ? IGYOKU_RELATION_COST_PER_QUARTER : 0,
      headquarters: HQ_COST_PER_QUARTER,
      interestExpense: serviced.interest,
      extraordinaryLoss: 0,
    };

    const financials = buildStatements({
      quarter,
      incomeStatement: incomeLines,
      openingCash: state.cash,
      openingReceivables: state.accountsReceivable,
      // 仕入債務と棚卸資産は未モデル化（docs/spec/02-accounting.md）。0 で通す
      openingPayables: 0,
      closingPayables: 0,
      inventory: 0,
      assets: state.assets,
      loans: state.loans,
      capitalExpenditure,
      newBorrowing,
      principalRepayment: serviced.principalRepaid,
      paidInCapital: state.paidInCapital,
      openingRetainedEarnings: state.retainedEarnings,
    });

    state.cash = financials.balanceSheet.cash;
    state.accountsReceivable = financials.balanceSheet.accountsReceivable;
    state.retainedEarnings = financials.balanceSheet.retainedEarnings;
    state.quarter = quarter;

    const events = collectEvents({
      quarter,
      clinics: clinicTicks,
      clinicNames,
      staff,
      addons: fee.addons,
      previousAddons,
      cash: financials.balanceSheet.cash,
      equity: financials.balanceSheet.totalEquity,
      graduatedNurses: graduates,
    });

    quarters.push({
      quarter,
      label: quarterLabel(quarter),
      clinics: clinicTicks,
      staff,
      fee,
      financials,
      events,
    });
  }

  const { doctorPlan: _doctorPlan, maintainIgyoku: _maintainIgyoku, ...finalState } = state;
  return { scenarioId: scenario.id, quarters, finalState };
}

type BuildLines = Omit<
  IncomeStatement,
  'totalRevenue' | 'totalExpenses' | 'operatingIncome' | 'ordinaryIncome' | 'pretaxIncome' | 'tax' | 'netIncome'
>;

/** 借入の残高合計。B/S を組む前の期首残高を見たいとき用 */
export function totalOutstanding(loans: Loan[]): Man {
  return loans.reduce((sum, l) => sum + l.outstanding, 0);
}
