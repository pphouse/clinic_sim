/**
 * 開業の検証。docs/spec/06-opening.md
 *
 * ★この層は検証されていない。一般的な診療所開業の相場から置いた数字。
 * だからここでも最重要は「**既定シナリオが1ミリも動かないこと**」で、
 * それ自体を最初に検証する。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_REPUTATION,
  BASELINE_SCENARIO,
  CLINIC_CAPEX,
  CLINIC_LOAN,
  CLINIC_SITES,
  CLINICS,
  FITOUTS,
  INITIAL_CASH,
  OPENING_INSOLVENCY_GRACE_MONTHS,
  OPENING_OWN_FUNDS,
  OPENING_RAMP_STRENGTH,
  OPENING_WORKING_CAPITAL_RATE,
  PLAY_SCENARIO,
  churnRateOf,
  fitoutOf,
  nextReputation,
  openingPlan,
  openingRampFactor,
  runSimulation,
  specialtyOf,
  totalPatientStock,
  type MonthDecision,
  type MonthResult,
} from '../src/index';
import { withOpeningA } from './helpers';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
const play = (decisions: MonthDecision[]) =>
  runSimulation({ ...PLAY_SCENARIO, features: {}, decisions });
const siteA = CLINIC_SITES.find((s) => s.id === 'A')!;

// ==================================================================
// ★既定シナリオはこの層を一度も通らない
// ==================================================================

describe('既定シナリオは開業の層を通らない', () => {
  const baseline = runSimulation(BASELINE_SCENARIO);

  it('開業の意思決定を1つも持たない', () => {
    expect(BASELINE_SCENARIO.decisions.some((d) => d.openClinic)).toBe(false);
    expect(BASELINE_SCENARIO.clinics).toBeUndefined();
    expect(BASELINE_SCENARIO.initialCash).toBeUndefined();
  });

  it('初期現金は検証済みの INITIAL_CASH のまま', () => {
    expect(baseline.months[0]!.financials.balanceSheet.cash).toBeGreaterThan(0);
    expect(BASELINE_SCENARIO.initialCash ?? INITIAL_CASH).toBe(INITIAL_CASH);
  });

  it('3院とも内装も立ち上がりも持たない。式が素のまま残る', () => {
    for (const config of CLINICS) {
      expect(config.fitoutId).toBeUndefined();
      expect(config.baselineReputation).toBeUndefined();
      expect(config.capex).toBeUndefined();
      expect(config.openingLoan).toBeUndefined();
      expect(config.newPatientRamp).toBeUndefined();
    }
  });

  it('開院月の投資額と借入は CLINIC_CAPEX / CLINIC_LOAN のまま', () => {
    // A院は1ヶ月目。候補地 A の値段（5,500）ではなく検証済みの 6,000 を通る
    expect(-baseline.months[0]!.financials.cashFlow.capitalExpenditure).toBeCloseTo(
      CLINIC_CAPEX,
      6,
    );
    expect(baseline.months[0]!.financials.cashFlow.newBorrowing).toBeCloseTo(CLINIC_LOAN, 6);
  });

  it('開業据置を持たない。破綻の判定は従来どおり', () => {
    expect(baseline.finalState.openingGraceUntilMonth).toBeNull();
  });
});

// ==================================================================
// 恒等式
// ==================================================================

describe('恒等式', () => {
  it('内装を持たない院の評判の回帰先は BASELINE_REPUTATION', () => {
    expect(nextReputation(60, 0)).toBe(nextReputation(60, 0, BASELINE_REPUTATION));
  });

  it('立ち上がりを持たない院の係数は 1', () => {
    expect(openingRampFactor(undefined, 0, 50, 0.04)).toBe(1);
    expect(openingRampFactor(0, 0, 50, 0.04)).toBe(1);
  });

  it('標準内装は倍率1・回帰先75。何も足していないのと同じ', () => {
    const standard = fitoutOf('standard');
    expect(standard.capexMultiplier).toBe(1);
    expect(standard.baselineReputation).toBe(BASELINE_REPUTATION);
  });
});

// ==================================================================
// 開業資金
// ==================================================================

describe('開業資金', () => {
  it('自己資金だけでは足りない。差額を100万単位で借りる', () => {
    const plan = openingPlan(siteA, 'naika', 'standard', OPENING_OWN_FUNDS);
    expect(plan.capex).toBe(siteA.capex);
    expect(plan.workingCapital).toBe(Math.round(siteA.capex * OPENING_WORKING_CAPITAL_RATE));
    expect(plan.loan).toBeGreaterThan(0);
    expect(plan.loan % 100).toBe(0);
    expect(plan.capex + plan.workingCapital - OPENING_OWN_FUNDS).toBeLessThanOrEqual(plan.loan);
  });

  it('★借りたあと手元に残るのは運転資金。レセプトは2ヶ月遅れる', () => {
    const plan = openingPlan(siteA, 'naika', 'standard', OPENING_OWN_FUNDS);
    expect(plan.cashAfter).toBeGreaterThanOrEqual(plan.workingCapital);
    expect(plan.cashAfter).toBeLessThan(plan.workingCapital + 100);
  });

  it('現金が潤沢なら借りない。2院目以降は同じ式で自己資金で建つ', () => {
    const plan = openingPlan(siteA, 'naika', 'standard', 50000);
    expect(plan.loan).toBe(0);
    expect(plan.cashAfter).toBe(50000 - plan.capex);
  });

  it('内装と科の両方が投資額に効く', () => {
    const cash = OPENING_OWN_FUNDS;
    const basic = openingPlan(siteA, 'naika', 'basic', cash);
    const premium = openingPlan(siteA, 'naika', 'premium', cash);
    const ganka = openingPlan(siteA, 'ganka', 'standard', cash);
    expect(basic.capex).toBeLessThan(premium.capex);
    expect(basic.loan).toBeLessThan(premium.loan);
    // 眼科は設備が2倍
    expect(ganka.capex).toBeCloseTo(siteA.capex * specialtyOf('ganka').capexMultiplier, 0);
  });

  it('決めた額が焼き付いて、実際の資金繰りに出る', () => {
    const run = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'premium', doctorsByClinic: { A: 2 } },
    ]);
    const plan = openingPlan(siteA, 'naika', 'premium', OPENING_OWN_FUNDS);
    expect(-at(run, 1).financials.cashFlow.capitalExpenditure).toBeCloseTo(plan.capex, 6);
    expect(at(run, 1).financials.cashFlow.newBorrowing).toBeCloseTo(plan.loan, 6);
  });
});

// ==================================================================
// 内装
// ==================================================================

describe('内装グレード', () => {
  it('★評判は落ち着き先そのものが変わる。開院時の下駄ではない', () => {
    const runs = FITOUTS.map((f) => ({
      fitout: f,
      run: play([
        { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: f.id, doctorsByClinic: { A: 3 } },
      ]),
    }));
    for (const { fitout, run } of runs) {
      const first = at(run, 1).clinics[0]!;
      expect(first.reputation).toBeCloseTo(fitout.baselineReputation, 0);
      // 60ヶ月経っても居抜きが標準に追いつかない。**回帰先が違うから**
      const late = at(run, 60).clinics[0]!.reputation;
      expect(late).toBeGreaterThan(fitout.baselineReputation - 20);
    }
    const [basic, standard, premium] = runs.map((r) => at(r.run, 60).clinics[0]!.reputation);
    expect(basic!).toBeLessThan(standard!);
    expect(standard!).toBeLessThan(premium!);
  });

  it('こだわり内装は高く付く代わりに患者が増える', () => {
    const cheap = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'basic', doctorsByClinic: { A: 3 } },
    ]);
    const nice = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'premium', doctorsByClinic: { A: 3 } },
    ]);
    expect(totalPatientStock(at(nice, 60))).toBeGreaterThan(totalPatientStock(at(cheap, 60)));
    expect(at(nice, 1).financials.cashFlow.newBorrowing).toBeGreaterThan(
      at(cheap, 1).financials.cashFlow.newBorrowing,
    );
  });

  it('内装は混雑への耐性ではない。待たせれば評判は落ちる', () => {
    // こだわり内装で医師1名。需要に対して枠が足りず、待ち時間で削られる
    const jammed = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'premium', doctorsByClinic: { A: 1 } },
    ]);
    const roomy = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'premium', doctorsByClinic: { A: 3 } },
    ]);
    expect(at(jammed, 24).clinics[0]!.reputation).toBeLessThan(
      at(roomy, 24).clinics[0]!.reputation,
    );
  });
});

// ==================================================================
// 立ち上がり
// ==================================================================

describe('開院直後の立ち上がり', () => {
  it('★落ち着き先は動かない。速さだけが変わる', () => {
    const settledNew = 50;
    const churn = churnRateOf(0, 0.04);
    const settledStock = settledNew / churn;
    // 埋まりきったら係数は 1。それ以上は引っ張らない
    expect(openingRampFactor(OPENING_RAMP_STRENGTH, settledStock, settledNew, 0.04)).toBeCloseTo(1, 9);
    expect(openingRampFactor(OPENING_RAMP_STRENGTH, settledStock * 2, settledNew, 0.04)).toBe(1);
    // 空っぽなら (1 + 強さ) 倍
    expect(openingRampFactor(OPENING_RAMP_STRENGTH, 0, settledNew, 0.04)).toBeCloseTo(
      1 + OPENING_RAMP_STRENGTH,
      9,
    );
  });

  it('3年でおおむね埋まる。素の式だと10年かかって開業が成立しない', () => {
    const run = play([
      { month: 1, openClinic: 'A', openSpecialty: 'naika', openFitout: 'standard', doctorsByClinic: { A: 3 } },
    ]);
    const at36 = totalPatientStock(at(run, 36));
    const at120 = totalPatientStock(at(run, 120));
    expect(at36).toBeGreaterThan(at120 * 0.8);
  });
});

// ==================================================================
// 開業据置
// ==================================================================

describe('開業据置', () => {
  it('最初の開業から3年ぶん立つ', () => {
    const run = play(
      withOpeningA([{ month: 25, openClinic: 'B', openSpecialty: 'hifuka' }]),
    );
    expect(run.finalState.openingGraceUntilMonth).toBe(1 + OPENING_INSOLVENCY_GRACE_MONTHS);
  });

  it('★分院を出しても延びない。3年おきに建てて不死、はできない', () => {
    const once = play(withOpeningA([]));
    const many = play(
      withOpeningA([
        { month: 30, openClinic: 'B', openSpecialty: 'hifuka' },
        { month: 60, openClinic: 'C', openSpecialty: 'seishin' },
      ]),
    );
    expect(many.finalState.openingGraceUntilMonth).toBe(once.finalState.openingGraceUntilMonth);
  });
});

// ==================================================================
// 本編の初期状態
// ==================================================================

describe('本編は院を持たずに始まる', () => {
  it('1ヶ月目に院が無く、患者も0', () => {
    const run = runSimulation({ ...PLAY_SCENARIO, decisions: [] });
    expect(at(run, 1).clinics).toHaveLength(0);
    expect(totalPatientStock(at(run, 1))).toBe(0);
  });

  it('手元は自己資金だけ。1.5億は無い', () => {
    const run = runSimulation({ ...PLAY_SCENARIO, decisions: [] });
    expect(at(run, 1).financials.balanceSheet.cash).toBeLessThan(OPENING_OWN_FUNDS);
    expect(PLAY_SCENARIO.initialCash).toBe(OPENING_OWN_FUNDS);
  });

  it('★開業しないまま月を送ると本部費だけが出ていく', () => {
    const run = runSimulation({ ...PLAY_SCENARIO, decisions: [] });
    expect(at(run, 12).financials.balanceSheet.cash).toBeLessThan(
      at(run, 1).financials.balanceSheet.cash,
    );
  });
});
