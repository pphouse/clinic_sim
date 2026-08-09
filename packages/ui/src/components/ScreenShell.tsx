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
import type { ReactNode } from 'react';

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
  tabs?: ShellTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}

export function ScreenShell({
  domain, title, subtitle, icon, illustration, portrait, greeting,
  tabs, activeTabId, onTabChange, onClose, children,
}: ScreenShellProps) {
  const surface = `var(--${domain}-surface)`;
  const accent = `var(--${domain}-accent)`;

  return (
    <div
      className="screen-shell"
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        background: surface, color: 'var(--paper)', fontFamily: 'var(--font-ui)',
      }}
    >
      <header
        style={{
          height: 'var(--header-height)', flexShrink: 0,
          display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center',
          padding: '0 var(--space-3)', gap: 'var(--space-2)',
        }}
      >
        <div aria-hidden style={{ width: 36, height: 36 }}>{icon}</div>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 600,
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
          onClick={onClose}
          aria-label="閉じる"
          style={{
            background: 'none', border: 'none', color: 'var(--paper)',
            fontSize: 24, cursor: 'pointer', padding: 'var(--space-2)',
            justifySelf: 'end', lineHeight: 1,
          }}
        >
          ×
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
          flex: 1, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: 'var(--space-4)',
          paddingBottom: `calc(var(--tabbar-height) + var(--safe-bottom) + var(--space-4))`,
        }}
      >
        {children}
      </main>

      {tabs && tabs.length > 0 && (
        <nav
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
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
                onClick={() => onTabChange?.(tab.id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  background: active ? 'var(--ink-800)' : 'transparent',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  color: active ? accent : 'var(--paper-dim)',
                  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-caption)',
                }}
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
