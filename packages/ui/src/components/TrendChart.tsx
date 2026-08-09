/**
 * 推移の折れ線。
 *
 * ★この画面にグラフが要る理由は「見栄え」ではない。
 * このゲームの主題は遅延で、待ち時間が跳ねた月と患者ストックが減り始める月は
 * 1年ずれている。**そのズレは並べて描かないと絶対に伝わらない。**
 * 数値だけを月送りで見せても、プレイヤーは因果を結べない。
 *
 * 系列ごとに縦軸を独立に正規化する。単位が違うもの（分と人）を同じ軸に載せられないし、
 * ここで見せたいのは水準ではなく**山と谷の位置**だから。
 */

export interface TrendSeries {
  label: string;
  color: string;
  values: number[];
  /** 末尾の値の表示（「71.3分」など） */
  latest: string;
  /** 小さいほど良い指標か。凡例の並びだけに使う */
  inverted?: boolean;
}

export interface TrendChartProps {
  series: TrendSeries[];
  height?: number;
  /** 横軸の左端・右端に出す短いラベル */
  fromLabel?: string;
  toLabel?: string;
}

const VIEW_W = 390;
const PAD_X = 4;

function toPoints(values: number[], top: number, bottom: number): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  // 平坦な系列は中央に置く。0除算よけも兼ねる
  const span = max - min || 1;
  const stepX = values.length > 1 ? (VIEW_W - PAD_X * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = PAD_X + i * stepX;
      const y = bottom - ((v - min) / span) * (bottom - top);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function TrendChart({ series, height = 78, fromLabel, toLabel }: TrendChartProps) {
  const top = 8;
  const bottom = height - 8;
  const usable = series.filter((s) => s.values.length > 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          alignItems: 'baseline',
          marginBottom: 2,
        }}
      >
        {series.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 7,
                background: s.color,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
              {s.label}
            </span>
            <span className="num" style={{ fontSize: 'var(--text-label)', color: s.color }}>
              {s.latest}
            </span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`直近の推移：${series.map((s) => `${s.label} ${s.latest}`).join('、')}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {usable.map((s) => {
          const points = toPoints(s.values, top, bottom);
          const last = points.split(' ').at(-1)?.split(',') ?? [];
          return (
            <g key={s.label}>
              <polyline
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
              {/* 最新の点だけ強調する。「いまここ」が線の上のどこかを迷わせない */}
              {last.length === 2 && (
                <circle cx={last[0]} cy={last[1]} r={3.4} fill={s.color} />
              )}
            </g>
          );
        })}
      </svg>

      {(fromLabel || toLabel) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--text-caption)',
            color: 'var(--paper-mute)',
            marginTop: 2,
          }}
        >
          <span>{fromLabel}</span>
          <span>{toLabel}</span>
        </div>
      )}
    </div>
  );
}
