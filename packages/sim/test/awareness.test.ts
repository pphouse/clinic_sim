/**
 * 集患と認知度の検証。docs/spec/07-awareness.md
 *
 * ★この層は検証されていない。だからここでも最重要は
 * 「**既定シナリオが1ミリも動かないこと**」で、それ自体を最初に検証する。
 */
import { describe, expect, it } from 'vitest';
import {
  AWARENESS_BASE,
  AWARENESS_MAX,
  BASELINE_SCENARIO,
  CLINICS,
  CLINIC_SITES,
  INITIAL_AWARENESS_INHERITED,
  INITIAL_AWARENESS_NEW,
  MARKETING_LEVELS,
  PLAY_SCENARIO,
  awarenessCeilingOf,
  marketingLevelOf,
  nextAwareness,
  runSimulation,
  totalPatientStock,
  type MarketingLevelId,
  type MonthDecision,
  type MonthResult,
} from '../src/index';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
/** 突発事象を切って集患だけを比べる */
const quiet = (decisions: MonthDecision[]) =>
  runSimulation({ ...PLAY_SCENARIO, features: {}, decisions });

const openA = (level: MarketingLevelId, doctors = 2): MonthDecision => ({
  month: 1,
  openClinic: 'A',
  openSpecialty: 'naika',
  openFitout: 'standard',
  doctorsByClinic: { A: doctors },
  marketingByClinic: { A: level },
});

// ==================================================================
// ★既定シナリオは認知度を持たない
// ==================================================================

describe('既定シナリオは集患の層を通らない', () => {
  const baseline = runSimulation(BASELINE_SCENARIO);

  it('3院とも initialAwareness を持たない', () => {
    for (const config of CLINICS) {
      expect(config.initialAwareness).toBeUndefined();
    }
  });

  it('120ヶ月ずっと認知度 1。新規患者の式に掛かる係数が動かない', () => {
    for (const m of baseline.months) {
      for (const c of m.clinics) {
        expect(c.awareness, `${m.month}ヶ月目 ${c.id}院`).toBe(1);
      }
    }
  });

  it('広告宣伝費が1円も立たない', () => {
    for (const m of baseline.months) {
      expect(m.financials.incomeStatement.marketing).toBe(0);
    }
  });

  it('集患の意思決定を1つも持たない', () => {
    expect(BASELINE_SCENARIO.decisions.some((d) => d.marketingByClinic)).toBe(false);
  });
});

// ==================================================================
// 認知度の式
// ==================================================================

describe('認知度の落ち着き先', () => {
  it('看板だけなら基礎のぶんしか届かない', () => {
    expect(awarenessCeilingOf('none', 0, 1000)).toBeCloseTo(AWARENESS_BASE, 9);
  });

  it('★口コミが入る。患者が増えると認知度が上がり、認知度が上がると患者が増える', () => {
    const empty = awarenessCeilingOf('none', 0, 1000);
    const half = awarenessCeilingOf('none', 500, 1000);
    const full = awarenessCeilingOf('none', 1000, 1000);
    expect(half).toBeGreaterThan(empty);
    expect(full).toBeGreaterThan(half);
    // 埋まりきったら頭打ち。それ以上は伸びない
    expect(awarenessCeilingOf('none', 5000, 1000)).toBeCloseTo(full, 9);
  });

  it('★逓減する。金で殴り切れない', () => {
    const reach = MARKETING_LEVELS.map((m) => m.reach);
    const cost = MARKETING_LEVELS.map((m) => m.costPerMonth);
    // 6.4倍払って 2.5倍しか届かない
    expect(cost[3]! / cost[1]!).toBeGreaterThan(reach[3]! / reach[1]!);
  });

  it('上限がある。商圏を100%取ることはできない', () => {
    expect(awarenessCeilingOf('heavy', 10000, 1000)).toBeLessThanOrEqual(AWARENESS_MAX);
    expect(AWARENESS_MAX).toBeLessThan(1);
  });

  it('上げるのも落ちるのも同じ速さ', () => {
    const up = nextAwareness(0.4, 0.8) - 0.4;
    const down = 0.8 - nextAwareness(0.8, 0.4);
    expect(up).toBeCloseTo(down, 9);
  });
});

// ==================================================================
// 集患投資
// ==================================================================

