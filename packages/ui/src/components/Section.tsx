/**
 * 画面共通の小物。16画面で同じ形を使う。
 *
 * 診療所画面の中に閉じ込めていたものを外に出した。**同じ見出しが画面ごとに
 * 微妙に違う大きさで並ぶのがいちばん安っぽく見える。**
 */
import type { ReactNode } from 'react';

/** 節の見出し。明朝・小さめ・字送りを開ける */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: 'var(--space-6) 0 var(--space-2)',
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-label)',
        fontWeight: 600,
        color: 'var(--paper-dim)',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </h2>
  );
}

/** 表の下に置く補足。なぜその数字がそう動くのかを一言で */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 'var(--space-2) 0 0',
        fontSize: 'var(--text-caption)',
        color: 'var(--paper-mute)',
        lineHeight: 1.6,
      }}
    >
      {children}
    </p>
  );
}

export type HeroTone = 'warning' | 'critical' | 'positive' | 'negative';

/**
 * 大きく出す数字。数字は大きく、ラベルは小さく（CLAUDE.md §5）。
 * key を値にして、変わったときだけ一度光らせる。
 */
export function HeroStat({
  label,
  value,
  unit,
  tone,
  delta,
  higherIsBetter = true,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: HeroTone;
  delta?: string;
  higherIsBetter?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div
        key={value}
        className="num value-changed"
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.05,
          whiteSpace: 'nowrap',
          color: tone ? `var(--${tone})` : 'var(--paper)',
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 500, marginLeft: 1 }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)', marginTop: 2 }}>
        {label}
      </div>
      {delta !== undefined && (
        <div
          className="num"
          style={{
            fontSize: 'var(--text-caption)',
            marginTop: 1,
            color: delta.startsWith('±')
              ? 'var(--paper-mute)'
              : delta.startsWith('+') === higherIsBetter
                ? 'var(--positive)'
                : 'var(--negative)',
          }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/** ヒーロー数値を3つ横に並べる帯 */
export function HeroRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) 0',
      }}
    >
      {children}
    </div>
  );
}

/**
 * 状態を一言で示す札。加算の「有効／要件割れ」など。
 * 色は意味に紐づける。緑＝満たしている、赤＝落ちている、灰＝まだ無い
 */
export function StatusPill({
  text,
  tone,
}: {
  text: string;
  tone: 'positive' | 'critical' | 'warning' | 'mute';
}) {
  const color = tone === 'mute' ? 'var(--paper-mute)' : `var(--${tone})`;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}`,
        color,
        fontSize: 'var(--text-caption)',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}
