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
  AI_TOOLS,
  EQUIPMENT_CATALOG,
  EXECUTIVE_SALARY_MAX,
  MEDICAL_ASSOCIATION_OPENING_PENALTY,
  PERSONAL_ASSETS,
  PHARMACY_INVITE_CAPEX,
  PERSONAL_TAX_RATE,
  PROPERTY_PRICE,
  BANK_LEVERAGE_LIMIT,
  IGYOKU_DUTY_CAPACITY_DRAG,
  IGYOKU_DUTY_GAIN_PER_MONTH,
  CLINIC_SITES,
  EPIDEMIC_DEMAND_UPLIFT,
  districtDemand,
  fitoutOf,
  specialtyOf,
  OPENING_RAMP_STRENGTH,
  OPENING_INSOLVENCY_GRACE_MONTHS,
} from './constants';
import { evaluateGoals } from './goals';
import { tickMarket } from './market';
import { openingPlan } from './opening';
import { rollRandomEvents } from './randomEvents';
import {
  advanceRelations,
  initialRelationActivity,
  initialRelations,
  migrationCostFor,
  personalTickOf,
  pharmacyTickOf,
  realEstateTickOf,
  relationCapacityMultiplier,
  relationSelfPayMultiplier,
  relationsTickOf,
  rentMultiplierFor,
  rollBreakdowns,
  vendorTickOf,
  emrTierSpecOf,
} from './expansion';
import { createRng } from './rng';
import { buildStatements, depreciateAll, serviceLoans } from './accounting';
import { collectEvents } from './events';
import { initialAddonStatuses, tickFee } from './fee';
import { monthLabel, tickClinic } from './engine';
import { BASELINE_SCENARIO, clinicsOf, decisionAt, type Scenario } from './scenario';
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
  ClinicConfig,
  ClinicId,
  ClinicState,
  ExternalRelationId,
  ClinicTick,
  GoalId,
  GoalTick,
  Month,
  RandomEventOccurrence,
  ExpansionTick,
  FixedAsset,
  GameState,
  IncomeStatement,
  Loan,
  Man,
  MonthResult,
  ScreenId,
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
  igyokuDuty: boolean;
  /**
   * 存在する院の設定。**プレイ中に増える。**
   * 競合の開業で newPatientPotential が恒久的に落ちるので、定数ではなく状態。
   */
  configs: ClinicConfig[];
  goalAchievedAt: Partial<Record<GoalId, Month>>;
  insolventMonths: number;
  epidemicUntilMonth: Month | null;
};

/**
 * 院の初期状態。
 * ★評判の出発点は**その院の落ち着き先**。内装を持たない院は INITIAL_REPUTATION（恒等式）。
 * こだわり内装なのに 75 から始まって上がっていくのは、内装を買った実感と合わない。
 */
function newClinicState(config: ClinicConfig): ClinicState {
  const reputation = config.baselineReputation ?? INITIAL_REPUTATION;
  return {
    id: config.id,
    waitMinutes: 0,
    patientStock: 0,
    reputation,
    reputationHistory: Array.from(
      { length: NEW_PATIENT_REPUTATION_LAG_MONTHS },
      () => reputation,
    ),
    doctors: 0,
  };
}

