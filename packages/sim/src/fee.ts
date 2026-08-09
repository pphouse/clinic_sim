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
import type { Addon, AddonStatus, FeeTick, Quarter } from './types';

/** 改定の累積。基準 100 */
export function feePointIndexAt(quarter: Quarter): number {
  let index = 100;
  for (const revision of FEE_REVISIONS) {
    if (quarter >= revision.effectiveQuarter) index *= 1 + revision.rate;
  }
  return index;
}

/** この四半期に施行された改定 */
export function feeRevisionAt(quarter: Quarter) {
  return FEE_REVISIONS.find((r) => r.effectiveQuarter === quarter);
}

export function initialAddonStatuses(): AddonStatus[] {
  return ADDONS.map((a) => ({
    id: a.id,
    acquired: false,
    acquiredAtQuarter: null,
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
  quarter: Quarter;
  previous: AddonStatus[];
  /** この四半期に取得する加算 */
  acquire: string[];
  doctorsTotal: number;
  nurseSufficiency: number;
}

/**
 * 加算の取得・維持・失効を 1 四半期進める。
 * 取得はその四半期から効く。要件を割った四半期は即座に落ちる（猶予なし）。
 */
export function tickFee(input: FeeTickInput): FeeTick {
  const addons: AddonStatus[] = ADDONS.map((addon) => {
    const prev =
      input.previous.find((p) => p.id === addon.id) ??
      { id: addon.id, acquired: false, acquiredAtQuarter: null, active: false, lapsedByRequirement: false };
    const acquired = prev.acquired || input.acquire.includes(addon.id);
    const acquiredAtQuarter = prev.acquired
      ? prev.acquiredAtQuarter
      : input.acquire.includes(addon.id)
        ? input.quarter
        : null;

    const withinTerm = input.quarter < addon.expiresAtQuarter;
    const meets = meetsRequirement(addon, input.doctorsTotal, input.nurseSufficiency);
    const active = acquired && withinTerm && meets;

    return {
      id: addon.id,
      acquired,
      acquiredAtQuarter,
      active,
      lapsedByRequirement: acquired && withinTerm && !meets,
    };
  });

  const addonTotal = addons.reduce((sum, status) => {
    if (!status.active) return sum;
    const addon = ADDONS.find((a) => a.id === status.id);
    return sum + (addon ? addon.effect : 0);
  }, 0);

  const feePointIndex = feePointIndexAt(input.quarter);

  return {
    feePointIndex,
    addonTotal,
    effectiveFeeIndex: feePointIndex * (1 + addonTotal),
    addons,
  };
}
