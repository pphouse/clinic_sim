/**
 * ゴールデンテスト。**検証の起点はここ。**
 *
 * baseline.golden.json は表計算で検証した四半期40期分。刻みを1ヶ月に変えても
 * この JSON は書き換えていない（CLAUDE.md §1）。かわりに
 * **月次モデルを四半期に足し上げて、この検証データと突き合わせる。**
 * 実装から作り直した golden と実装を比べても、それは検証ではなく循環参照になる。
 *
 * 一致しない分は「刻みを細かくしたから見えるようになったもの」であって、
 * ズレてよい理由ではない。許容差は下の TOLERANCE に根拠付きで書く。
 */
import { describe, expect, it } from 'vitest';
import golden from './golden/baseline.golden.json';
import { MONTHS_PER_QUARTER, monthlyFromQuarterly } from '../src/constants';
import {
  calendarMonthOf,
  churnRateOf,
  monthLabel,
  nextReputation,
  quarterlyChurnRateOf,
  waitMinutesOf,
} from '../src/engine';
import { deriveGroupTotals } from '../src/derive';
import { runSimulation } from '../src/simulation';

const verified = golden.quarters;
const run = runSimulation();
const clinicIds = ['A', 'B', 'C'] as const;

/**
 * 許容差。**数字を合わせるために緩めない。** 緩めるなら理由をここに書く。
 *
 * 四半期モデルは1四半期に1度しか状態を評価しないので、期の途中で起きたことを
 * 均してしまう。既定シナリオでは B院・C院の開院月に、全社の必要看護師数が
 * 一段跳ね上がって A院の看護師が薄まる。四半期モデルはこの1ヶ月を平らにならしていた。
 * 月次で見るとその谷が出るので、開院直後の四半期だけ収益が下振れする。
 */
const TOLERANCE = {
  /** 期末の患者ストック。累積のズレを含めてこの範囲 */
  patientStockRatio: 0.025,
  /** 期末の評判 */
  reputationPoints: 2,
  /** 四半期合計の診療収入。開院直後の四半期がいちばん外れる */
  revenueRatio: 0.07,
  /** 期末の看護師在籍 */
  nurses: 0.1,
  /** 改定の累積。ここは刻みと無関係なので厳密に合う */
  feePointIndex: 0.001,
};

