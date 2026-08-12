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
  monthlyDepreciation,
  receivablesFor,
  serviceLoans,
  splitDebt,
} from '../src/accounting';
import { CORPORATE_TAX_RATE, RECEIVABLE_MONTHS } from '../src/constants';
import type { FixedAsset, Loan } from '../src/types';

const equipment = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'eq',
  name: '医療機器',
  assetClass: 'medicalEquipment',
  acquiredAtMonth: 1,
  acquisitionCost: 2000,
  usefulLifeMonths: 60,
  bookValue: 2000,
  ...over,
});

describe('減価償却', () => {
  it('定額法。耐用年数で割った額を毎月落とす', () => {
    expect(monthlyDepreciation(equipment())).toBeCloseTo(2000 / 60, 9);
  });

  it('簿価を下回っては償却しない', () => {
    expect(monthlyDepreciation(equipment({ bookValue: 10 }))).toBe(10);
  });

  it('取得月は償却しない', () => {
    const { depreciation } = depreciateAll([equipment()], 1);
    expect(depreciation).toBe(0);
  });

  it('取得の翌月から償却が始まる', () => {
    const { depreciation, assets } = depreciateAll([equipment()], 2);
    expect(depreciation).toBeCloseTo(2000 / 60, 9);
    expect(assets[0]!.bookValue).toBeCloseTo(2000 - 2000 / 60, 9);
  });

  it('60ヶ月で簿価がゼロになり、それ以上は落ちない', () => {
    let assets = [equipment()];
    let total = 0;
    for (let q = 2; q <= 120; q++) {
      const next = depreciateAll(assets, q);
      total += next.depreciation;
      assets = next.assets;
    }
    expect(total).toBeCloseTo(2000, 9);
    expect(assets[0]!.bookValue).toBeCloseTo(0, 9);
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
    monthlyRate: 0.005,
    monthlyRepaymentRate: 0.025,
  });

  it('金利は月初残高に対して、元金返済は残高の定率', () => {
    const { interest, principalRepaid, loans } = serviceLoans([loan()]);
    expect(interest).toBe(40);
    expect(principalRepaid).toBe(200);
    expect(loans[0]!.outstanding).toBe(7800);
  });

  it('1年以内に返済予定の元金を短期借入として切り出す', () => {
    const { shortTerm, longTerm } = splitDebt([loan()]);
    expect(shortTerm).toBeCloseTo(8000 * 0.025 * 12, 9);
    expect(longTerm).toBeCloseTo(8000 - 8000 * 0.025 * 12, 9);
    expect(shortTerm + longTerm).toBe(8000);
  });
});

describe('医業未収金', () => {
  it('レセプトの入金遅れぶんが滞留する。翌々月入金なので常に2ヶ月分', () => {
    expect(receivablesFor(1000)).toBeCloseTo(2000, 9);
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
    // 拡張系の行。この試験は検証済みの範囲だけを見るので 0 のまま
    contractRevenue: 0,
    externalRelationCost: 0,
    systemCost: 0,
    marketing: 0,
  };

  // 期首は 現金 10,000 ＋ 未収金 2,000 ＋ 固定資産 3,000 ＝ 純資産 15,000 で釣り合っている。
  // 期首が釣り合っていない状態を入れると期末も当然ズレる。B/S は差分でしか動かない
  const openingFixedAssets = 3000;
  const statements = buildStatements({
    month: 2,
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
      month: 2,
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

  it('未収金が増えた月は、黒字でも営業キャッシュフローが目減りする', () => {
    const cf = statements.cashFlow;
    expect(cf.changeInReceivables).toBeCloseTo(4000 * RECEIVABLE_MONTHS - 2000, 9);
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
