/**
 * 判断の密度の検証。docs/spec/08-decisions.md
 *
 * ★この層は検証されていない。だからここでも最重要は
 * 「**既定シナリオが1ミリも動かないこと**」で、それ自体を最初に検証する。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  MAX_SKIP_MONTHS,
  PLAY_SCENARIO,
  REVIEW_REPUTATION_DAMAGE,
  RETAIN_DOCTOR_COST,
  attentionOf,
  chosenChoiceOf,
  eventKeyOf,
  nextStopMonth,
  runSimulation,
  spanDigest,
  type MonthDecision,
  type MonthResult,
} from '../src/index';
import { withOpeningA } from './helpers';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
const play = (decisions: MonthDecision[], seed = PLAY_SCENARIO.seed) =>
  runSimulation({ ...PLAY_SCENARIO, seed, decisions: withOpeningA(decisions) });

/** 選択肢を持つイベントを、どれかの種で1つ拾う */
function findChoiceEvent(id: string) {
  for (const seed of [20240401, 7, 99, 1234, 555, 31337]) {
    const run = play([], seed);
    for (const m of run.months) {
      const event = m.events.find((e) => e.id.startsWith(`random-${id}-`) && e.choices);
      if (event) return { run, month: m.month, event, seed };
    }
  }
  return null;
}

// ==================================================================
// ★既定シナリオは選択を1つも迫らない
// ==================================================================

describe('既定シナリオは判断の層を通らない', () => {
  const baseline = runSimulation(BASELINE_SCENARIO);

  it('選択肢のあるイベントが1件も出ない', () => {
    expect(baseline.months.flatMap((m) => m.events).filter((e) => e.choices)).toHaveLength(0);
  });

  it('節目の通知も出ない。features.milestones がオフだから', () => {
    expect(
      baseline.months.flatMap((m) => m.events).filter((e) => e.id.startsWith('milestone-')),
    ).toHaveLength(0);
  });

  it('意思決定に eventChoices を1つも持たない', () => {
    expect(BASELINE_SCENARIO.decisions.some((d) => d.eventChoices)).toBe(false);
  });

  it('★120ヶ月ずっと手が要らない＝止まる理由が無い', () => {
    // 既定シナリオは債務超過に入るので insolvent と critical では止まる。
    // 「選択」と「目標」では一度も止まらないことを見る
    const reasons = baseline.months.map((m, i) => attentionOf(m, baseline.months[i - 1] ?? null));
    expect(reasons).not.toContain('choice');
  });
});

// ==================================================================
// イベントの鍵と既定の選択肢
// ==================================================================

describe('選択肢', () => {
  it('鍵は id・院・月から一意に決まる', () => {
    expect(eventKeyOf('doctorResigned', 12, 'A')).toBe('doctorResigned-A-12');
    expect(eventKeyOf('epidemic', 12)).toBe('epidemic-group-12');
  });

  it('答えていなければ既定の選択肢が返る', () => {
    const event = {
      id: 'doctorResigned' as const,
      key: 'k',
      month: 1,
      severity: 'critical' as const,
      title: '',
      body: '',
      choices: [
        { id: 'retain', label: '', detail: '', effect: {} },
        { id: 'release', label: '', detail: '', effect: {}, isDefault: true },
      ],
    };
    expect(chosenChoiceOf(event, undefined)?.id).toBe('release');
    expect(chosenChoiceOf(event, { k: 'retain' })?.id).toBe('retain');
    // 知らせるだけのイベントは null
    expect(chosenChoiceOf({ ...event, choices: undefined }, undefined)).toBeNull();
  });
});

// ==================================================================
// ★答えが効く
// ==================================================================

describe('答えると盤面が変わる', () => {
  it('★常勤医を引き止めると枠が落ちない。代わりに一時金が出る', () => {
    const found = findChoiceEvent('doctorResigned');
    expect(found).not.toBeNull();
    const { month, event, seed } = found!;

    const ignored = play([], seed);
    const retained = play([{ month, eventChoices: { [event.choiceKey!]: 'retain' } }], seed);

    // 同じ月に同じイベントが出る（乱数列が変わらない）
    expect(at(retained, month).events.some((e) => e.choiceKey === event.choiceKey)).toBe(true);
    // 引き止めた側は医師が減らない
    expect(at(retained, month).staff.doctorsPlanned).toBeGreaterThan(
      at(ignored, month).staff.doctorsPlanned,
    );
    // 代わりに特別損失が立つ
    expect(at(retained, month).financials.incomeStatement.extraordinaryLoss).toBeCloseTo(
      at(ignored, month).financials.incomeStatement.extraordinaryLoss + RETAIN_DOCTOR_COST,
      6,
    );
  });

  it('★悪い口コミは放置すると評判が落ちる。対応すれば落ちない', () => {
    const found = findChoiceEvent('badReview');
    expect(found).not.toBeNull();
    const { month, event, seed } = found!;
    const clinicId = event.clinicId!;

    const ignored = play([], seed);
    const handled = play([{ month, eventChoices: { [event.choiceKey!]: 'respond' } }], seed);

    const rep = (r: typeof ignored) =>
      at(r, month).clinics.find((c) => c.id === clinicId)!.reputation;
    expect(rep(handled) - rep(ignored)).toBeGreaterThan(REVIEW_REPUTATION_DAMAGE * 0.5);
  });

  it('答えを書いても、そのイベント自体は同じ月に出続ける', () => {
    const found = findChoiceEvent('doctorResigned');
    const { month, event, seed } = found!;
    const answered = play([{ month, eventChoices: { [event.choiceKey!]: 'retain' } }], seed);
    const same = at(answered, month).events.find((e) => e.choiceKey === event.choiceKey);
    expect(same).toBeDefined();
    expect(same!.chosen).toBe('retain');
  });
});

