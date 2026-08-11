/**
 * 会計レイヤー。P/L・B/S・C/F の三表を作る。
 *
 * 検証に使ったエクセルには B/S が無く、開業投資を即時費用処理していた。
 * ここでは資産計上して定額法で償却する。これで意味が変わるものが 2 つある：
 *
 *   1. 看護学校の 2.5 億は費用ではなく「校舎」という固定資産になる。
 *      現金は減るが純資産は毀損しない。検証で出た「最低現金 -1.8 億」は
 *      債務超過ではなく、単なる資金繰りの谷だったことになる。
 *   2. レセプトは約 2 ヶ月遅れで入金される。医業未収金として滞留するので、
 *      黒字でも現金が無い状況が自然に発生する。
 *
 * 不変条件：totalAssets === totalLiabilities + totalEquity
 * これは assertBalanced() で必ず検証する。
 */
import {
  CORPORATE_TAX_RATE,
  MONTHS_PER_YEAR,
  RECEIVABLE_MONTHS,
  USEFUL_LIFE_BUILDING,
  USEFUL_LIFE_EQUIPMENT,
  USEFUL_LIFE_INTERIOR,
} from './constants';
import type {
  AssetClass,
  BalanceSheet,
  CashFlowStatement,
  FinancialStatements,
  FixedAsset,
  IncomeStatement,
  Loan,
  Man,
  Month,
} from './types';

export const USEFUL_LIFE: Record<AssetClass, number> = {
  medicalEquipment: USEFUL_LIFE_EQUIPMENT,
  interior: USEFUL_LIFE_INTERIOR,
  building: USEFUL_LIFE_BUILDING,
  intangible: USEFUL_LIFE_INTERIOR,
};

/** 定額法。1ヶ月あたりの償却費 */
export function monthlyDepreciation(asset: FixedAsset): Man {
  const perMonth = asset.acquisitionCost / asset.usefulLifeMonths;
  return Math.min(perMonth, asset.bookValue);
}

/** 全資産を 1 ヶ月分償却し、償却費の合計と更新後の資産を返す */
export function depreciateAll(
  assets: FixedAsset[],
  month: Month,
): { depreciation: Man; assets: FixedAsset[] } {
  let depreciation = 0;
  const next = assets.map((a) => {
    if (month <= a.acquiredAtMonth) return a;
    const d = monthlyDepreciation(a);
    depreciation += d;
    return { ...a, bookValue: a.bookValue - d };
  });
  return { depreciation, assets: next };
}

export function bookValueByClass(assets: FixedAsset[]): Record<AssetClass, Man> {
  const out: Record<AssetClass, Man> = {
    medicalEquipment: 0, interior: 0, building: 0, intangible: 0,
  };
  for (const a of assets) out[a.assetClass] += a.bookValue;
  return out;
}

/** 借入の利息と元金返済。返済は残高に対する定率（月あたり） */
export function serviceLoans(loans: Loan[]): {
  interest: Man;
  principalRepaid: Man;
  loans: Loan[];
} {
  let interest = 0;
  let principalRepaid = 0;
  const next = loans.map((l) => {
    const i = l.outstanding * l.monthlyRate;
    const p = Math.min(l.outstanding, l.outstanding * l.monthlyRepaymentRate);
    interest += i;
    principalRepaid += p;
    return { ...l, outstanding: l.outstanding - p };
  });
  return { interest, principalRepaid, loans: next };
}

/** 1 年以内に返済予定の元金を短期借入として切り出す */
export function splitDebt(loans: Loan[]): { shortTerm: Man; longTerm: Man } {
  let shortTerm = 0;
  let longTerm = 0;
  for (const l of loans) {
    const withinYear = Math.min(l.outstanding, l.outstanding * l.monthlyRepaymentRate * MONTHS_PER_YEAR);
    shortTerm += withinYear;
    longTerm += l.outstanding - withinYear;
  }
  return { shortTerm, longTerm };
}

/** レセプトの入金遅れによる医業未収金 */
export function receivablesFor(insuranceRevenue: Man): Man {
  return insuranceRevenue * RECEIVABLE_MONTHS;
}

export interface BuildStatementsInput {
  month: Month;
  incomeStatement: Omit<IncomeStatement,
    'totalRevenue' | 'totalExpenses' | 'operatingIncome' | 'ordinaryIncome' | 'pretaxIncome' | 'tax' | 'netIncome'>;
  openingCash: Man;
  openingReceivables: Man;
  openingPayables: Man;
  closingPayables: Man;
  inventory: Man;
  assets: FixedAsset[];
  loans: Loan[];
  capitalExpenditure: Man;
  newBorrowing: Man;
  principalRepayment: Man;
  paidInCapital: Man;
  openingRetainedEarnings: Man;
}