function initialState(scenario: Scenario): MutableState {
  const configs = clinicsOf(scenario).map((c) => ({ ...c }));
  /**
   * 開業時の自己資金。既定シナリオは検証済みの INITIAL_CASH のまま。
   * 本編は 1,000万 で始まる（docs/spec/06-opening.md §5）
   */
  const cash = scenario.initialCash ?? INITIAL_CASH;
  return {
    month: 0,
    rngSeed: scenario.seed,
    clinics: configs.map<ClinicState>((c) => newClinicState(c)),
    igyokuRelation: scenario.initialIgyokuRelation,
    agencyHiresCumulative: 0,
    nurses: scenario.initialNurses,
    schoolOpenedAtMonth: null,
    addons: initialAddonStatuses(),
    assets: [],
    loans: [],
    cash,
    accountsReceivable: 0,
    paidInCapital: cash,
    retainedEarnings: 0,
    doctorPlan: Object.fromEntries(configs.map((c) => [c.id, 0])),
    maintainIgyoku: true,
    igyokuDuty: false,
    configs,
    goalAchievedAt: {},
    insolventMonths: 0,
    epidemicUntilMonth: null,
    openingGraceUntilMonth: null,

    // 拡張系。ここが全部「空」であることが、検証済みの数字を守る条件
    externalRelations: initialRelations(),
    externalRelationActive: initialRelationActivity(),
    emrTier: null,
    emrMigrationEndsAtMonth: null,
    aiTools: [],
    equipment: [],
    maintenanceContract: false,
    pharmacyInvitedAt: {},
    propertyOwnedSince: {},
    executiveSalary: 0,
    cumulativeExecutiveSalary: 0,
    personalCash: 0,
    personalAssets: [],
    competitors: (scenario.competitors ?? []).map((c) => ({
      ...c,
      openedAtMonth: 1,
      weakMonths: 0,
      closedAtMonth: null,
    })),
  };
}

function clinicAssets(clinicId: ClinicId, month: number, capex: Man = CLINIC_CAPEX): FixedAsset[] {
  const equipment = capex * CLINIC_CAPEX_EQUIPMENT_SHARE;
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
      acquisitionCost: capex - equipment,
      usefulLifeMonths: USEFUL_LIFE_INTERIOR,
      bookValue: capex - equipment,
    },
  ];
}

