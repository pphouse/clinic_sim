/**
 * 星の評価。評判を口コミの見え方で出す。
 *
 * 数値の 41.4 は「悪い」と分かるまでに一拍かかるが、★★☆☆☆ は見た瞬間に分かる。
 * 評判はプレイヤーが直接いじれない結果なので、精密な数値より体感の方が要る。
 *
 * 端数は星を横に切って出す。丸めて表示すると、
 * 評判が緩慢に動くこのゲームで「1ヶ月では何も変わらない」ように見えてしまう。
 */
import { REPUTATION_STAR_COUNT } from '@med/sim';

/** 24×24 の座標系に描いた5角の星 */
const STAR_PATH =
  'M12 2.6 15 8.7 21.7 9.7 16.9 14.4 18 21.1 12 17.9 6 21.1 7.1 14.4 2.3 9.7 9 8.7 Z';

/** 星1つぶんの送り幅（描画は24なので、少し詰めて並べる） */
const PITCH = 22;

export interface StarRatingProps {
  /** 0〜5 の実数。端数はそのまま横に切って出る */
  value: number;
  /** 星ひとつの表示サイズ */
  size?: number;
  /** 読み上げ用。「評判 3.8」など */
  label?: string;
}

export function StarRating({ value, size = 16, label }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(REPUTATION_STAR_COUNT, value));
  const totalWidth = PITCH * REPUTATION_STAR_COUNT + (24 - PITCH);
  const filledWidth = (clamped / REPUTATION_STAR_COUNT) * totalWidth;
  // clipPath の id は同じ画面に複数出ても衝突しないよう値から作る
  const clipId = `star-clip-${clamped.toFixed(3).replace('.', '-')}`;

  const stars = Array.from({ length: REPUTATION_STAR_COUNT }, (_, i) => (
    <path key={i} d={STAR_PATH} transform={`translate(${i * PITCH} 0)`} />
  ));

  return (
    <svg
      viewBox={`0 0 ${totalWidth} 24`}
      width={(totalWidth / 24) * size}
      height={size}
      role="img"
      aria-label={label ?? `5段階中 ${clamped.toFixed(1)}`}
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={filledWidth} height="24" />
        </clipPath>
      </defs>
      <g fill="var(--star-off)">{stars}</g>
      <g fill="var(--star)" clipPath={`url(#${clipId})`}>
        {stars}
      </g>
    </svg>
  );
}
