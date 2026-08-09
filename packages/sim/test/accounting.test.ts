/**
 * 会計レイヤーの単体テスト。
 * 三表そのものは simulation.test.ts でゴールデンと突き合わせる。ここは部品の挙動。
 */
import { describe, expect, it } from 'vitest';
import {
  bookValueByClass,
  buildStatements,
  depreciateAll,
  isInsolvent,
  quarterlyDepreciation,
  receivablesFor,
  serviceLoans,
  splitDebt,
} from '../src/accounting';
import { CORPORATE_TAX_RATE, RECEIVABLE_QUARTERS } from '../src/constants';
import type { FixedAsset, Loan } from '../src/types';

const equipment = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'eq',
  name: '医療機器',
  assetClass: 'medicalEquipment',
  acquiredAtQuarter: 1,
  acquisitionCost: 2000,
  usefulLifeQuarters: 20,
  bookValue: 2000,
  ...over,
});

describe('減価償却', () => {
  it('定額法。耐用年数で割った額を四半期ごとに落とす', () => {
    expect(quarterlyDepreciation(equipment())).toBe(100);
  });

  it('簿価を下回っては償却しない', () => {
    expect(quarterlyDepreciation(equipment({ bookValue: 40 }))).toBe(40);
  });

  it('取得四半期は償却しない', () => {
    const { depreciation } = depreciateAll([equipment()], 1);
    expect(depreciation).toBe(0);
  });

  it('取得の翌四半期から償却が始まる', () => {
    const { depreciation, assets } = depreciateAll([equipment()], 2);
    expect(depreciation).toBe(100);
    expect(assets[0]!.bookValue).toBe(1900);
  });

  it('20四半期で簿価がゼロになり、それ以上は落ちない', () => {
    let assets = [equipment()];
    let total = 0;
    for (let q = 2; q <= 40; q++) {
      const next = depreciateAll(assets, q);
      total += next.depreciation;
      assets = next.assets;
    }
    expect(total).toBe(2000);
    expect(assets[0]!.bookValue).toBe(0);
  });

  it('資産クラスごとに簿価を集計する', () => {
    const byClass = bookValueByClass([
      equipment(),
      equipment({ id: 'in', assetClass: 'interior', bookValue: 500 }),
    ]);
    expect(byClass.medicalEquipment).toBe(2000);
    expect(byClass.interior).toBe(500);
    expect(byClass.building).toBe(0);
  });
});

describe('借入', () => {
  const loan = (): Loan => ({
    id: 'l',
    name: '開業資金',
    principal: 8000,
    outstanding: 8000,
    quarterlyRate: 0.005,
    quarterlyRepaymentRate: 0.025,
  });

  it('金利は期首残高に対して、元金返済は残高の定率', () => {
    const { interest, principalRepaid, loans } = serviceLoans([loan()]);
    expect(interest).toBe(40);
    expect(principalRepaid).toBe(200);
    expect(loans[0]!.outstanding).toBe(7800);
  });

  it('1年以内に返済予定の元金を短期借入として切り出す', () => {
    const { shortTerm, longTerm } = splitDebt([loan()]);
    expect(shortTerm).toBe(800);
    expect(longTerm).toBe(7200);
    expect(shortTerm + longTerm).toBe(8000);
  });
});

describe('医業未収金', () => {
  it('レセプトの入金遅れぶんが滞留する', () => {
    expect(receivablesFor(1000)).toBeCloseTo(1000 * RECEIVABLE_QUARTERS, 9);
  });
});

describe('三表の組み立て', () => {
  const lines = {
    insuranceRevenue: 4000,
    selfPayRevenue: 500,
    tuitionRevenue: 0,
    rentalRevenue: 0,
    medicalSupplies: 810,
    doctorPayroll: 1500,
    nursePayroll: 940,
    otherPayroll: 0,
    rent: 450,
    depreciation: 240,
    schoolOperating: 0,
    agencyFees: 0,
    igyokuRelationCost: 120,
    headquarters: 250,
    interestExpense: 40,
    extraordinaryLoss: 0,
  };

  // 期首は 現金 10,000 ＋ 未収金 2,000 ＋ 固定資産 3,000 ＝ 純資産 15,000 で釣り合っている。
  // 期首が釣り合っていない状態を入れると期末も当然ズレる。B/S は差分でしか動かない
  const openingFixedAssets = 3000;
  const statements = buildStatements({
    quarter: 2,
    incomeStatement: lines,
    openingCash: 10000,
    openingReceivables: 2000,
    openingPayables: 0,
    closingPayables: 0,
    inventory: 0,
    // 償却後の簿価を渡す。buildStatements は償却しない（depreciateAll の仕事）
    assets: [equipment({ bookValue: openingFixedAssets - lines.depreciation })],
    loans: [],
    capitalExpenditure: 0,
    newBorrowing: 0,
    principalRepayment: 0,
    paidInCapital: 15000,
    openingRetainedEarnings: 0,
  });

  it('黒字なら法人税が立つ', () => {
    const is = statements.incomeStatement;
    expect(is.totalRevenue).toBe(4500);
    expect(is.operatingIncome).toBe(4500 - 4310);
    expect(is.ordinaryIncome).toBe(150);
    expect(is.tax).toBeCloseTo(150 * CORPORATE_TAX_RATE, 9);
    expect(is.netIncome).toBeCloseTo(105, 9);
  });

  it('赤字なら法人税は立たない', () => {
    const loss = buildStatements({
      quarter: 2,
      incomeStatement: { ...lines, insuranceRevenue: 1000 },
      openingCash: 10000,
      openingReceivables: 2000,
      openingPayables: 0,
      closingPayables: 0,
      inventory: 0,
      assets: [equipment({ bookValue: 2760 })],
      loans: [],
      capitalExpenditure: 0,
      newBorrowing: 0,
      principalRepayment: 0,
      paidInCapital: 15000,
      openingRetainedEarnings: 0,
    });
    expect(loss.incomeStatement.pretaxIncome).toBeLessThan(0);
    expect(loss.incomeStatement.tax).toBe(0);
  });

  it('未収金が増えた四半期は、黒字でも営業キャッシュフローが目減りする', () => {
    const cf = statements.cashFlow;
    expect(cf.changeInReceivables).toBeCloseTo(4000 * RECEIVABLE_QUARTERS - 2000, 9);
    expect(cf.operatingCashFlow).toBeLessThan(cf.netIncome + lines.depreciation);
  });

  it('貸借が一致する', () => {
    const bs = statements.balanceSheet;
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity, 9);
  });

  it('債務超過の判定は純資産で行う。現金がマイナスでも債務超過とは限らない', () => {
    expect(isInsolvent(statements.balanceSheet)).toBe(false);
    expect(isInsolvent({ ...statements.balanceSheet, cash: -9999 })).toBe(false);
    expect(isInsolvent({ ...statements.balanceSheet, totalEquity: -1 })).toBe(true);
  });
});
