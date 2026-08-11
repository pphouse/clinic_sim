/**
 * 診療報酬。
 *
 * 検証で分かったのは「改定より加算の方が効く」ということ（docs/spec/01-simulation-core.md）。
 * 改定は 2 年に一度、数パーセントの外部イベント。加算は 5 つ揃えば +19% 乗る。
 *
 * だから改定は予測させない。**加算は要件を割ると自動的に落ちる。**
 * 取り返すには要件を満たし直すだけでよいが、落ちている間の収入は戻らない。
 */
import { ADDONS, FEE_REVISIONS } from './constants';
import type { Addon, AddonStatus, FeeTick, Month } from './types';

/** 改定の累積。基準 100 */
export function feePointIndexAt(month: Month): number {
  let index = 100;
  for (const revision of FEE_REVISIONS) {
    if (month >= revision.effectiveMonth) index *= 1 + revision.rate;
  }
  return index;
}

/** この月に施行された改定 */
export function feeRevisionAt(month: Month) {
  return FEE_REVISIONS.find((r) => r.effectiveMonth === month);
}

export function initialAddonStatuses(): AddonStatus[] {
  return ADDONS.map((a) => ({
    id: a.id,
    acquired: false,
    acquiredAtMonth: null,
    active: false,
    lapsedByRequirement: false,
  }));
}

/** 施設基準を満たしているか。医師数は全社合計、看護師充足率も全社 */
export function meetsRequirement(
  addon: Addon,
  doctorsTotal: number,
  nurseSufficiency: number,
): boolean {
  return (
    doctorsTotal >= addon.requiredDoctors && nurseSufficiency >= addon.requiredNurseSufficiency
  );
}

export interface FeeTickInput {
  month: Month;
  previous: AddonStatus[];
  /** この月に取得する加算 */
  acquire: string[];
  doctorsTotal: number;
  nurseSufficiency: number;
}

/**
 * 加算の取得・維持・失効を 1 ヶ月進める。
 * 取得はその月から効く。要件を割った月は即座に落ちる（猶予なし）。
 */
export function tickFee(input: FeeTickInput): FeeTick {
  const addons: AddonStatus[] = ADDONS.map((addon) => {
    const prev =
      input.previous.find((p) => p.id === addon.id) ??
      { id: addon.id, acquired: false, acquiredAtMonth: null, active: false, lapsedByRequirement: false };
    const acquired = prev.acquired || input.acquire.includes(addon.id);
    const acquiredAtMonth = prev.acquired
      ? prev.acquiredAtMonth
      : input.acquire.includes(addon.id)
        ? input.month
        : null;

    const withinTerm = input.month < addon.expiresAtMonth;
    const meets = meetsRequirement(addon, input.doctorsTotal, input.nurseSufficiency);
    const active = acquired && withinTerm && meets;

    return {
      id: addon.id,
      acquired,
      acquiredAtMonth,
      active,
      lapsedByRequirement: acquired && withinTerm && !meets,
    };
  });

  const addonTotal = addons.reduce((sum, status) => {
    if (!status.active) return sum;
    const addon = ADDONS.find((a) => a.id === status.id);
    return sum + (addon ? addon.effect : 0);
  }, 0);

  const feePointIndex = feePointIndexAt(input.month);

  return {
    feePointIndex,
    addonTotal,
    effectiveFeeIndex: feePointIndex * (1 + addonTotal),
    addons,
  };
}