/** 四半期 q（1始まり）に含まれる月 */
function monthsOfQuarter(quarterIndex: number) {
  const start = (quarterIndex - 1) * MONTHS_PER_QUARTER;
  return run.months.slice(start, start + MONTHS_PER_QUARTER);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const clinicOf = (result: (typeof run.months)[number], id: string) =>
  result.clinics.find((c) => c.id === id)!;

describe('中核エンジンの単体挙動', () => {
  it('稼働率1以下では待ち時間は基準値のまま', () => {
    expect(waitMinutesOf(0.62)).toBeCloseTo(15, 5);
    expect(waitMinutesOf(1.0)).toBeCloseTo(15, 5);
  });

  it('稼働率が1を超えると待ち時間が急伸する', () => {
    // 稼働率は無次元なので、刻みを月にしてもこの曲線は変わらない
    expect(waitMinutesOf(1.4069)).toBeCloseTo(35.22, 1);
    expect(waitMinutesOf(1.6592)).toBeCloseTo(53.19, 1);
  });

  it('離脱率は3ヶ月複利で検証モデルの四半期離脱率に戻る', () => {
    for (const wait of [15, 20, 30, 53.19]) {
      const monthly = churnRateOf(wait);
      const compounded = 1 - Math.pow(1 - monthly, MONTHS_PER_QUARTER);
      expect(compounded, `待ち時間 ${wait} 分`).toBeCloseTo(quarterlyChurnRateOf(wait), 10);
    }
  });

  it('許容待ち時間以内なら離脱率は基礎値（月あたり1.35%）', () => {
    expect(churnRateOf(15)).toBeCloseTo(monthlyFromQuarterly(0.04), 10);
    expect(churnRateOf(20)).toBeCloseTo(monthlyFromQuarterly(0.04), 10);
    expect(churnRateOf(30)).toBeCloseTo(monthlyFromQuarterly(0.065), 10);
  });

  it('評判は落ちるのが速く、戻るのが遅い（非対称性）', () => {
    // 1ヶ月で削られる量は 3ヶ月ぶんの 1/3。回帰は複利で 1/3
    const damaged = nextReputation(75, 53.19);
    expect(damaged).toBeLessThan(70);
    let r = damaged;
    for (let i = 0; i < 12; i++) r = nextReputation(r, 15);
    expect(r).toBeLessThan(75); // 1年かけても戻りきらない
  });

  it('月ラベルは4月始まり。改定は必ず4月に来る', () => {
    expect(monthLabel(1)).toBe('1年目 4月');
    expect(monthLabel(10)).toBe('1年目 1月');
    expect(monthLabel(13)).toBe('2年目 4月');
    expect(monthLabel(120)).toBe('10年目 3月');
    for (const m of [13, 37, 61, 85, 109]) expect(calendarMonthOf(m)).toBe(4);
  });
});

describe('検証データとの突き合わせ（月次を四半期に足し上げる）', () => {
  it('120ヶ月＝40四半期ぶん回っている', () => {
    expect(run.months).toHaveLength(verified.length * MONTHS_PER_QUARTER);
  });

  it('常勤医の配置が一致する', () => {
    for (let i = 0; i < verified.length; i++) {
      const last = monthsOfQuarter(i + 1)[MONTHS_PER_QUARTER - 1]!;
      for (const id of clinicIds) {
        expect(last.staff.doctorsByClinic[id], `Q${i + 1} ${id}院`).toBe(verified[i]!.doctors[id]);
      }
    }
  });

  it('期末の看護師在籍と医局関係値が一致する', () => {
    for (let i = 0; i < verified.length; i++) {
      const last = monthsOfQuarter(i + 1)[MONTHS_PER_QUARTER - 1]!;
      expect(
        Math.abs(last.staff.nurses - verified[i]!.nurses),
        `Q${i + 1} 看護師 実装${last.staff.nurses} / 検証${verified[i]!.nurses}`,
      ).toBeLessThanOrEqual(TOLERANCE.nurses);
      expect(last.staff.igyokuRelation, `Q${i + 1} 医局関係値`).toBe(verified[i]!.igyokuRelation);
    }
  });

  it('改定の累積は刻みと無関係なので厳密に一致する', () => {
    for (let i = 0; i < verified.length; i++) {
      const last = monthsOfQuarter(i + 1)[MONTHS_PER_QUARTER - 1]!;
      expect(
        Math.abs(last.fee.feePointIndex - verified[i]!.feePointIndex),
        `Q${i + 1} 点数指数`,
      ).toBeLessThanOrEqual(TOLERANCE.feePointIndex);
    }
  });

  it('期末の患者ストックが検証値の 2.5% 以内に収まる', () => {
    for (let i = 0; i < verified.length; i++) {
      const last = monthsOfQuarter(i + 1)[MONTHS_PER_QUARTER - 1]!;
      for (const id of clinicIds) {
        const expected = verified[i]!.clinics[id].patientStock;
        if (expected === 0) continue;
        const actual = clinicOf(last, id).patientStock;
        expect(
          Math.abs(actual - expected) / expected,
          `Q${i + 1} ${id}院 患者ストック 実装${actual.toFixed(0)} / 検証${expected}`,
        ).toBeLessThanOrEqual(TOLERANCE.patientStockRatio);
      }
    }
  });

  it('期末の評判が検証値の 2pt 以内に収まる', () => {
    for (let i = 0; i < verified.length; i++) {
      const last = monthsOfQuarter(i + 1)[MONTHS_PER_QUARTER - 1]!;
      for (const id of clinicIds) {
        if (verified[i]!.clinics[id].capacity === 0) continue;
        const actual = clinicOf(last, id).reputation;
        expect(
          Math.abs(actual - verified[i]!.clinics[id].reputation),
          `Q${i + 1} ${id}院 評判 実装${actual.toFixed(1)} / 検証${verified[i]!.clinics[id].reputation}`,
        ).toBeLessThanOrEqual(TOLERANCE.reputationPoints);
      }
    }
  });

  it('四半期に足し上げた診療収入が検証値の 7% 以内に収まる', () => {
    for (let i = 0; i < verified.length; i++) {
      const window = monthsOfQuarter(i + 1);
      const totals = window.map(deriveGroupTotals);
      const actual = sum(totals.map((t) => t.clinicRevenue));
      // 検証データの revenue は学費込みなので、学費を引いて診療収入だけにする
      const expected = verified[i]!.group.revenue - sum(totals.map((t) => t.tuitionRevenue));
      if (expected <= 0) continue;
      expect(
        Math.abs(actual - expected) / expected,
        `Q${i + 1} 診療収入 実装${actual.toFixed(0)} / 検証${expected.toFixed(0)}`,
      ).toBeLessThanOrEqual(TOLERANCE.revenueRatio);
    }
  });

  it('学費収入は四半期に足すと検証値と厳密に一致する（在学年数で決まるだけなので）', () => {
    for (let i = 0; i < verified.length; i++) {
      // 期待値は検証データだけから作る。実装の数字を引き算に混ぜない
      const q = verified[i]!;
      const verifiedClinicRevenue = sum(
        clinicIds.map((id) => q.clinics[id].insuranceRevenue + q.clinics[id].selfPayRevenue),
      );
      const expectedTuition = q.group.revenue - verifiedClinicRevenue;
      const actual = sum(monthsOfQuarter(i + 1).map((t) => deriveGroupTotals(t).tuitionRevenue));
      expect(actual, `Q${i + 1} 学費`).toBeCloseTo(expectedTuition, 1);
    }
  });
});

describe('検証済みの設計上の性質（回帰防止）', () => {
  const a = run.months.map((t) => clinicOf(t, 'A'));

  it('待ち時間のピークは B院の開院月。四半期モデルが均していた谷が見える', () => {
    const peak = a.reduce((best, c, i) => (c.waitMinutes > a[best]!.waitMinutes ? i : best), 0) + 1;
    // 19ヶ月目 = B院の開院月。全社の必要看護師数が跳ね、A院の看護師が薄まる
    expect(peak).toBe(19);
    expect(a[18]!.waitMinutes).toBeGreaterThan(60);
  });

  it('患者ストックの底は平坦な谷。医師が抜けてから1年半あたりで底を打つ', () => {
    const window = a.slice(12, 60);
    const min = Math.min(...window.map((c) => c.patientStock));
    const plateau = window
      .map((c, i) => ({ month: i + 13, stock: c.patientStock }))
      .filter((x) => x.stock < min * 1.002)
      .map((x) => x.month);
    expect(plateau[0]).toBe(32);
    expect(plateau[plateau.length - 1]).toBe(38);
    // 検証モデルの底（Q11＝31〜33ヶ月目）がこの谷の中に入っている
    expect(plateau).toContain(32);
    expect(plateau).toContain(33);
  });

  it('待ち時間のピークから患者ストックの底まで、およそ1年かかる', () => {
    const peak = a.reduce((best, c, i) => (c.waitMinutes > a[best]!.waitMinutes ? i : best), 0) + 1;
    const window = a.slice(12, 60);
    const min = Math.min(...window.map((c) => c.patientStock));
    const troughStart =
      window.findIndex((c) => c.patientStock < min * 1.002) + 13;
    expect(troughStart - peak).toBeGreaterThanOrEqual(12);
    expect(troughStart - peak).toBeLessThanOrEqual(15);
  });

  it('評判の最低値は検証値（41.4）の 1pt 以内', () => {
    const worst = Math.min(...a.map((c) => c.reputation));
    expect(Math.abs(worst - 41.4)).toBeLessThan(1);
  });

  it('1年の医師不足は5年経っても完全には回復しない', () => {
    // 12ヶ月目（医師が抜ける直前） vs 72ヶ月目
    expect(a[71]!.patientStock).toBeLessThan(a[11]!.patientStock);
  });
});
