/**
 * 競合の詳細。docs/spec/screens/map.md「競合の詳細」
 *
 * ★この画面の唯一の仕事は「**勝てるのか**」に答えること。
 * 強さと自院の魅力を並べ、押し込みの残り月数を出す。
 * 商圏の需要を出すのは、取ったらいくらになるかが判断の材料だから。
 *
 * 全画面差し替え（CLAUDE.md §5）。計算は sim の competitorDetail が済ませている。
 */
import {
  COMPETITOR_EXIT_SHARE,
  monthLabel,
  type CompetitorDetail,
} from '@med/sim';
import { Note, SectionTitle } from '../../components/Section';
import { StatRow } from '../../components/StatRow';
import { people, percent } from '../../format';

export function CompetitorScreen({
  detail,
  currentMonth,
  onClose,
}: {
  detail: CompetitorDetail;
  currentMonth: number;
  onClose: () => void;
}) {
  const stronger = detail.ownAttractiveness > detail.strength;
  const pushing = detail.monthsToExit !== null;

  return (
    <div
      data-testid="competitor-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-900)',
        color: 'var(--paper)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <header
        style={{
          height: `calc(var(--header-height) + var(--safe-top))`,
          paddingTop: 'var(--safe-top)',
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 44px',
          alignItems: 'center',
          padding: '0 var(--space-3) 0 var(--space-4)',
          borderBottom: '1px solid rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-title)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {detail.name}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
            {detail.districtName}　{detail.specialtyName}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--icon btn--quiet"
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <SectionTitle>力比べ</SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) 0',
          }}
        >
          <Side
            label="この競合"
            value={detail.strength}
            share={detail.share}
            tone={stronger ? undefined : 'critical'}
          />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-mute)' }}>vs</span>
          <Side
            label={detail.ownClinics.length > 0 ? '自院の合計' : '自院なし'}
            value={detail.ownAttractiveness}
            share={detail.ownShare}
            tone={stronger ? 'positive' : undefined}
            align="right"
          />
        </div>
        <Note>
          この数字が<strong>魅力</strong>。競合は固定値、自院は
          <strong>評判 × 待ち時間 × 医師数</strong>で毎月動く。
          シェアは魅力の取り分そのままなので、
          <strong>医師を増やして待ち時間を縮めれば取り分が増える。</strong>
        </Note>

        <SectionTitle>押し出せるか</SectionTitle>
        {detail.ownClinics.length === 0 ? (
          <Note>
            この商圏のこの科に自院がありません。
            <strong>誰も押していないので、この競合は出ていきません。</strong>
            同じ商圏でも科が違えば食い合わないので、押すには
            <strong>{detail.specialtyName}で出す</strong>必要があります。
          </Note>
        ) : (
          <>
            <StatRow
              label="撤退のしきい値"
              value={percent(COMPETITOR_EXIT_SHARE, 0)}
              unit="%"
              compare={`いま ${percent(detail.share, 0)}%`}
            />
            <StatRow
              label="出ていくまで"
              value={pushing ? String(detail.monthsToExit) : '—'}
              unit={pushing ? 'ヶ月' : ''}
              emphasis={pushing}
            />
            <Note>
              {pushing ? (
                <>
                  <strong>押し込めています。</strong>
                  シェアを {percent(COMPETITOR_EXIT_SHARE, 0)}% 未満に保ち続ければ、
                  あと {detail.monthsToExit} ヶ月で出ていきます。
                  <strong>途中で緩めると数えは 0 に戻ります。</strong>
                </>
              ) : (
                <>
                  まだ押し込めていません。相手のシェアを{' '}
                  {percent(COMPETITOR_EXIT_SHARE, 0)}% 未満に落として、
                  そこから丸 {'1年半'} 保つ必要があります。
                  過剰な人件費を払って相手のシェアを丸ごと取りにいく投資です。
                </>
              )}
            </Note>
          </>
        )}

        <SectionTitle>この商圏</SectionTitle>
        <StatRow
          label="独占したときの月の新規"
          value={people(detail.segmentDemand)}
          unit="人"
        />
        <StatRow label="自院の取り分" value={percent(detail.ownShare, 0)} unit="%" />
        <StatRow label="開業" value={monthLabel(detail.openedAtMonth)} />
        {detail.openedAtMonth > 1 && (
          <Note>
            この競合は<strong>プレイ中に入ってきました。</strong>
            競合は儲かっているところに来ます。空いた科を見つけて放置、はできません。
          </Note>
        )}

        {detail.rivals.length > 1 && (
          <>
            <SectionTitle>同じ市場の競合</SectionTitle>
            {detail.rivals.map((r) => (
              <StatRow
                key={r.id}
                label={r.name}
                value={percent(r.share, 0)}
                unit="%"
                compare={`強さ ${Math.round(r.strength)}`}
                emphasis={r.id === detail.id}
              />
            ))}
          </>
        )}

        {detail.ownClinics.length > 0 && (
          <>
            <SectionTitle>この市場の自院</SectionTitle>
            {detail.ownClinics.map((c) => (
              <StatRow
                key={c.id}
                label={c.name}
                value={percent(c.share, 0)}
                unit="%"
                compare={`魅力 ${Math.round(c.attractiveness)}`}
              />
            ))}
          </>
        )}
        <div style={{ height: 'var(--safe-bottom)' }} />
      </div>
    </div>
  );
}

function Side({
  label,
  value,
  share,
  tone,
  align = 'left',
}: {
  label: string;
  value: number;
  share: number;
  tone?: 'positive' | 'critical';
  align?: 'left' | 'right';
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div
        className="num"
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.05,
          color: tone ? `var(--${tone})` : 'var(--paper)',
        }}
      >
        {Math.round(value)}
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)', marginTop: 2 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-mute)' }}>
        シェア {percent(share, 0)}%
      </div>
    </div>
  );
}
