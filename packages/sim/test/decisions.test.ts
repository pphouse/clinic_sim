/**
 * 判断の密度の検証。docs/spec/08-decisions.md
 *
 * ★この層は検証されていない。だからここでも最重要は
 * 「**既定シナリオが1ミリも動かないこと**」で、それ自体を最初に検証する。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  PLAY_SCENARIO,
  REVIEW_REPUTATION_DAMAGE,
  RETAIN_DOCTOR_COST,
  chosenChoiceOf,
  eventKeyOf,
  monthDigest,
  runSimulation,
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
// ★月は1つずつ進む
// ==================================================================

describe('月をまとめて飛ばす道は無い', () => {
  const run = play([]);

  it('★選択を迫るイベントは、その月のダイジェストに必ず載る', () => {
    // 飛ばす仕組みを外したので、拾い損ねる月が構造的に存在しない。
    // ダイジェストは1ヶ月ぶんで、その月の出来事をそのまま持つ
    for (const [i, m] of run.months.entries()) {
      if (!m.events.some((e) => e.choices)) continue;
      const digest = monthDigest(m, run.months[i - 1] ?? null);
      expect(digest.spanMonths).toBe(1);
      expect(digest.events.filter((e) => e.choices)).toHaveLength(
        m.events.filter((e) => e.choices).length,
      );
    }
  });

  it('ダイジェストの増減は前月との差', () => {
    const digest = monthDigest(run.months[23]!, run.months[22]!);
    expect(digest.spanMonths).toBe(1);
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
