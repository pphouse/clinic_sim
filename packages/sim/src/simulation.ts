/**
 * 120 ヶ月を回す本体。
 *
 * 1 ヶ月の順番は固定。入れ替えると検証済みの結果が変わる：
 *
 *   1. 意思決定を適用する（医師配置・開院・開校・加算取得・紹介会社・医局）
 *   2. 人材を確定する（看護師の増減 → 充足率）
 *   3. 診療報酬を確定する（改定の累積 × 有効な加算）… 充足率に依存するのでこの順
 *   4. 各院を tick する（枠 → 待ち時間 → 評判・離脱 → 患者ストック → 収益）
 *   5. 三表を組む（資産計上・減価償却・未収金・借入）
 *
 * 3 が 2 の後にあるのは、加算の施設基準が「その月の」充足率で判定されるため。
 * 既定シナリオでは Q9・Q15 がこれで落ちる。
 */
import {
  AGENCY_FEE_PER_DOCTOR,
  CLINICS,
  CLINIC_CAPEX,
  CLINIC_CAPEX_EQUIPMENT_SHARE,
  CLINIC_FIXED_COST_PER_MONTH,
  CLINIC_LOAN,
  DOCTOR_COST_PER_MONTH,
  HQ_COST_PER_MONTH,
  IGYOKU_RELATION_COST_PER_MONTH,
  INITIAL_CASH,
  INITIAL_REPUTATION,
  NEW_PATIENT_REPUTATION_LAG_MONTHS,
  LOAN_MONTHLY_RATE,
  LOAN_REPAYMENT_RATE,
  NURSE_COST_PER_MONTH,
  RELATION_DECAY_PER_MONTH,
  SCHOOL_CAPEX,
  SCHOOL_LOAN,
  SCHOOL_OPERATING_PER_MONTH,
  SUPPLIES_RATE,
  USEFUL_LIFE_BUILDING,
  USEFUL_LIFE_EQUIPMENT,
  USEFUL_LIFE_INTERIOR,
  ADDONS,
} from './constants';
import { buildStatements, depreciateAll, serviceLoans } from './accounting';
import { collectEvents } from './events';
import { initialAddonStatuses, tickFee } from './fee';
import { monthLabel, tickClinic } from './engine';
import { BASELINE_SCENARIO, decisionAt, type Scenario } from './scenario';
import {
  SCHOOL_GRADUATES_PER_CLASS,
  allocateNurses,
  enrolledClasses,
  igyokuSlotsOf,
  isGraduationMonth,
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
  MonthResult,
  StaffTick,
} from './types';

/** 医局関係値の上限。types.ts のコメントどおり 0〜120 */
export const IGYOKU_RELATION_MAX = 120;

export interface SimulationRun {
  scenarioId: string;
  months: MonthResult[];
  finalState: GameState;
}

type MutableState = GameState & {
  doctorPlan: Record<ClinicId, number>;
  maintainIgyoku: boolean;
};

