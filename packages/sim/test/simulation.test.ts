/**
 * 月次モデルの回帰防止。
 *
 * 検証データとの突き合わせは golden.test.ts の仕事。ここは
 * **実装から固定した baseline.monthly.json との一致**を見る。
 * こちらは検証の起点ではなく、意図しない変更を検出するためのロック。
 */
import { describe, expect, it } from 'vitest';
import locked from './golden/baseline.monthly.json';
import { assertBalanced } from '../src/accounting';
import {
  REPUTATION_STARS_MIN,
  addonLapseMonths,
  clinicSummaries,
  congestionOf,
  deriveGroupTotals,
  groupSummary,
  reputationStars,
} from '../src/derive';
import { CRITICAL_WAIT_MINUTES } from '../src/events';
import { TOLERABLE_WAIT_MINUTES } from '../src/constants';
import { INITIAL_CASH, TOTAL_MONTHS } from '../src/constants';
import { BASELINE_SCENARIO, PLAY_SCENARIO } from '../src/scenario';
import { churnRateOf, quarterlyChurnRateOf } from '../src/engine';
import { runSimulation } from '../src/simulation';

const expected = locked.months;
const run = runSimulation();
const clinicIds = ['A', 'B', 'C'] as const;

/** baseline.monthly.json の丸め粒度 */
const MONEY = 0.01;
const RATE = 0.0001;

function close(actual: number, want: number, tolerance: number, label: string): void {
  expect(Math.abs(actual - want), `${label}: 実装 ${actual} / ロック ${want}`).toBeLessThanOrEqual(
    tolerance,
  );
}

describe('120ヶ月が最後まで回る', () => {
  it('意思決定だけを入力に、10年ぶんの結果が出る', () => {
    expect(run.months).toHaveLength(TOTAL_MONTHS);
    expect(run.months).toHaveLength(BASELINE_SCENARIO.totalMonths);
    expect(run.months[0]!.label).toBe('1年目 4月');
    expect(run.months[119]!.label).toBe('10年目 3月');
  });

  it('同じシナリオを2回回すと完全に同じ結果になる（決定性）', () => {
    expect(JSON.stringify(runSimulation())).toBe(JSON.stringify(runSimulation()));
  });
});

