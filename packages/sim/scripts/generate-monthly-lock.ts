/**
 * baseline.monthly.json を作り直す。
 *
 *   pnpm --filter @med/sim lock:monthly
 *
 * ★これは**検証ではない。** 実装から実装のロックを作るだけ。
 * 検証の起点は test/golden/baseline.golden.json（表計算で作った四半期40期）で、
 * そちらとの突き合わせは test/golden.test.ts が受け持つ。
 *
 * 作り直してよいのは、docs/spec を先に更新して数式を意図的に変えたときだけ
 * （CLAUDE.md §1）。差分は必ず目視で確認する。
 */
import { writeFileSync } from 'node:fs';
import { runSimulation } from '../src/simulation';
import { deriveGroupTotals } from '../src/derive';
import { INITIAL_CASH } from '../src/constants';

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const run = runSimulation();

let verificationCash = INITIAL_CASH;
const months = run.months.map((t) => {
  const g = deriveGroupTotals(t);
  verificationCash +=
    g.operatingIncome - g.hqCost + g.newBorrowing - g.capex - g.interest - g.principalRepaid;
  const bs = t.financials.balanceSheet;
  const clinics: Record<string, unknown> = {};
  for (const c of t.clinics) {
    clinics[c.id] = {
      newPatients: r2(c.newPatients), patientStock: r2(c.patientStock),
      demandVisits: r2(c.demandVisits), capacity: r2(c.capacity),
      effectiveCapacity: r2(c.effectiveCapacity), utilization: r4(c.utilization),
      waitMinutes: r2(c.waitMinutes), reputation: r2(c.reputation), churnRate: r4(c.churnRate),
      visitsServed: r2(c.visitsServed), insuranceRevenue: r2(c.insuranceRevenue),
      selfPayRevenue: r2(c.selfPayRevenue), operatingCost: r2(c.operatingCost),
      operatingIncome: r2(c.operatingIncome),
    };
  }
  return {
    m: t.month, label: t.label,
    doctors: t.staff.doctorsByClinic,
    nurses: r2(t.staff.nurses), nursesRequired: r2(t.staff.nursesRequired),
    nurseSufficiency: r4(t.staff.nurseSufficiency),
    igyokuRelation: t.staff.igyokuRelation,
    feePointIndex: r4(t.fee.feePointIndex), addonTotal: r4(t.fee.addonTotal),
    effectiveFeeIndex: r4(t.fee.effectiveFeeIndex),
    clinics,
    group: {
      revenue: r2(g.clinicRevenue + g.tuitionRevenue), operatingIncome: r2(g.operatingIncome),
      hqCost: r2(g.hqCost), capex: r2(g.capex), newBorrowing: r2(g.newBorrowing),
      interest: r2(g.interest), principalRepaid: r2(g.principalRepaid),
      verificationCash: r2(verificationCash),
    },
    balanceSheet: {
      cash: r2(bs.cash), accountsReceivable: r2(bs.accountsReceivable),
      fixedAssets: r2(bs.fixedAssets), totalAssets: r2(bs.totalAssets),
      totalLiabilities: r2(bs.totalLiabilities), totalEquity: r2(bs.totalEquity),
    },
  };
});

writeFileSync(
  new URL('../test/golden/baseline.monthly.json', import.meta.url),
  JSON.stringify({
    description:
      '月刻みモデルの既定シナリオ120ヶ月。四半期の検証データ（baseline.golden.json）と突き合わせた上で固定した回帰防止用のロック。',
    source:
      '実装から生成。検証の起点ではない。検証の起点は baseline.golden.json（表計算で作った四半期40期）。',
    generatedFrom: 'BASELINE_SCENARIO',
    months,
  }, null, 1) + '\n',
);
console.log('wrote', months.length, 'months');
