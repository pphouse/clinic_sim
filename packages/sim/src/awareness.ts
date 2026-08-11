/**
 * 集患と認知度。docs/spec/07-awareness.md
 *
 * ★**この層は検証されていない。** 表計算に対応する列が無い。
 * 既定シナリオの院は `initialAwareness` を持たないので、係数は常に 1 の恒等式。
 *
 * プレイテストで出た「集患に全く困らないのがおかしい」への答え。
 * それまで新規患者はポテンシャル・評判・シェアだけで決まっていて、
 * **プレイヤーが動かせるのは待ち時間経由のシェアだけ**だった。
 * 医師を置いて枠を空ければ、あとは黙っていても患者が流れ込む。
 *
 * 純粋関数のみ。UI と sim の両方がここを読む（CLAUDE.md §2）。
 */
import {
  AWARENESS_BASE,
  AWARENESS_GAIN_PER_MONTH,
  AWARENESS_MAX,
  AWARENESS_WORD_OF_MOUTH,
  marketingLevelOf,
} from './constants';
import type { MarketingLevelId } from './types';

/**
 * 認知度の落ち着き先。
 *
 * ★口コミの項が入っているのが効く。
 * 患者が増えると認知度が上がり、認知度が上がると患者が増える。
 * **正のフィードバックが1本入っている**ので、序盤の1人が重い。
 *
 * settledStock は「いまの認知度と関係なく、この商圏でこの院が行き着く患者数」。
 * ここを分母にすることで、大きい商圏ほど口コミが立ち上がりにくくなる。
 */
export function awarenessCeilingOf(
  level: MarketingLevelId,
  patientStock: number,
  settledStock: number,
): number {
  const wordOfMouth =
    settledStock > 0
      ? AWARENESS_WORD_OF_MOUTH * Math.min(1, Math.max(0, patientStock / settledStock))
      : 0;
  return Math.min(AWARENESS_MAX, AWARENESS_BASE + marketingLevelOf(level).reach + wordOfMouth);
}

/**
 * 翌月の認知度。落ち着き先へ向かって一定の速さで動く。
 * ★**上げるのも落ちるのも同じ速さ。** 広告をやめれば同じ速さで落ちる。
 */
export function nextAwareness(previous: number, ceiling: number): number {
  return previous + (ceiling - previous) * AWARENESS_GAIN_PER_MONTH;
}

/** その院の今月の広告宣伝費 */
export function marketingCostOf(level: MarketingLevelId): number {
  return marketingLevelOf(level).costPerMonth;
}