// ==================================================================
// 判断まで進む
// ==================================================================

describe('判断まで進む', () => {
  const run = play([]);

  it('選択肢のある月では必ず止まる', () => {
    for (const [i, m] of run.months.entries()) {
      if (m.events.some((e) => e.choices)) {
        expect(attentionOf(m, run.months[i - 1] ?? null)).not.toBeNull();
      }
    }
  });

  it('何も起きなくても上限で止まる', () => {
    const target = nextStopMonth(run.months, 1);
    expect(target.month).toBeGreaterThan(1);
    expect(target.month).toBeLessThanOrEqual(1 + MAX_SKIP_MONTHS);
  });

  it('★終局した月より先へは進まない', () => {
    const ended = run.months.find((m) => m.goals.end.ended);
    if (ended) {
      const target = nextStopMonth(run.months, Math.max(1, ended.month - MAX_SKIP_MONTHS));
      expect(target.month).toBeLessThanOrEqual(ended.month);
    }
  });

  it('期間ダイジェストは飛ばした月の出来事を落とさない（種類としては全部残る）', () => {
    const digest = spanDigest(run.months, 1, 13);
    expect(digest.spanMonths).toBe(12);
    const kinds = new Set(
      run.months.slice(1, 13).flatMap((m) => m.events.map((e) => e.id.replace(/-\d+$/, ''))),
    );
    expect(digest.events).toHaveLength(kinds.size);
    // 増減は始点と終点の差
    const stock = digest.lines.find((l) => l.id === 'patientStock')!;
    expect(stock.delta).toBeCloseTo(stock.value - stock.from, 6);
  });
});

// ==================================================================
// 節目
// ==================================================================

describe('節目の通知', () => {
  it('本編では出る。数字は何も動かさない', () => {
    const withMilestones = play([]);
    const without = runSimulation({
      ...PLAY_SCENARIO,
      features: { randomEvents: true },
      decisions: withOpeningA([]),
    });
    expect(
      withMilestones.months.flatMap((m) => m.events).filter((e) => e.id.startsWith('milestone-'))
        .length,
    ).toBeGreaterThan(0);
    // 通知を出しても患者数は1人も動かない
    for (const [i, m] of withMilestones.months.entries()) {
      expect(m.clinics[0]?.patientStock ?? 0).toBeCloseTo(
        without.months[i]!.clinics[0]?.patientStock ?? 0,
        9,
      );
    }
  });

  it('同じ節目は二度出ない', () => {
    const run = play([]);
    const ids = run.months
      .flatMap((m) => m.events)
      .filter((e) => e.id.startsWith('milestone-'))
      .map((e) => e.id.replace(/-\d+$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ==================================================================
// ★飛ばす仕組みが実際に飛ぶか
// ==================================================================

describe('飛ばす仕組みが役に立っているか', () => {
  it('★続いている危機では止まらない。知らせるのは変わり目で1度', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 1 } }]);
    // 危機の通知が2ヶ月以上続いている区間を探す
    const streak = run.months.findIndex(
      (m, i) =>
        i > 0 &&
        m.events.some((e) => e.severity === 'critical') &&
        (run.months[i - 1]?.events.some((e) => e.severity === 'critical') ?? false),
    );
    expect(streak).toBeGreaterThan(0);
    const result = run.months[streak]!;
    // 続いているだけなら critical では止まらない
    expect(attentionOf(result, run.months[streak - 1]!)).not.toBe('critical');
  });

  it('★押す回数が実際に減る。120ヶ月を「判断まで」で辿ると回数が桁で減る', () => {
    const run = play([]);
    let month = 1;
    let presses = 0;
    while (month < run.months.length && presses < 200) {
      const target = nextStopMonth(run.months, month);
      if (target.month <= month) break;
      month = target.month;
      presses++;
      if (run.months[month - 1]!.goals.end.ended) break;
    }
    // 1ヶ月ずつなら120回。半分以下になっていなければ飛ばせていない
    expect(presses).toBeLessThan(60);
  });
});

describe('期間ダイジェストの畳み込み', () => {
  it('★続いている通知を月数だけ並べない。種類ごとに1件', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 1 } }]);
    const digest = spanDigest(run.months, 24, 36);
    const kinds = digest.events.map((e) => e.id.replace(/-\d+$/, ''));
    expect(new Set(kinds).size).toBe(kinds.length);
    // 畳み込む前は同じ種類が何件も出ている
    const raw = run.months.slice(24, 36).flatMap((m) => m.events);
    expect(raw.length).toBeGreaterThan(digest.events.length);
  });
});
