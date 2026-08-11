/**
 * 開業資金の組み立て。docs/spec/06-opening.md §3
 *
 * ★**この層は検証されていない。** 一般的な診療所開業の相場から置いた数字。
 * 既定シナリオは院を最初から持っていて `openClinic` の意思決定を1つも持たないので、
 * ここは1回も評価されない。`baseline.golden.json` は動かない。
 *
 * 純粋関数のみ。UI と sim の両方がここを読む
 * （開院画面が「いくら借りることになるか」を出すのに要る。CLAUDE.md §2）。
 */
import {
  OPENING_LOAN_UNIT,
  OPENING_WORKING_CAPITAL_RATE,
  fitoutOf,
  specialtyOf,
  type ClinicSite,
} from './constants';
import type { FitoutId, Man, SpecialtyId } from './types';

export interface OpeningPlan {
  /** 設備投資（内装＋医療機器）。立地 × 科 × 内装 */
  capex: Man;
  /** 手元に残す運転資金。レセプトの入金が2ヶ月遅れるので、無いと初月で死ぬ */
  workingCapital: Man;
  /** 自己資金から出す分 */
  ownFunds: Man;
  /** 足りない分だけ借りる。100万円単位に切り上げ */
  loan: Man;
  /** 開院した直後の現金。借りたときは運転資金とほぼ同じ額になる */
  cashAfter: Man;
}

/**
 * 「この立地でこの科をこの内装で開くと、いくら借りることになるか」。
 *
 * 自己資金だけでは絶対に足りないので、**借りるかどうかは選択肢ではない。**
 * 選べるのは額で、それを決めるのが立地・科・内装。
 *
 * 2院目以降で現金が潤沢なら loan は 0 になり、そのまま自己資金で建つ。
 * 式を分けていないので、分院を出すたびに同じ計算が効く。
 */
export function openingPlan(
  site: ClinicSite,
  specialtyId: SpecialtyId,
  fitoutId: FitoutId | undefined,
  cash: Man,
): OpeningPlan {
  const capex = Math.round(
    site.capex * specialtyOf(specialtyId).capexMultiplier * fitoutOf(fitoutId).capexMultiplier,
  );
  const workingCapital = Math.round(capex * OPENING_WORKING_CAPITAL_RATE);
  const need = capex + workingCapital;
  const shortfall = Math.max(0, need - cash);
  const loan = Math.ceil(shortfall / OPENING_LOAN_UNIT) * OPENING_LOAN_UNIT;
  return {
    capex,
    workingCapital,
    ownFunds: Math.max(0, Math.min(cash, need)),
    loan,
    cashAfter: cash + loan - capex,
  };
}
