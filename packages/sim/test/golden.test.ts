/**
 * ゴールデンテスト。
 *
 * baseline.golden.json は検証済みのシミュレーション結果 40 四半期分。
 * このテストが赤いまま先へ進まない。JSON を実装に合わせて書き換えるのは禁止（CLAUDE.md §1）。
 */
import { describe, expect, it } from 'vitest';
import golden from './golden/baseline.golden.json';
import { CLINICS } from '../src/constants';
import { tickClinic, waitMinutesOf, nextReputation, churnRateOf, quarterLabel } from '../src/engine';

type Golden = typeof golden;
const quarters = golden.quarters as Golden['quarters'];

describe('中核エンジンの単体挙動', () => {
  it('稼働率1以下では待ち時間は基準値のまま', () => {
    expect(waitMinutesOf(0.62)).toBeCloseTo(15, 5);
    expect(waitMinutesOf(1.0)).toBeCloseTo(15, 5);
  });

  it('稼働率が1を超えると待ち時間が急伸する', () => {
    expect(waitMinutesOf(1.41)).toBeCloseTo(35.2, 1);
    expect(waitMinutesOf(1.66)).toBeCloseTo(53.2, 1);
  });

  it('評判は落ちるのが速く、戻るのが遅い（非対称性）', () => {
    const damaged = nextReputation(75, 53.19);
    expect(damaged).toBeLessThan(56);            // 1四半期で 20pt 近く落ちる
    let r = damaged;
    for (let i = 0; i < 4; i++) r = nextReputation(r, 15);
    expect(r).toBeLessThan(70);                  // 4四半期かけても戻りきらない
  });

  it('許容待ち時間以内なら離脱率は基礎値', () => {
    expect(churnRateOf(15)).toBeCloseTo(0.04, 6);
    expect(churnRateOf(20)).toBeCloseTo(0.04, 6);
    expect(churnRateOf(30)).toBeCloseTo(0.065, 6);
  });

  it('四半期ラベル', () => {
    expect(quarterLabel(1)).toBe('Y1Q1');
    expect(quarterLabel(7)).toBe('Y2Q3');
    expect(quarterLabel(40)).toBe('Y10Q4');
  });
});

describe('ゴールデン：診療所の四半期tick', () => {
  const configById = Object.fromEntries(CLINICS.map((c) => [c.id, c]));

  for (const clinicId of ['A', 'B', 'C'] as const) {
    it(`${clinicId}院の40四半期がエクセルと一致する`, () => {
      for (let i = 0; i < quarters.length; i++) {
        const q = quarters[i];
        const expected = q.clinics[clinicId];
        if (expected.capacity === 0) continue; // 未開院

        const prev = i === 0 ? null : quarters[i - 1].clinics[clinicId];
        const actual = tickClinic({
          config: configById[clinicId],
          quarter: q.q,
          previousStock: prev ? prev.patientStock : 0,
          previousReputation: prev && prev.reputation ? prev.reputation : 75,
          doctors: q.doctors[clinicId],
          nurseSufficiency: q.nurseSufficiency,
          allocatedNurses: q.nurses * (q.doctors[clinicId] / Math.max(1, q.doctors.A + q.doctors.B + q.doctors.C)),
          effectiveFeeIndex: q.effectiveFeeIndex,
        });

        expect(actual.waitMinutes, `${clinicId}院 Q${q.q} 待ち時間`).toBeCloseTo(expected.waitMinutes, 1);
        expect(actual.patientStock, `${clinicId}院 Q${q.q} 患者ストック`).toBeCloseTo(expected.patientStock, 0);
        expect(actual.reputation, `${clinicId}院 Q${q.q} 評判`).toBeCloseTo(expected.reputation, 1);
        expect(actual.insuranceRevenue, `${clinicId}院 Q${q.q} 保険収入`).toBeCloseTo(expected.insuranceRevenue, 0);
      }
    });
  }
});

describe('検証済みの設計上の性質（回帰防止）', () => {
  const a = quarters.map((q) => q.clinics.A);

  it('待ち時間のピークはQ7、患者ストックの底はQ11。遅延は4四半期', () => {
    const peakWaitQ = a.reduce((best, c, i) => (c.waitMinutes > a[best].waitMinutes ? i : best), 0) + 1;
    const window = a.slice(4, 20);
    const troughQ = window.reduce((best, c, i) => (c.patientStock < window[best].patientStock ? i : best), 0) + 5;
    expect(peakWaitQ).toBe(7);
    expect(troughQ).toBe(11);
    expect(troughQ - peakWaitQ).toBe(4);
  });

  it('4四半期の医師不足は20四半期経っても完全には回復しない', () => {
    const beforeCrisis = a[3].patientStock;  // Q4
    const longAfter = a[23].patientStock;    // Q24
    expect(longAfter).toBeLessThan(beforeCrisis);
  });
});