describe('ロックとの一致', () => {
  it('人材が一致する', () => {
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!;
      const staff = run.months[i]!.staff;
      for (const id of clinicIds) {
        expect(staff.doctorsByClinic[id], `${want.m}ヶ月目 ${id}院の常勤医`).toBe(want.doctors[id]);
      }
      close(staff.nurses, want.nurses, MONEY, `${want.m}ヶ月目 看護師`);
      close(staff.nurseSufficiency, want.nurseSufficiency, RATE, `${want.m}ヶ月目 充足率`);
      expect(staff.igyokuRelation, `${want.m}ヶ月目 医局関係値`).toBe(want.igyokuRelation);
    }
  });

  it('診療報酬が一致する', () => {
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!;
      const fee = run.months[i]!.fee;
      close(fee.feePointIndex, want.feePointIndex, RATE, `${want.m}ヶ月目 点数指数`);
      close(fee.addonTotal, want.addonTotal, RATE, `${want.m}ヶ月目 加算合計`);
      close(fee.effectiveFeeIndex, want.effectiveFeeIndex, RATE, `${want.m}ヶ月目 実効点数指数`);
    }
  });

  for (const id of clinicIds) {
    it(`${id}院の120ヶ月が一致する`, () => {
      for (let i = 0; i < expected.length; i++) {
        const want = expected[i]!.clinics[id];
        const actual = run.months[i]!.clinics.find((c) => c.id === id)!;
        const at = `${id}院 ${expected[i]!.m}ヶ月目`;
        close(actual.patientStock, want.patientStock, MONEY, `${at} 患者ストック`);
        close(actual.waitMinutes, want.waitMinutes, MONEY, `${at} 待ち時間`);
        close(actual.reputation, want.reputation, MONEY, `${at} 評判`);
        close(actual.utilization, want.utilization, RATE, `${at} 稼働率`);
        close(actual.insuranceRevenue, want.insuranceRevenue, MONEY, `${at} 保険収入`);
        close(actual.operatingIncome, want.operatingIncome, MONEY, `${at} 営業利益`);
      }
    });
  }

  it('全社の資金繰りが一致する', () => {
    let verificationCash = INITIAL_CASH;
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!.group;
      const t = deriveGroupTotals(run.months[i]!);
      const at = `${expected[i]!.m}ヶ月目`;
      close(t.clinicRevenue + t.tuitionRevenue, want.revenue, MONEY, `${at} 収益`);
      close(t.operatingIncome, want.operatingIncome, MONEY, `${at} 営業利益`);
      close(t.hqCost, want.hqCost, MONEY, `${at} 本部費`);
      close(t.capex, want.capex, MONEY, `${at} 投資`);
      close(t.interest, want.interest, MONEY, `${at} 支払利息`);
      close(t.principalRepaid, want.principalRepaid, MONEY, `${at} 元金返済`);
      // 検証モデル基準（未収金と税金を無視した見方）の現金
      verificationCash +=
        t.operatingIncome - t.hqCost + t.newBorrowing - t.capex - t.interest - t.principalRepaid;
      close(verificationCash, want.verificationCash, MONEY, `${at} 現金（検証モデル基準）`);
    }
  });

  it('三表が一致する', () => {
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!.balanceSheet;
      const bs = run.months[i]!.financials.balanceSheet;
      const at = `${expected[i]!.m}ヶ月目`;
      close(bs.cash, want.cash, MONEY, `${at} 現金`);
      close(bs.accountsReceivable, want.accountsReceivable, MONEY, `${at} 未収金`);
      close(bs.fixedAssets, want.fixedAssets, MONEY, `${at} 固定資産`);
      close(bs.totalEquity, want.totalEquity, MONEY, `${at} 純資産`);
    }
  });
});

describe('月刻みで見えるようになったもの', () => {
  it('看護師は毎月 0.4 人しか採れない。四半期モデルの 1.2 人が3回に割れている', () => {
    const hiring = run.months.filter((t) => t.staff.nursesFromMarket > 0);
    expect(hiring.length).toBeGreaterThan(20);
    expect(Math.max(...hiring.map((t) => t.staff.nursesFromMarket))).toBeCloseTo(0.4, 10);
  });

  it('自校の卒業生は年1回まとめて入る。開校の3年後から', () => {
    const graduations = run.months
      .filter((t) => t.staff.nursesFromSchool > 0)
      .map((t) => t.month);
    // 13ヶ月目に開校 → 49ヶ月目が最初の卒業。以降は毎年
    expect(graduations).toEqual([49, 61, 73, 85, 97, 109]);
    expect(run.months[48]!.staff.nursesFromSchool).toBeCloseTo(11.9, 10);
  });

  it('学費は開校から3年かけて 200 → 400 → 600 万円/月に増える', () => {
    const tuition = (month: number) =>
      deriveGroupTotals(run.months[month - 1]!).tuitionRevenue;
    expect(tuition(12)).toBe(0);
    expect(tuition(13)).toBeCloseTo(200, 6);
    expect(tuition(25)).toBeCloseTo(400, 6);
    expect(tuition(37)).toBeCloseTo(600, 6);
    expect(tuition(120)).toBeCloseTo(600, 6);
  });

  it('加算の要件割れは月単位で判定される', () => {
    const lapsed = addonLapseMonths(run.months);
    expect(lapsed.length).toBeGreaterThan(0);
    // 機能強化加算は 7ヶ月目に取得、13ヶ月目に医師が抜けて落ちる
    expect(lapsed[0]).toBe(13);
  });

  it('加算は5つ揃うと +19%', () => {
    const last = run.months[119]!.fee;
    expect(last.addons.every((a) => a.acquired && a.active)).toBe(true);
    expect(last.addonTotal).toBeCloseTo(0.19, 10);
  });

  it('捌けなかった需要は翌月に繰り越さない', () => {
    for (const t of run.months) {
      for (const c of t.clinics) {
        expect(c.visitsServed).toBeLessThanOrEqual(c.effectiveCapacity + 1e-9);
        expect(c.visitsServed).toBeLessThanOrEqual(c.demandVisits + 1e-9);
      }
    }
  });
});

