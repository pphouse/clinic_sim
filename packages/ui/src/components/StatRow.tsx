/**
 * 数値行。財務諸表・KPI・比較表の全てがこれで組まれる。
 * 署名要素のレセプト罫線はここに宿る。
 */
import type { ReactNode } from 'react';

export interface StatRowProps {
  label: string;
  /** 万円単位の値、または整形済み文字列 */
  value: number | string;
  /** 比較列（前期など） */
  compare?: number | string;
  /** 前期比。正なら緑、負なら赤 */
  delta?: number;
  unit?: string;
  /** 小計・合計行。罫線が太くなる */
  total?: boolean;
  /** 見出し的な行 */
  emphasis?: boolean;
  suffix?: ReactNode;
}

const fmt = (v: number | string): string =>
  typeof v === 'string' ? v : v < 0
    ? `(${Math.abs(Math.round(v)).toLocaleString('ja-JP')})`
    : Math.round(v).toLocaleString('ja-JP');

export function StatRow({
  label, value, compare, delta, unit, total, emphasis, suffix,
}: StatRowProps) {
  return (
    <div
      className={total ? 'receipt-rule--total' : 'receipt-rule'}
      style={{
        display: 'grid',
        gridTemplateColumns: compare !== undefined ? '1fr auto auto' : '1fr auto',
        alignItems: 'baseline', gap: 'var(--space-4)',
        padding: 'var(--space-3) 0',
      }}
    >
      <span
        style={{
          fontSize: emphasis || total ? 'var(--text-body)' : 'var(--text-label)',
          fontWeight: total ? 700 : 400,
          color: total || emphasis ? 'var(--paper)' : 'var(--paper-dim)',
        }}
      >
        {label}
      </span>
      {compare !== undefined && (
        <span className="num" style={{ color: 'var(--paper-mute)', fontSize: 'var(--text-label)' }}>
          {fmt(compare)}
        </span>
      )}
      <span style={{ textAlign: 'right' }}>
        <span
          className="num"
          style={{
            fontSize: total ? 'var(--text-title)' : 'var(--text-body)',
            fontWeight: total ? 700 : 500,
          }}
        >
          {fmt(value)}
        </span>
        {unit && (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-mute)', marginLeft: 2 }}>
            {unit}
          </span>
        )}
        {delta !== undefined && (
          <span
            className="num"
            style={{
              display: 'block', fontSize: 'var(--text-caption)',
              color: delta >= 0 ? 'var(--positive)' : 'var(--negative)',
            }}
          >
            {delta >= 0 ? '+' : '−'}
            {Math.abs(Math.round(delta)).toLocaleString('ja-JP')}
          </span>
        )}
        {suffix}
      </span>
    </div>
  );
}