function initialState(scenario: Scenario): MutableState {
  return {
    month: 0,
    rngSeed: scenario.seed,
    clinics: CLINICS.map<ClinicState>((c) => ({
      id: c.id,
      patientStock: 0,
      reputation: INITIAL_REPUTATION,
      reputationHistory: Array.from(
        { length: NEW_PATIENT_REPUTATION_LAG_MONTHS },
        () => INITIAL_REPUTATION,
      ),
      doctors: 0,
    })),
    igyokuRelation: scenario.initialIgyokuRelation,
    agencyHiresCumulative: 0,
    nurses: scenario.initialNurses,
    schoolOpenedAtMonth: null,
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

function clinicAssets(clinicId: ClinicId, month: number): FixedAsset[] {
  const equipment = CLINIC_CAPEX * CLINIC_CAPEX_EQUIPMENT_SHARE;
  return [
    {
      id: `clinic-${clinicId}-equipment`,
      name: `${clinicId}院 医療機器`,
      assetClass: 'medicalEquipment',
      acquiredAtMonth: month,
      acquisitionCost: equipment,
      usefulLifeMonths: USEFUL_LIFE_EQUIPMENT,
      bookValue: equipment,
    },
    {
      id: `clinic-${clinicId}-interior`,
      name: `${clinicId}院 内装`,
      assetClass: 'interior',
      acquiredAtMonth: month,
      acquisitionCost: CLINIC_CAPEX - equipment,
      usefulLifeMonths: USEFUL_LIFE_INTERIOR,
      bookValue: CLINIC_CAPEX - equipment,
    },
  ];
}

export function runSimulation(scenario: Scenario = BASELINE_SCENARIO): SimulationRun {
  const state = initialState(scenario);
  const clinicNames = Object.fromEntries(CLINICS.map((c) => [c.id, c.name]));
  const months: MonthResult[] = [];

  for (let month = 1; month <= scenario.totalMonths; month++) {
    const decision = decisionAt(scenario, month);

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
      if (config.openMonth !== month) continue;
      capitalExpenditure += CLINIC_CAPEX;
      state.assets.push(...clinicAssets(config.id, month));
      newBorrowing += CLINIC_LOAN;
      state.loans.push({
        id: `loan-clinic-${config.id}`,
        name: `${config.name} 開業資金`,
        principal: CLINIC_LOAN,
        outstanding: CLINIC_LOAN,
        monthlyRate: LOAN_MONTHLY_RATE,
        monthlyRepaymentRate: LOAN_REPAYMENT_RATE,
      });
    }

    if (decision?.openSchool && state.schoolOpenedAtMonth === null) {
      state.schoolOpenedAtMonth = month;
      capitalExpenditure += SCHOOL_CAPEX;
      state.assets.push({
        id: 'school-building',
        name: '看護学校 校舎',
        assetClass: 'building',
        acquiredAtMonth: month,
        acquisitionCost: SCHOOL_CAPEX,
        usefulLifeMonths: USEFUL_LIFE_BUILDING,
        bookValue: SCHOOL_CAPEX,
      });
      newBorrowing += SCHOOL_LOAN;
      state.loans.push({
        id: 'loan-school',
        name: '看護学校 設備資金',
        principal: SCHOOL_LOAN,
        outstanding: SCHOOL_LOAN,
        monthlyRate: LOAN_MONTHLY_RATE,
        monthlyRepaymentRate: LOAN_REPAYMENT_RATE,
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
        acquiredAtMonth: month,
        acquisitionCost: addon.acquisitionCost,
        usefulLifeMonths: USEFUL_LIFE_EQUIPMENT,
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
        state.igyokuRelation + relationDelta - (state.maintainIgyoku ? 0 : RELATION_DECAY_PER_MONTH),
      ),
    );

    // ---------------------------------------------------------- 2. 人材
    const doctorsByClinic: Record<ClinicId, number> = {};
    for (const config of CLINICS) {
      doctorsByClinic[config.id] = month >= config.openMonth ? (state.doctorPlan[config.id] ?? 0) : 0;
    }
    const doctorsTotal = Object.values(doctorsByClinic).reduce((a, b) => a + b, 0);

    const nursesRequired = nursesRequiredFor(doctorsTotal);
    const graduates = isGraduationMonth(month, state.schoolOpenedAtMonth)
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
      month,
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
        month,
        previousStock: previous.patientStock,
        previousReputation: previous.reputation,
        // 3ヶ月前の評判。履歴が足りない開始直後は初期評判で埋まっている
        laggedReputation:
          previous.reputationHistory[NEW_PATIENT_REPUTATION_LAG_MONTHS - 1] ?? INITIAL_REPUTATION,
        doctors,
        nurseSufficiency,
        allocatedNurses: allocated[config.id] ?? 0,
        effectiveFeeIndex: fee.effectiveFeeIndex,
      });
      clinicTicks.push(tick);

      previous.patientStock = tick.patientStock;
      previous.reputation = tick.reputation;
      previous.reputationHistory = [tick.reputation, ...previous.reputationHistory].slice(
        0,
        NEW_PATIENT_REPUTATION_LAG_MONTHS,
      );
      previous.doctors = doctors;

      insuranceRevenue += tick.insuranceRevenue;
      selfPayRevenue += tick.selfPayRevenue;

      // 費用の内訳は tickClinic の operatingCost と同じ条件で積む。
      // ここがズレると P/L と診療所タブの数字が食い違う
      const active = month >= config.openMonth && doctors > 0;
      if (active) {
        medicalSupplies += (tick.insuranceRevenue + tick.selfPayRevenue) * SUPPLIES_RATE;
        doctorPayroll += doctors * DOCTOR_COST_PER_MONTH;
        nursePayroll += (allocated[config.id] ?? 0) * NURSE_COST_PER_MONTH;
        rent += CLINIC_FIXED_COST_PER_MONTH;
      }
    }

    // ---------------------------------------------------------- 5. 会計
    const schoolOpen = state.schoolOpenedAtMonth !== null;
    const tuitionRevenue = tuitionRevenueFor(
      enrolledClasses(month, state.schoolOpenedAtMonth),
    );
    const schoolOperating = schoolOpen ? SCHOOL_OPERATING_PER_MONTH : 0;

    const serviced = serviceLoans(state.loans);
    state.loans = serviced.loans;

    const depreciated = depreciateAll(state.assets, month);
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
      igyokuRelationCost: state.maintainIgyoku ? IGYOKU_RELATION_COST_PER_MONTH : 0,
      headquarters: HQ_COST_PER_MONTH,
      interestExpense: serviced.interest,
      extraordinaryLoss: 0,
    };

    const financials = buildStatements({
      month,
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
    state.month = month;

    const events = collectEvents({
      month,
      clinics: clinicTicks,
      clinicNames,
      staff,
      addons: fee.addons,
      previousAddons,
      cash: financials.balanceSheet.cash,
      equity: financials.balanceSheet.totalEquity,
      graduatedNurses: graduates,
    });

    months.push({
      month,
      label: monthLabel(month),
      clinics: clinicTicks,
      staff,
      fee,
      financials,
      events,
    });
  }

  const { doctorPlan: _doctorPlan, maintainIgyoku: _maintainIgyoku, ...finalState } = state;
  return { scenarioId: scenario.id, months, finalState };
}

type BuildLines = Omit<
  IncomeStatement,
  'totalRevenue' | 'totalExpenses' | 'operatingIncome' | 'ordinaryIncome' | 'pretaxIncome' | 'tax' | 'netIncome'
>;

/** 借入の残高合計。B/S を組む前の期首残高を見たいとき用 */
export function totalOutstanding(loans: Loan[]): Man {
  return loans.reduce((sum, l) => sum + l.outstanding, 0);
}