describe('集患投資', () => {
  it('打った院だけ認知度が伸びる', () => {
    const silent = quiet([openA('none')]);
    const loud = quiet([openA('heavy')]);
    expect(at(loud, 36).clinics[0]!.awareness).toBeGreaterThan(
      at(silent, 36).clinics[0]!.awareness,
    );
  });

  it('★集患しないと商圏の一部しか取れない。患者数で差が出る', () => {
    const silent = quiet([openA('none')]);
    const loud = quiet([openA('web')]);
    expect(totalPatientStock(at(loud, 60))).toBeGreaterThan(
      totalPatientStock(at(silent, 60)) * 1.4,
    );
  });

  it('費用が P/L に立つ。資産にはしない', () => {
    const loud = quiet([openA('web')]);
    expect(at(loud, 12).financials.incomeStatement.marketing).toBeCloseTo(
      marketingLevelOf('web').costPerMonth,
      6,
    );
    expect(-at(loud, 12).financials.cashFlow.capitalExpenditure).toBe(0);
  });

  it('★やめれば落ちる。続けているあいだだけ効く', () => {
    const kept = quiet([openA('heavy')]);
    const stopped = quiet([openA('heavy'), { month: 37, marketingByClinic: { A: 'none' } }]);
    expect(at(stopped, 36).clinics[0]!.awareness).toBeCloseTo(
      at(kept, 36).clinics[0]!.awareness,
      9,
    );
    expect(at(stopped, 60).clinics[0]!.awareness).toBeLessThan(
      at(kept, 60).clinics[0]!.awareness,
    );
  });

  it('開院前の院には費用が立たない', () => {
    const run = quiet([
      openA('web'),
      { month: 1, marketingByClinic: { B: 'heavy' } },
      { month: 25, openClinic: 'B', openSpecialty: 'hifuka', doctorsByClinic: { B: 1 } },
    ]);
    expect(at(run, 12).financials.incomeStatement.marketing).toBeCloseTo(
      marketingLevelOf('web').costPerMonth,
      6,
    );
  });
});

// ==================================================================
// 承継
// ==================================================================

describe('承継は認知度を引き継ぐ', () => {
  it('候補地ごとに開院時の認知度が違う', () => {
    const inherited = CLINIC_SITES.find((s) => s.id === 'D')!;
    const fresh = CLINIC_SITES.find((s) => s.id === 'B')!;
    expect(inherited.initialAwareness).toBe(INITIAL_AWARENESS_INHERITED);
    expect(fresh.initialAwareness).toBe(INITIAL_AWARENESS_NEW);
    expect(inherited.initialAwareness).toBeGreaterThan(fresh.initialAwareness);
  });

  it('開院した月の認知度が候補地の値そのもの', () => {
    const run = quiet([
      openA('none'),
      { month: 25, openClinic: 'D', openSpecialty: 'naika', doctorsByClinic: { D: 2 }, agencyHires: 2 },
    ]);
    const d = at(run, 25).clinics.find((c) => c.id === 'D')!;
    expect(d.awareness).toBeCloseTo(INITIAL_AWARENESS_INHERITED, 9);
  });
});

// ==================================================================
// 通知
// ==================================================================

describe('知られていないことを通知する', () => {
  it('★集患を打っていない院は名指しされる。待ち時間と違って画面に赤く出ないから', () => {
    const silent = quiet([openA('none')]);
    const events = silent.months
      .flatMap((m) => m.events)
      .filter((e) => e.id.startsWith('awareness-'));
    expect(events.length).toBeGreaterThan(0);
  });

  it('打っていれば出ない', () => {
    const loud = quiet([openA('web')]);
    expect(
      loud.months.flatMap((m) => m.events).filter((e) => e.id.startsWith('awareness-')),
    ).toHaveLength(0);
  });

  it('既定シナリオでは1件も出ない。認知度を持たないから', () => {
    const baseline = runSimulation(BASELINE_SCENARIO);
    expect(
      baseline.months.flatMap((m) => m.events).filter((e) => e.id.startsWith('awareness-')),
    ).toHaveLength(0);
  });
});

// ==================================================================
// ★集患しないと死ぬ
// ==================================================================

describe('集患は必須の意思決定', () => {
  it('★看板だけで開くと破綻する。放っておいて成立する開業は無い', () => {
    expect(quiet([openA('none')]).months.some((m) => m.goals.end.reason === 'bankrupt')).toBe(
      true,
    );
  });

  it('打てば生き残れる。同じ立地・同じ科・同じ医師数で結果が変わる', () => {
    const run = quiet([openA('web')]);
    expect(run.months.some((m) => m.goals.end.reason === 'bankrupt')).toBe(false);
    expect(at(run, 120).goals.end.reason).toBe('timeUp');
  });
});
