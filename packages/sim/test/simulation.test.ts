/**
 * ゴールデンテスト（全社）。
 *
 * golden.test.ts は「golden の入力を与えたら診療所 tick が一致するか」を見る。
 * こちらは **シム核が自分で 40 四半期を回した結果** が golden と一致するかを見る。
 * 人材・診療報酬・会計まで含めて、入力は BASELINE_SCENARIO の意思決定だけ。
 *
 * baseline.golden.json は小数2桁で丸められている。だから許容差は
 * 丸めの粒度そのもの（0.01）に置く。ここを緩めると実装のズレが隠れる。
 */
import { describe, expect, it } from 'vitest';
import golden from './golden/baseline.golden.json';
import { assertBalanced } from '../src/accounting';
import { addonLapseQuarters, deriveGroupTotals } from '../src/derive';
import { FEE_REVISIONS, INITIAL_CASH } from '../src/constants';
import { quarterMonthsLabel } from '../src/engine';
import { BASELINE_SCENARIO } from '../src/scenario';
import { runSimulation } from '../src/simulation';

const quarters = golden.quarters;
const run = runSimulation();
const clinicIds = ['A', 'B', 'C'] as const;

/** golden の丸め粒度 */
const MONEY = 0.01;
const RATE_4DP = 0.0001;
const INDEX_3DP = 0.001;

