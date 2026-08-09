/**
 * 全画面共通のシェル。
 *
 * Coffee Inc の全モーダルはこの構造を共有している。16画面それぞれを
 * デザインするのではなく、このシェルに中身を差し込む。
 *
 *   [アイコン] タイトル / 住所                    [×]
 *   ────────────────────────────
 *   アイソメイラスト  ＋ 右にNPCの立ち絵
 *   「こんにちは院長。今期の状況ですが……」
 *   ────────────────────────────
 *   （children：表・チャート・スライダー）
 *   ────────────────────────────
 *   [タブ] [タブ] [タブ] [タブ] [タブ]   ← 最大5個
 *
 * 画面ブランチではこのファイルを編集しない（CLAUDE.md §3）。
 * 変更が必要なら issue を立てて main で対応する。
 */
import type * as React from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

/** tokens.css の領域色に対応 */
export type Domain =
  | 'hq' | 'igyoku' | 'agency' | 'shikai'
  | 'hospital' | 'bureau' | 'bank' | 'pharmacy' | 'school';

export interface ShellTab {
  id: string;
  label: string;
  /** アートが揃うまでは色ブロックのプレースホルダで進める */
  icon: ReactNode;
  /** 未対応の通知件数。0 なら出さない */
  badge?: number;
}

export interface ScreenShellProps {
  domain: Domain;
  title: string;
  /** 住所や肩書き。Coffee Inc は実在の住所を出して現実感を作っている */
  subtitle?: string;
  /** ヘッダの小さなアイソメアイコン */
  icon: ReactNode;
  /** イラスト帯。アート未完成の間は単色ブロックを渡す */
  illustration?: ReactNode;
  /** NPC の立ち絵 */
  portrait?: ReactNode;
  /**
   * NPC の挨拶。状況に応じて変える。
   * 「こんにちは院長」ではなく「先月の待ち時間が 40 分を超えました」のように、
   * 今この画面で見るべきものを名指しする。
   */
  greeting?: string;
  /**
   * 操作卓。スクロール領域の外に、下タブのすぐ上へ固定で置かれる。
   *
   * ★children の中に sticky で置かないこと。スクロール領域の padding-bottom より
   * 上で止まってしまい、操作卓と下タブの隙間から本文が透ける。
   * 主要操作は画面下半分に置く決まりなので（CLAUDE.md §5）、シェル側の席を用意する。
   */
  dock?: ReactNode;
  tabs?: ShellTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}

export function ScreenShell({
  domain, title, subtitle, icon, illustration, portrait, greeting,
  dock, tabs, activeTabId, onTabChange, onClose, children,
}: ScreenShellProps) {
  const surface = `var(--${domain}-surface)`;
  const accent = `var(--${domain}-accent)`;
  /*
   * 領域の差し色を CSS 変数として下位へ流す。
   * こうしておくと、ボタンもグラフも罫線も「訪問先ごとに色が変わる」を
   * 各画面が意識せずに満たせる。医局＝藍、紹介会社＝琥珀、厚生局＝灰赤。
   */
  const domainVars = { '--screen-accent': accent, '--screen-surface': surface } as React.CSSProperties;

  return (
    <div
      className="screen-shell"
      style={{
        ...domainVars,
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        background: surface, color: 'var(--paper)', fontFamily: 'var(--font-ui)',
      }}
    >
      <header
        style={{
          height: 'var(--header-height)', flexShrink: 0,
          display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center',
          padding: '0 var(--space-3)', gap: 'var(--space-2)',
          borderBottom: '1px solid rgba(0,0,0,0.35)',
        }}
      >
        <div aria-hidden style={{ width: 36, height: 36 }}>{icon}</div>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
              {subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn--icon btn--quiet"
          onClick={onClose}
          aria-label="閉じる"
          style={{ justifySelf: 'end' }}
        >
          <CloseIcon size={18} />
        </button>
      </header>

      {(illustration || greeting) && (
        <div style={{ position: 'relative', flexShrink: 0, background: 'var(--ink-900)' }}>
          {illustration}
          {portrait && (
            <div style={{ position: 'absolute', right: 0, bottom: 0, pointerEvents: 'none' }}>
              {portrait}
            </div>
          )}
          {greeting && (
            <p
              style={{
                position: 'absolute', left: 0, right: '30%', top: 'var(--space-4)',
                margin: 0, padding: '0 var(--space-4)',
                fontSize: 'var(--text-body)', lineHeight: 1.6,
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}
            >
              {greeting}
            </p>
          )}
        </div>
      )}

      <main
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: 'var(--space-4)',
        }}
      >
        {children}
      </main>

      {dock}

      {tabs && tabs.length > 0 && (
        <nav
          style={{
            flexShrink: 0,
            height: `calc(var(--tabbar-height) + var(--safe-bottom))`,
            paddingBottom: 'var(--safe-bottom)',
            display: 'flex', background: 'var(--ink-900)',
            borderTop: '1px solid var(--ink-600)',
          }}
        >
          {tabs.slice(0, 5).map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                className="tabbar__item"
                onClick={() => onTabChange?.(tab.id)}
                aria-current={active ? 'page' : undefined}
                style={active ? { color: 'var(--screen-accent)' } : undefined}
              >
                <span aria-hidden style={{ width: 26, height: 26 }}>{tab.icon}</span>
                {tab.label}
                {tab.badge ? (
                  <span
                    aria-label={`未対応 ${tab.badge} 件`}
                    style={{
                      position: 'absolute', top: 6, right: '22%',
                      minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 8, background: 'var(--critical)',
                      color: '#fff', fontSize: 10, lineHeight: '16px',
                      fontFamily: 'var(--font-num)',
                    }}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