describe('評判の星', () => {
  it('評判の下限がちょうど星1、上限が星5になる', () => {
    expect(REPUTATION_STARS_MIN).toBe(1);
    expect(reputationStars(100)).toBe(5);
    expect(reputationStars(75)).toBeCloseTo(3.75, 10);
  });

  it('既定シナリオの星は 1〜5 の外に出ない', () => {
    for (const t of run.months) {
      for (const c of t.clinics) {
        if (c.capacity === 0 && c.patientStock === 0) continue;
        const stars = reputationStars(c.reputation);
        expect(stars, `${t.month}ヶ月目 ${c.id}院`).toBeGreaterThanOrEqual(1);
        expect(stars, `${t.month}ヶ月目 ${c.id}院`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('医師不足の底では星2台まで落ちる', () => {
    const worst = Math.min(
      ...run.months.map((t) => reputationStars(t.clinics.find((c) => c.id === 'A')!.reputation)),
    );
    expect(worst).toBeGreaterThan(2);
    expect(worst).toBeLessThan(2.1);
  });
});

describe('マップが読む値', () => {
  it('混雑は許容と危機のしきい値で3段階に分かれる', () => {
    expect(congestionOf(TOLERABLE_WAIT_MINUTES)).toBe('calm');
    expect(congestionOf(TOLERABLE_WAIT_MINUTES + 0.1)).toBe('warning');
    expect(congestionOf(CRITICAL_WAIT_MINUTES)).toBe('critical');
  });

  it('未開院の院は open=false で、開院月を持つ', () => {
    const first = clinicSummaries(run.months[0]!);
    expect(first.find((c) => c.id === 'A')!.open).toBe(true);
    const b = first.find((c) => c.id === 'B')!;
    expect(b.open).toBe(false);
    expect(b.openMonth).toBe(19);
    // 開院した月からは open になる
    expect(clinicSummaries(run.months[18]!).find((c) => c.id === 'B')!.open).toBe(true);
  });

  it('待ち時間のピーク月、A院だけが危機になる', () => {
    const peak = clinicSummaries(run.months[18]!);
    expect(peak.find((c) => c.id === 'A')!.congestion).toBe('critical');
    expect(peak.find((c) => c.id === 'B')!.congestion).toBe('calm');
  });

  it('通知は院に紐づく。id 文字列から推測しない', () => {
    const peak = clinicSummaries(run.months[18]!);
    expect(peak.find((c) => c.id === 'A')!.eventCount).toBeGreaterThan(0);
    expect(peak.find((c) => c.id === 'C')!.eventCount).toBe(0);
  });

  it('全社サマリは現金を持つ。マップが資金ショートに気づく場所だから', () => {
    const shortage = run.months.find((t) => t.financials.balanceSheet.cash < 0)!;
    const summary = groupSummary(shortage, run.months[shortage.month - 2] ?? null);
    expect(summary.cash).toBeLessThan(0);
    expect(summary.patientStock).toBeGreaterThan(0);
  });
});

describe('通知イベント', () => {
  it('待ち時間のピーク月には危機イベントが出る', () => {
    const events = run.months[18]!.events;
    expect(events.some((e) => e.severity === 'critical' && e.screen === 'clinic')).toBe(true);
  });

  it('改定は起きた月にだけ通知される（予告しない）', () => {
    const revisionMonths = run.months
      .filter((t) => t.events.some((e) => e.id.startsWith('fee-revision-')))
      .map((t) => t.month);
    expect(revisionMonths).toEqual([13, 37, 61, 85, 109]);
  });

  it('卒業生の入職は通知される', () => {
    expect(run.months[48]!.events.some((e) => e.id.startsWith('school-graduation-'))).toBe(true);
  });
});

describe('会計の不変条件', () => {
  it('120ヶ月すべてで貸借が一致する', () => {
    for (const t of run.months) {
      expect(() => assertBalanced(t.financials.balanceSheet), `${t.month}ヶ月目`).not.toThrow();
    }
  });

  it('未収金は保険診療収入の2ヶ月ぶん', () => {
    for (const t of run.months) {
      const bs = t.financials.balanceSheet;
      close(
        bs.accountsReceivable,
        t.financials.incomeStatement.insuranceRevenue * 2,
        1e-9,
        `${t.month}ヶ月目 医業未収金`,
      );
    }
  });

  it('固定資産は取得の翌月から償却が始まる', () => {
    // 1ヶ月目に A院を 6,000 万で取得。医療機器 3,600/60ヶ月 ＋ 内装 2,400/120ヶ月
    expect(run.months[0]!.financials.incomeStatement.depreciation).toBe(0);
    close(run.months[1]!.financials.incomeStatement.depreciation, 80, 1e-9, '2ヶ月目 減価償却費');
  });

  it('看護学校の 2.5 億は費用ではなく校舎という資産になる', () => {
    const opening = run.months[12]!.financials.balanceSheet;
    close(opening.fixedAssetsByClass.building, 25000, 1e-9, '13ヶ月目 校舎の簿価');
    const before = run.months[11]!.financials.balanceSheet;
    expect(before.totalEquity - opening.totalEquity).toBeLessThan(25000);
  });

  /**
   * ★既定シナリオは 34ヶ月目に債務超過へ入る。
   * 四半期モデルで Q12（＝34〜36ヶ月目）だったのと一致する。刻みを変えても結論は動かない。
   */
  it('既定シナリオが債務超過に入るのは34ヶ月目', () => {
    const first = run.months.find((t) => t.financials.balanceSheet.totalEquity < 0);
    expect(first?.month).toBe(34);
  });

  it('資金ショートと債務超過は別々に判定される', () => {
    const shortage = run.months.find((t) => t.financials.balanceSheet.cash < 0)!;
    expect(shortage.month).toBeLessThan(34);
    expect(shortage.financials.balanceSheet.totalEquity).toBeGreaterThan(0);
  });
});

// ==================================================================
// 極端な待ち時間でも壊れない
// ==================================================================

describe('離脱率の上限', () => {
  it('★四半期離脱率は 1 で止まる。超えると患者数が NaN になる', () => {
    // 1 を超える入力（待ち時間 568 分）。(1-r) が負になり立方根が NaN を返す
    expect(quarterlyChurnRateOf(568)).toBe(1);
    expect(churnRateOf(568)).toBe(1);
    expect(Number.isNaN(churnRateOf(568))).toBe(false);
  });

  it('検証モデルの範囲（最大 53 分）には届かない。結果は動かない', () => {
    expect(quarterlyChurnRateOf(53)).toBeLessThan(0.2);
  });

  it('通院頻度の高い科で医師が足りなくても患者数が数のまま', () => {
    const run = runSimulation({
      ...PLAY_SCENARIO,
      features: {},
      decisions: [
        { month: 1, doctorsByClinic: { A: 3 } },
        // 承継1,800人を整形外科（通院頻度1.8倍）で受けて医師1名。待ち時間が爆発する
        { month: 13, openClinic: 'D', openSpecialty: 'seikei', doctorsByClinic: { D: 1 } },
      ],
    });
    for (const m of run.months) {
      for (const c of m.clinics) {
        expect(Number.isFinite(c.patientStock), `${m.month}ヶ月目 ${c.id}院`).toBe(true);
        expect(Number.isFinite(c.waitMinutes)).toBe(true);
      }
      expect(Number.isFinite(m.financials.balanceSheet.totalAssets)).toBe(true);
    }
  });
});