export function runSimulation(scenario: Scenario = BASELINE_SCENARIO): SimulationRun {
  const state = initialState(scenario);
  /**
   * 乱数を引くのは2箇所だけ：保守未加入の機器の故障と、突発事象。
   * **どちらも既定シナリオでは一度も起きない**ので、検証済みの120ヶ月は完全に決定的。
   */
  const rng = createRng(scenario.seed);
  const randomEventsOn = scenario.features?.randomEvents === true;
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
    if (decision?.igyokuDuty !== undefined) state.igyokuDuty = decision.igyokuDuty;

    // 分院を開く。**開院月を state に足す**ので、以降このループが拾う
    if (decision?.openClinic && !state.configs.some((c) => c.id === decision.openClinic)) {
      const site = CLINIC_SITES.find((s) => s.id === decision.openClinic);
      if (site) {
        // 科は開院時に決める。あとから変えられない（docs/spec/05-specialty.md §8）
        const specialtyId = decision.openSpecialty ?? 'naika';
        // 内装も同じ。取り替えられない意思決定（docs/spec/06-opening.md §4）
        const fitout = fitoutOf(decision.openFitout);
        const plan = openingPlan(site, specialtyId, fitout.id, state.cash);
        const config: ClinicConfig = {
          id: site.id,
          name: site.name,
          districtId: site.districtId,
          specialtyId,
          openMonth: month,
          // ★その商圏でその科がどれだけ見込めるか。同じ立地でも科で変わる
          newPatientPotential: districtDemand(site.districtId, specialtyId),
          initialPatientStock: site.initialPatientStock,
          fitoutId: fitout.id,
          baselineReputation: fitout.baselineReputation,
          // ★ここで焼き付ける。焼き付いていない院は従来の経路を通るので、
          // 既定シナリオの資金繰りは 1 円も動かない（docs/spec/06-opening.md §3）
          capex: plan.capex,
          openingLoan: plan.loan,
          // 0 から埋まっていく局面は検証モデルに無い。素の式だと時定数74ヶ月で
          // 10年経っても埋まらない（docs/spec/06-opening.md §6）
          newPatientRamp: OPENING_RAMP_STRENGTH,
        };
        state.configs.push(config);
        state.clinics.push(newClinicState(config));
        // 開業据置は最初の1回だけ。分院ごとに延びると3年おきに建てて不死になる
        if (state.openingGraceUntilMonth === null) {
          state.openingGraceUntilMonth = month + OPENING_INSOLVENCY_GRACE_MONTHS;
        }
        state.doctorPlan[site.id] = state.doctorPlan[site.id] ?? 1;
      }
    }

    let openedClinicsThisMonth = 0;
    for (const config of state.configs) {
      if (config.openMonth !== month) continue;
      openedClinicsThisMonth++;
      /*
       * 開業で決めた額は config に焼き付いている（docs/spec/06-opening.md §3）。
       *
       * ★焼き付いていないのは**シナリオが最初から持っている院**だけで、
       * それは既定シナリオの A・B・C を指す。ここで CLINIC_SITES を引くと、
       * 候補地の値段を変えた瞬間に検証済みの資金繰りが動く。引かない。
       */
      const capex = config.capex ?? CLINIC_CAPEX;
      const loan = config.openingLoan ?? CLINIC_LOAN;
      capitalExpenditure += capex;
      state.assets.push(...clinicAssets(config.id, month, capex));
      newBorrowing += loan;
      state.loans.push({
        id: `loan-clinic-${config.id}`,
        name: `${config.name} 開業資金`,
        principal: loan,
        outstanding: loan,
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

    // ---- 拡張系の意思決定。既定シナリオは1つも書いていないので全て素通りする
    if (decision?.relationActivity) {
      for (const [id, on] of Object.entries(decision.relationActivity)) {
        if (on !== undefined) state.externalRelationActive[id as ExternalRelationId] = on;
      }
    }

    if (decision?.migrateEmr && decision.migrateEmr !== state.emrTier) {
      const spec = emrTierSpecOf(decision.migrateEmr);
      if (spec) {
        const stock = state.clinics.reduce((sum, c) => sum + c.patientStock, 0);
        const cost = migrationCostFor(decision.migrateEmr, stock);
        capitalExpenditure += cost;
        state.assets.push({
          id: `emr-${decision.migrateEmr}-${month}`,
          name: `電子カルテ ${spec.name}`,
          assetClass: 'intangible',
          acquiredAtMonth: month,
          acquisitionCost: cost,
          usefulLifeMonths: USEFUL_LIFE_INTERIOR,
          bookValue: cost,
        });
        state.emrTier = decision.migrateEmr;
        state.emrMigrationEndsAtMonth = month + spec.migrationPenaltyMonths;
      }
    }

    for (const toolId of decision?.adoptAiTools ?? []) {
      if (state.aiTools.includes(toolId)) continue;
      const spec = AI_TOOLS.find((t) => t.id === toolId);
      if (!spec) continue;
      state.aiTools.push(toolId);
      capitalExpenditure += spec.upfrontCost;
      state.assets.push({
        id: `ai-${toolId}`,
        name: spec.name,
        assetClass: 'intangible',
        acquiredAtMonth: month,
        acquisitionCost: spec.upfrontCost,
        usefulLifeMonths: USEFUL_LIFE_EQUIPMENT,
        bookValue: spec.upfrontCost,
      });
    }

    for (const order of decision?.buyEquipment ?? []) {
      if (state.equipment.some((e) => e.id === order.id)) continue;
      const spec = EQUIPMENT_CATALOG.find((e) => e.id === order.id);
      if (!spec) continue;
      const leased = order.lease === true;
      state.equipment.push({
        id: spec.id,
        leased,
        acquiredAtMonth: month,
        repairedAtMonth: null,
      });
      // リースは資産に載らない。毎月の費用として systemCost に出る
      if (!leased) {
        capitalExpenditure += spec.price;
        state.assets.push({
          id: `equipment-${spec.id}`,
          name: spec.name,
          assetClass: 'medicalEquipment',
          acquiredAtMonth: month,
          acquisitionCost: spec.price,
          usefulLifeMonths: USEFUL_LIFE_EQUIPMENT,
          bookValue: spec.price,
        });
      }
    }

    if (decision?.maintenanceContract !== undefined) {
      state.maintenanceContract = decision.maintenanceContract;
    }

    for (const clinicId of decision?.invitePharmacy ?? []) {
      if (state.pharmacyInvitedAt[clinicId] !== undefined) continue;
      state.pharmacyInvitedAt[clinicId] = month;
      capitalExpenditure += PHARMACY_INVITE_CAPEX;
      state.assets.push({
        id: `pharmacy-${clinicId}`,
        name: `${clinicId}院 門前薬局 躯体負担`,
        assetClass: 'building',
        acquiredAtMonth: month,
        acquisitionCost: PHARMACY_INVITE_CAPEX,
        usefulLifeMonths: USEFUL_LIFE_BUILDING,
        bookValue: PHARMACY_INVITE_CAPEX,
      });
    }

    for (const clinicId of decision?.buyProperty ?? []) {
      if (state.propertyOwnedSince[clinicId] !== undefined) continue;
      state.propertyOwnedSince[clinicId] = month;
      capitalExpenditure += PROPERTY_PRICE;
      state.assets.push({
        id: `property-${clinicId}`,
        name: `${clinicId}院 物件`,
        assetClass: 'building',
        acquiredAtMonth: month,
        acquisitionCost: PROPERTY_PRICE,
        usefulLifeMonths: USEFUL_LIFE_BUILDING,
        bookValue: PROPERTY_PRICE,
      });
    }

    if (decision?.executiveSalary !== undefined) {
      state.executiveSalary = Math.max(0, Math.min(EXECUTIVE_SALARY_MAX, decision.executiveSalary));
    }

    for (const assetId of decision?.buyPersonalAssets ?? []) {
      if (state.personalAssets.includes(assetId)) continue;
      const spec = PERSONAL_ASSETS.find((a) => a.id === assetId);
      // 個人の現金で買う。足りなければ買えない。法人の現金は動かない
      if (!spec || state.personalCash < spec.price) continue;
      state.personalCash -= spec.price;
      state.personalAssets.push(assetId);
    }

    // 関係値は維持費を払っていれば据え置き、払わなければ減衰する。上げるのは金ではない。
    // 当直を出しているあいだは毎月少しずつ上がる（代償は診察枠）
    const relationDelta =
      (decision?.igyokuRelationDelta ?? 0) + (state.igyokuDuty ? IGYOKU_DUTY_GAIN_PER_MONTH : 0);
    state.igyokuRelation = Math.max(
      0,
      Math.min(
        IGYOKU_RELATION_MAX,
        state.igyokuRelation + relationDelta - (state.maintainIgyoku ? 0 : RELATION_DECAY_PER_MONTH),
      ),
    );

    // 銀行から引く。**純資産の BANK_LEVERAGE_LIMIT 倍が上限。**
    // 債務超過だと1円も引けない。落ちてから借りて延命する、ができないようにしてある
    if (decision?.borrow && decision.borrow > 0) {
      const equity = state.paidInCapital + state.retainedEarnings;
      const outstanding = totalOutstanding(state.loans);
      const room = Math.max(0, equity * BANK_LEVERAGE_LIMIT - outstanding);
      const amount = Math.min(decision.borrow, room);
      if (amount > 0) {
        newBorrowing += amount;
        state.loans.push({
          id: `loan-bank-${month}`,
          name: `運転資金 ${monthLabel(month)}`,
          principal: amount,
          outstanding: amount,
          monthlyRate: LOAN_MONTHLY_RATE,
          monthlyRepaymentRate: LOAN_REPAYMENT_RATE,
        });
      }
    }

    // ------------------------------------------------ 1.5 突発事象
    //
    // ★features.randomEvents がオフなら rng を一度も引かない。
    // 既定シナリオはオフなので、検証済みの120ヶ月は完全に決定的なまま。
    let extraordinaryLoss: Man = 0;
    const randomEvents: RandomEventOccurrence[] = [];
    if (randomEventsOn) {
      const previousMonth = months[months.length - 1];
      const rolled = rollRandomEvents({
        month,
        rng,
        openClinics: state.configs.filter((c) => month >= c.openMonth),
        doctorsByClinic: state.doctorPlan,
        patientStockByClinic: Object.fromEntries(
          state.clinics.map((c) => [c.id, c.patientStock]),
        ),
        nurses: state.nurses,
        addonTotal: previousMonth?.fee.addonTotal ?? 0,
        insuranceRevenue: previousMonth?.financials.incomeStatement.insuranceRevenue ?? 0,
      });
      randomEvents.push(...rolled.events);

      for (const [id, lost] of Object.entries(rolled.doctorsLost)) {
        state.doctorPlan[id] = Math.max(0, (state.doctorPlan[id] ?? 0) - lost);
      }
      state.nurses = Math.max(0, state.nurses - rolled.nursesLost);
      // 競合は係数ではなく**盤上の相手**として増える。減り幅はシェアから出る
      for (const rival of rolled.newCompetitors) {
        state.competitors.push({ ...rival, openedAtMonth: month, weakMonths: 0, closedAtMonth: null });
      }
      extraordinaryLoss += rolled.extraordinaryLoss;
      if (rolled.epidemicUntilMonth !== null) state.epidemicUntilMonth = rolled.epidemicUntilMonth;
    }
    const epidemic =
      state.epidemicUntilMonth !== null && month < state.epidemicUntilMonth;

    // ---------------------------------------------------------- 2. 人材
    //
    // ★調達可能数を先に決める。**置きたい人数がそのまま置けるとは限らない。**
    // 医局の派遣枠と紹介会社の累計がその月に確保できる医師の上限で、
    // 超えた分は「採用できていない空席」として消える。
    // ここでクランプしないと、医局も紹介会社も無視して医師を積めてしまい、
    // あの2画面が警告を出すだけの飾りになる。
    const igyokuSlots = igyokuSlotsOf(state.igyokuRelation);
    const doctorsProcurable = igyokuSlots + state.agencyHiresCumulative;

    // 開院順に配る。**先に開いた院を守る。**
    // 医師が抜けたときに本院から削れると、屋台骨から崩れて立て直せない
    // 科によって医師1名が食う枠が違う（精神科 1.6、眼科 1.4、内科 1.0）
    const doctorsByClinic: Record<ClinicId, number> = {};
    let doctorsPlanned = 0;
    let remaining = doctorsProcurable;
    for (const config of state.configs) {
      const wanted = month >= config.openMonth ? (state.doctorPlan[config.id] ?? 0) : 0;
      doctorsPlanned += wanted;
      const cost = specialtyOf(config.specialtyId).doctorScarcity;
      const affordable = Math.floor(Math.max(0, remaining) / cost + 1e-9);
      const placed = Math.min(wanted, affordable);
      doctorsByClinic[config.id] = placed;
      remaining -= placed * cost;
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

    const staff: StaffTick = {
      doctorsByClinic,
      doctorsTotal,
      igyokuRelation: state.igyokuRelation,
      igyokuSlots,
      agencyHiresCumulative: state.agencyHiresCumulative,
      doctorsProcurable,
      doctorShortfall: doctorsPlanned > doctorsProcurable,
      doctorsPlanned,
      doctorsUnfilled: doctorsPlanned - doctorsTotal,
      nurses: state.nurses,
      nursesRequired,
      nurseSufficiency,
      nursesFromSchool: nurseTick.fromSchool,
      nursesFromMarket: nurseTick.fromMarket,
      igyokuDuty: state.igyokuDuty,
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

    // ------------------------------------------------ 3.5 拡張系の係数を確定する
    //
    // 診療所を tick する前に決めておく必要がある。当番医も在宅もカルテ移行も
    // 「診察枠に効く」ので、枠を計算する前に係数として畳んでおく。
    // 何も起こしていなければ、この節を通っても係数は全部 1 のまま。
    state.externalRelations = advanceRelations({
      current: state.externalRelations,
      active: state.externalRelationActive,
      openedClinics: openedClinicsThisMonth,
      openingPenalty: MEDICAL_ASSOCIATION_OPENING_PENALTY,
    });
    const relations = relationsTickOf(state.externalRelations, state.externalRelationActive);

    const breakdowns = rollBreakdowns({
      equipment: state.equipment,
      maintenanceContract: state.maintenanceContract,
      month,
      rng,
    });
    state.equipment = breakdowns.equipment;

    const equipmentBookValue: Record<string, Man> = {};
    for (const asset of state.assets) {
      if (asset.id.startsWith('equipment-')) {
        equipmentBookValue[asset.id.slice('equipment-'.length)] = asset.bookValue;
      }
    }
    const vendor = vendorTickOf({
      month,
      emrTier: state.emrTier,
      emrMigrationEndsAtMonth: state.emrMigrationEndsAtMonth,
      equipment: state.equipment,
      aiTools: state.aiTools,
      maintenanceContract: state.maintenanceContract,
      equipmentBookValue,
    });

    const capacityMultiplier =
      relationCapacityMultiplier(relations, state.externalRelations.medicalAssociation) *
      (1 - vendor.migrationCapacityPenalty) *
      (state.igyokuDuty ? 1 - IGYOKU_DUTY_CAPACITY_DRAG : 1);
    const newPatientMultiplier = 1 + relations.referralUplift;
    const selfPayMultiplier =
      relationSelfPayMultiplier(relations) * (1 + vendor.equipmentSelfPayUplift);

    // ------------------------------------------------ 3.7 商圏
    //
    // ★シェアは**前月の**評判と待ち時間から出す。今月の待ち時間は今月の需要で決まり、
    // 需要はシェアで決まるので、今月の値を使うと循環する（docs/spec/04-market.md §2）。
    const marketOutcome = tickMarket({
      month,
      clinics: state.configs.map((config) => {
        const previous = state.clinics.find((c) => c.id === config.id);
        return {
          config,
          open: month >= config.openMonth,
          reputation: previous?.reputation ?? INITIAL_REPUTATION,
          waitMinutes: previous?.waitMinutes ?? 0,
          doctors: state.doctorPlan[config.id] ?? 0,
        };
      }),
      competitors: state.competitors,
    });
    state.competitors = marketOutcome.competitors;

    // ---------------------------------------------------------- 4. 診療所
    const clinicTicks: ClinicTick[] = [];
    let insuranceRevenue: Man = 0;
    let selfPayRevenue: Man = 0;
    let medicalSupplies: Man = 0;
    let doctorPayroll: Man = 0;
    let nursePayroll: Man = 0;
    let rent: Man = 0;

    for (const config of state.configs) {
      const previous = state.clinics.find((c) => c.id === config.id);
      if (!previous) continue;
      const doctors = doctorsByClinic[config.id] ?? 0;
      const rentMultiplier = rentMultiplierFor(state.propertyOwnedSince[config.id] !== undefined);
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
        extraVisitsPerDoctorPerDay: vendor.extraVisitsPerDoctorPerDay,
        capacityMultiplier,
        newPatientMultiplier,
        selfPayMultiplier,
        rentMultiplier,
        demandMultiplier: epidemic ? 1 + EPIDEMIC_DEMAND_UPLIFT : 1,
        marketShare: marketOutcome.shareByClinic[config.id] ?? 1,
      });
      clinicTicks.push(tick);

      previous.patientStock = tick.patientStock;
      previous.reputation = tick.reputation;
      previous.waitMinutes = tick.waitMinutes;
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
        rent += CLINIC_FIXED_COST_PER_MONTH * rentMultiplier;
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

    // 拡張系の収支。誘致も取得もしていなければ全て 0
    const pharmacy = pharmacyTickOf({
      clinics: state.configs.map((c) => {
        const tick = clinicTicks.find((t) => t.id === c.id);
        return {
          id: c.id,
          name: c.name,
          patientStock: tick?.patientStock ?? 0,
          open: month >= c.openMonth,
        };
      }),
      invitedAt: state.pharmacyInvitedAt,
    });

    const propertyBookValue: Record<ClinicId, Man> = {};
    for (const asset of state.assets) {
      if (asset.id.startsWith('property-')) {
        propertyBookValue[asset.id.slice('property-'.length)] = asset.bookValue;
      }
    }
    const realEstate = realEstateTickOf({
      clinics: state.configs.map((c) => ({ id: c.id, name: c.name, open: month >= c.openMonth })),
      ownedSince: state.propertyOwnedSince,
      bookValueByClinic: propertyBookValue,
    });

    // 役員報酬は法人の費用であり、同額が個人へ移る。手取りは税を引いた分
    const salary = state.executiveSalary;
    state.cumulativeExecutiveSalary += salary;
    state.personalCash += salary * (1 - PERSONAL_TAX_RATE);
    const personal = personalTickOf({
      salary,
      cumulativeSalary: state.cumulativeExecutiveSalary,
      cash: state.personalCash,
      owned: state.personalAssets,
    });

    const incomeLines: BuildLines = {
      insuranceRevenue,
      selfPayRevenue,
      tuitionRevenue,
      rentalRevenue: pharmacy.rentalRevenue,
      contractRevenue: relations.contractRevenue,
      medicalSupplies,
      doctorPayroll,
      nursePayroll,
      otherPayroll: salary,
      rent,
      depreciation: depreciated.depreciation,
      schoolOperating,
      agencyFees,
      igyokuRelationCost: state.maintainIgyoku ? IGYOKU_RELATION_COST_PER_MONTH : 0,
      externalRelationCost: relations.totalCost,
      systemCost: vendor.recurringCost,
      headquarters: HQ_COST_PER_MONTH,
      interestExpense: serviced.interest,
      extraordinaryLoss,
    };

    const expansion: ExpansionTick = {
      relations,
      vendor,
      pharmacy,
      realEstate,
      personal,
      capacityMultiplier,
      newPatientMultiplier,
      selfPayMultiplier,
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

    const clinicNames = Object.fromEntries(state.configs.map((c) => [c.id, c.name]));
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

    // ---------------------------------------------------------- 6. ゴールと終局
    const goalTick = evaluateGoals({
      month,
      totalPatientStock: clinicTicks.reduce((sum, c) => sum + c.patientStock, 0),
      balanceSheet: financials.balanceSheet,
      ordinaryIncome: financials.incomeStatement.ordinaryIncome,
      personal,
      achievedAt: state.goalAchievedAt,
      insolventMonths: state.insolventMonths,
      openingGraceUntilMonth: state.openingGraceUntilMonth,
      totalMonths: scenario.totalMonths,
    });
    state.insolventMonths = goalTick.end.insolventMonths;
    for (const g of goalTick.goals) {
      if (g.achievedAtMonth !== null) state.goalAchievedAt[g.id] = g.achievedAtMonth;
    }

    months.push({
      month,
      label: monthLabel(month),
      clinics: clinicTicks,
      staff,
      fee,
      financials,
      events: [
        ...events,
        // 突発事象は通知として出す。どの画面に出すかは severity ではなく中身で決める
        ...randomEvents.map((e) => ({
          id: `random-${e.id}-${e.month}${e.clinicId ? `-${e.clinicId}` : ''}`,
          month: e.month,
          clinicId: e.clinicId,
          severity: e.severity,
          screen: screenForRandomEvent(e.id),
          title: e.title,
          body: e.body,
        })),
      ],
      expansion,
      goals: goalTick,
      market: marketOutcome.tick,
    });
  }

  const { doctorPlan: _doctorPlan, maintainIgyoku: _maintainIgyoku, ...finalState } = state;
  return { scenarioId: scenario.id, months, finalState };
}

/** 突発事象をどの画面のバッジに出すか。原因のある場所へ送る */
function screenForRandomEvent(id: RandomEventOccurrence['id']): ScreenId {
  switch (id) {
    case 'doctorResigned':
      return 'personnel';
    case 'nurseExodus':
      return 'personnel';
    case 'competitorOpened':
      return 'map';
    case 'bureauAudit':
      return 'bureau';
    case 'epidemic':
      return 'map';
  }
}

type BuildLines = Omit<
  IncomeStatement,
  'totalRevenue' | 'totalExpenses' | 'operatingIncome' | 'ordinaryIncome' | 'pretaxIncome' | 'tax' | 'netIncome'
>;

/** 借入の残高合計。B/S を組む前の期首残高を見たいとき用 */
export function totalOutstanding(loans: Loan[]): Man {
  return loans.reduce((sum, l) => sum + l.outstanding, 0);
}