function close(actual: number, expected: number, tolerance: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: 実装 ${actual} / golden ${expected}`).toBeLessThanOrEqual(
    tolerance,
  );
}

describe('40四半期が最後まで回る', () => {
  it('意思決定だけを入力に、40四半期ぶんの結果が出る', () => {
    expect(run.quarters).toHaveLength(BASELINE_SCENARIO.totalQuarters);
    expect(run.quarters[0]!.label).toBe('Y1Q1');
    expect(run.quarters[39]!.label).toBe('Y10Q4');
  });

  it('画面に出すラベルは月表記。年度は4月始まりで、改定は必ず4月に来る', () => {
    expect(quarterMonthsLabel(1)).toBe('1年目 4〜6月');
    expect(quarterMonthsLabel(7)).toBe('2年目 10〜12月');
    expect(quarterMonthsLabel(40)).toBe('10年目 1〜3月');
    // 既定シナリオの改定は全て年度の第1四半期＝4月に施行される
    for (const revision of FEE_REVISIONS) {
      expect(
        quarterMonthsLabel(revision.effectiveQuarter),
        `${revision.name} の施行月`,
      ).toContain('4〜6月');
    }
  });

  it('同じシナリオを2回回すと完全に同じ結果になる（決定性）', () => {
    expect(JSON.stringify(runSimulation())).toBe(JSON.stringify(runSimulation()));
  });
});

describe('ゴールデン：人材', () => {
  it('常勤医の配置が一致する', () => {
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const staff = run.quarters[i]!.staff;
      for (const id of clinicIds) {
        expect(staff.doctorsByClinic[id], `Q${g.q} ${id}院の常勤医`).toBe(g.doctors[id]);
      }
    }
  });

  it('看護師の在籍・必要数・充足率が一致する', () => {
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const staff = run.quarters[i]!.staff;
      close(staff.nurses, g.nurses, MONEY, `Q${g.q} 看護師在籍`);
      close(staff.nursesRequired, g.nursesRequired, MONEY, `Q${g.q} 必要看護師`);
      close(staff.nurseSufficiency, g.nurseSufficiency, RATE_4DP, `Q${g.q} 看護師充足率`);
    }
  });

  it('医局関係値が一致し、調達枠を割らない', () => {
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const staff = run.quarters[i]!.staff;
      expect(staff.igyokuRelation, `Q${g.q} 医局関係値`).toBe(g.igyokuRelation);
      expect(staff.doctorShortfall, `Q${g.q} 医師の調達枠`).toBe(false);
    }
  });

  it('自校の卒業生は開校の3年後から、毎年まとまって入る', () => {
    const graduationQuarters = run.quarters
      .filter((q) => q.staff.nursesFromSchool > 0)
      .map((q) => q.quarter);
    // Q5 開校 → Q17 が最初の卒業。以降は毎年
    expect(graduationQuarters).toEqual([17, 21, 25, 29, 33, 37]);
    close(run.quarters[16]!.staff.nursesFromSchool, 11.9, 1e-9, '1学年の入職者');
  });
});

describe('ゴールデン：診療報酬', () => {
  it('改定の累積と加算の合計が一致する', () => {
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const fee = run.quarters[i]!.fee;
      close(fee.feePointIndex, g.feePointIndex, INDEX_3DP, `Q${g.q} 点数指数`);
      close(fee.addonTotal, g.addonTotal, 1e-9, `Q${g.q} 加算合計`);
      close(fee.effectiveFeeIndex, g.effectiveFeeIndex, INDEX_3DP, `Q${g.q} 実効点数指数`);
    }
  });

  it('要件割れによる加算の失効は通算8四半期（検証済み）', () => {
    expect(addonLapseQuarters(run.quarters)).toEqual([5, 6, 7, 9, 10, 15, 31, 32]);
  });

  it('取得したが一度も要件を満たしていない加算は「失効」ではない', () => {
    // 在宅療養支援加算は Q9 に取得したが、常勤医5名が揃う Q17 まで有効にならない
    const zaitaku = (i: number) => run.quarters[i]!.fee.addons.find((a) => a.id === 'zaitaku')!;
    expect(zaitaku(8).acquired).toBe(true);
    expect(zaitaku(8).active).toBe(false);
    expect(zaitaku(8).lapsedByRequirement).toBe(true);
    expect(addonLapseQuarters(run.quarters)).not.toContain(11);
    expect(zaitaku(16).active).toBe(true);
  });

  it('加算は5つ揃うと +19%。改定#3の -5% を打ち消す', () => {
    const last = run.quarters[39]!.fee;
    expect(last.addons.every((a) => a.acquired && a.active)).toBe(true);
    close(last.addonTotal, 0.19, 1e-9, '加算の合計率');
  });
});

describe('ゴールデン：診療所の40四半期（シム核が自走した結果）', () => {
  for (const id of clinicIds) {
    it(`${id}院がエクセルと一致する`, () => {
      for (let i = 0; i < quarters.length; i++) {
        const g = quarters[i]!;
        const expected = g.clinics[id];
        const actual = run.quarters[i]!.clinics.find((c) => c.id === id)!;
        close(actual.patientStock, expected.patientStock, MONEY, `${id}院 Q${g.q} 患者ストック`);
        close(actual.waitMinutes, expected.waitMinutes, MONEY, `${id}院 Q${g.q} 待ち時間`);
        close(actual.reputation, expected.reputation, MONEY, `${id}院 Q${g.q} 評判`);
        close(actual.utilization, expected.utilization, RATE_4DP, `${id}院 Q${g.q} 稼働率`);
        close(actual.insuranceRevenue, expected.insuranceRevenue, MONEY, `${id}院 Q${g.q} 保険収入`);
        close(actual.selfPayRevenue, expected.selfPayRevenue, MONEY, `${id}院 Q${g.q} 自費収入`);
        close(actual.operatingCost, expected.operatingCost, MONEY, `${id}院 Q${g.q} 営業費用`);
        close(actual.operatingIncome, expected.operatingIncome, MONEY, `${id}院 Q${g.q} 営業利益`);
      }
    });
  }
});

describe('ゴールデン：全社の資金繰り', () => {
  it('収益・営業利益・本部費・投資・借入・金利・返済が一致する', () => {
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const t = deriveGroupTotals(run.quarters[i]!);
      // golden の revenue は診療収入＋学費
      close(t.clinicRevenue + t.tuitionRevenue, g.group.revenue, MONEY, `Q${g.q} 全社収益`);
      close(t.operatingIncome, g.group.operatingIncome, MONEY, `Q${g.q} 全社営業利益`);
      close(t.hqCost, g.group.hqCost, MONEY, `Q${g.q} 本部費`);
      close(t.capex, g.group.capex, MONEY, `Q${g.q} 投資`);
      close(t.newBorrowing, g.group.newBorrowing, MONEY, `Q${g.q} 新規借入`);
      close(t.interest, g.group.interest, MONEY, `Q${g.q} 支払利息`);
      close(t.principalRepaid, g.group.principalRepaid, MONEY, `Q${g.q} 元金返済`);
    }
  });

  it('検証モデル基準の現金残（未収金・税金を無視した見方）が一致する', () => {
    // エクセルには B/S が無く、投資は即時の現金流出、未収金も法人税も無かった。
    // その前提を再現すると golden の cash 列と一致する。
    // 実装の B/S 現金はこれとは別物（未収金と税金のぶん少ない）。
    let cash = INITIAL_CASH;
    for (let i = 0; i < quarters.length; i++) {
      const g = quarters[i]!;
      const t = deriveGroupTotals(run.quarters[i]!);
      cash += t.operatingIncome - t.hqCost + t.newBorrowing - t.capex - t.interest - t.principalRepaid;
      close(cash, g.group.cash, MONEY, `Q${g.q} 現金（検証モデル基準）`);
    }
  });

  it('借入残高の推移が一致する', () => {
    for (let i = 1; i < quarters.length; i++) {
      const g = quarters[i]!;
      const previous = run.quarters[i - 1]!.financials.balanceSheet;
      const opening = previous.shortTermDebt + previous.longTermDebt;
      close(opening, g.group.debtOpening, MONEY, `Q${g.q} 期首借入残高`);
    }
  });
});

describe('検証済みの設計上の性質（回帰防止）', () => {
  const a = run.quarters.map((q) => q.clinics.find((c) => c.id === 'A')!);

  it('待ち時間のピークはQ7、患者ストックの底はQ11。遅延は4四半期', () => {
    const peakWaitQ = a.reduce((best, c, i) => (c.waitMinutes > a[best]!.waitMinutes ? i : best), 0) + 1;
    const window = a.slice(4, 20);
    const troughQ =
      window.reduce((best, c, i) => (c.patientStock < window[best]!.patientStock ? i : best), 0) + 5;
    expect(peakWaitQ).toBe(7);
    expect(troughQ).toBe(11);
    expect(troughQ - peakWaitQ).toBe(4);
  });

  it('評判は4四半期で41台まで落ちる。壊すのは一瞬', () => {
    expect(a[3]!.reputation).toBeCloseTo(75, 5);
    const worst = Math.min(...a.map((c) => c.reputation));
    expect(worst).toBeGreaterThan(41);
    expect(worst).toBeLessThan(42);
  });

  it('4四半期の医師不足は20四半期経っても完全には回復しない', () => {
    expect(a[23]!.patientStock).toBeLessThan(a[3]!.patientStock);
  });

  it('捌けなかった需要は翌期に繰り越さない', () => {
    for (const q of run.quarters) {
      for (const c of q.clinics) {
        expect(c.visitsServed).toBeLessThanOrEqual(c.effectiveCapacity + 1e-9);
        expect(c.visitsServed).toBeLessThanOrEqual(c.demandVisits + 1e-9);
      }
    }
  });
});

describe('通知イベント', () => {
  it('待ち時間のピーク四半期には危機イベントが出る', () => {
    const events = run.quarters[6]!.events;
    expect(events.some((e) => e.severity === 'critical' && e.screen === 'clinic')).toBe(true);
  });

  it('加算が要件割れで落ちた四半期に通知が出る', () => {
    const q5 = run.quarters[4]!.events;
    expect(q5.some((e) => e.id.startsWith('addon-lapsed-'))).toBe(true);
  });

  it('改定は起きた四半期にだけ通知される（予告しない）', () => {
    const revisionQuarters = run.quarters
      .filter((q) => q.events.some((e) => e.id.startsWith('fee-revision-')))
      .map((q) => q.quarter);
    expect(revisionQuarters).toEqual([5, 13, 21, 29, 37]);
  });
});

describe('会計の不変条件', () => {
  it('40四半期すべてで貸借が一致する', () => {
    for (const q of run.quarters) {
      expect(() => assertBalanced(q.financials.balanceSheet), `Q${q.quarter}`).not.toThrow();
    }
  });

  it('未収金は保険診療収入の 0.67 四半期ぶん', () => {
    for (const q of run.quarters) {
      const bs = q.financials.balanceSheet;
      close(
        bs.accountsReceivable,
        q.financials.incomeStatement.insuranceRevenue * 0.67,
        1e-9,
        `Q${q.quarter} 医業未収金`,
      );
    }
  });

  it('固定資産は取得の翌四半期から償却が始まる', () => {
    // Q1 に A院を 6,000 万で取得。Q1 は償却なし、Q2 から医療機器 180 ＋ 内装 60
    expect(run.quarters[0]!.financials.incomeStatement.depreciation).toBe(0);
    close(run.quarters[1]!.financials.incomeStatement.depreciation, 240, 1e-9, 'Q2 減価償却費');
  });

  it('看護学校の 2.5 億は費用ではなく校舎という資産になる', () => {
    const q5 = run.quarters[4]!.financials.balanceSheet;
    close(q5.fixedAssetsByClass.building, 25000, 1e-9, 'Q5 校舎の簿価');
    // 現金は減るが、その四半期に純資産は毀損しない（費用計上ではないため）
    const q4 = run.quarters[3]!.financials.balanceSheet;
    const equityDrop = q4.totalEquity - q5.totalEquity;
    expect(equityDrop).toBeLessThan(25000);
  });

  /**
   * ★既定シナリオは Q12 で債務超過になる。
   *
   * エクセルは「最低現金 −1.8 億」しか見ていなかったが、発生主義で組むと
   * 減価償却・本部費・支払利息が薄い営業利益を食い切っていることが分かる。
   * B/S を入れた目的そのものなので、この四半期を回帰防止で固定しておく。
   * シナリオ側の投資判断を変えるまで、ここは緑のままであるべき。
   */
  it('既定シナリオが債務超過に入るのは Q12', () => {
    const firstInsolvent = run.quarters.find((q) => q.financials.balanceSheet.totalEquity < 0);
    expect(firstInsolvent?.quarter).toBe(12);
    expect(run.quarters[10]!.financials.balanceSheet.totalEquity).toBeGreaterThan(0);
  });

  it('資金ショートと債務超過は別々に判定される', () => {
    // Q10 は現金がマイナスだが純資産は残っている＝つなぎ融資で越えられる谷
    const q10 = run.quarters[9]!.financials.balanceSheet;
    expect(q10.cash).toBeLessThan(0);
    expect(q10.totalEquity).toBeGreaterThan(0);
  });
});