export function buildStatements(input: BuildStatementsInput): FinancialStatements {
  const is = input.incomeStatement;

  const totalRevenue =
    is.insuranceRevenue + is.selfPayRevenue + is.tuitionRevenue + is.rentalRevenue +
    is.contractRevenue;
  const totalExpenses =
    is.medicalSupplies + is.doctorPayroll + is.nursePayroll + is.otherPayroll +
    is.rent + is.depreciation + is.schoolOperating + is.agencyFees +
    is.igyokuRelationCost + is.externalRelationCost + is.systemCost + is.marketing +
    is.headquarters;

  const operatingIncome = totalRevenue - totalExpenses;
  const ordinaryIncome = operatingIncome - is.interestExpense;
  const pretaxIncome = ordinaryIncome - is.extraordinaryLoss;
  const tax = pretaxIncome > 0 ? pretaxIncome * CORPORATE_TAX_RATE : 0;
  const netIncome = pretaxIncome - tax;

  const incomeStatement: IncomeStatement = {
    ...is, totalRevenue, totalExpenses,
    operatingIncome, ordinaryIncome, pretaxIncome, tax, netIncome,
  };

  // --- キャッシュフロー（間接法）
  const closingReceivables = receivablesFor(is.insuranceRevenue);
  const changeInReceivables = closingReceivables - input.openingReceivables;
  const changeInPayables = input.closingPayables - input.openingPayables;

  const operatingCashFlow =
    netIncome + is.depreciation - changeInReceivables + changeInPayables;
  const investingCashFlow = -input.capitalExpenditure;
  const financingCashFlow = input.newBorrowing - input.principalRepayment;
  const netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow;
  const cashAtEnd = input.openingCash + netChangeInCash;

  const cashFlow: CashFlowStatement = {
    netIncome, depreciation: is.depreciation,
    changeInReceivables, changeInPayables, operatingCashFlow,
    capitalExpenditure: -input.capitalExpenditure, investingCashFlow,
    newBorrowing: input.newBorrowing, principalRepayment: -input.principalRepayment,
    financingCashFlow, netChangeInCash, cashAtEnd,
  };

  // --- 貸借対照表
  const byClass = bookValueByClass(input.assets);
  const fixedAssets = byClass.medicalEquipment + byClass.interior + byClass.building + byClass.intangible;
  const currentAssets = cashAtEnd + closingReceivables + input.inventory;
  const totalAssets = currentAssets + fixedAssets;

  const { shortTerm, longTerm } = splitDebt(input.loans);
  const totalLiabilities = input.closingPayables + shortTerm + longTerm;

  const retainedEarnings = input.openingRetainedEarnings + netIncome;
  const totalEquity = input.paidInCapital + retainedEarnings;

  const balanceSheet: BalanceSheet = {
    cash: cashAtEnd,
    accountsReceivable: closingReceivables,
    inventory: input.inventory,
    currentAssets,
    fixedAssets,
    fixedAssetsByClass: byClass,
    totalAssets,
    accountsPayable: input.closingPayables,
    shortTermDebt: shortTerm,
    longTermDebt: longTerm,
    totalLiabilities,
    paidInCapital: input.paidInCapital,
    retainedEarnings,
    totalEquity,
  };

  return { month: input.month, incomeStatement, balanceSheet, cashFlow };
}

/**
 * 貸借の一致を検証する。
 * ズレたら会計の実装が壊れている。丸め誤差を超える差は必ず落とす。
 */
export function assertBalanced(bs: BalanceSheet, tolerance = 0.01): void {
  const diff = bs.totalAssets - (bs.totalLiabilities + bs.totalEquity);
  if (Math.abs(diff) > tolerance) {
    throw new Error(
      `貸借が一致しません。差額 ${diff.toFixed(4)} 万円 ` +
        `(資産 ${bs.totalAssets.toFixed(2)} / 負債 ${bs.totalLiabilities.toFixed(2)} + 純資産 ${bs.totalEquity.toFixed(2)})`,
    );
  }
}

/** 債務超過。ゲームオーバー判定に使う */
export function isInsolvent(bs: BalanceSheet): boolean {
  return bs.totalEquity < 0;
}
