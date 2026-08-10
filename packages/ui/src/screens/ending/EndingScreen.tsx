/**
 * 終局。10年が終わったか、目標に届いたか、落ちたか。
 *
 * ★終わったあとに**タイムラインを開放する**のがこの画面の裏の仕事。
 * 遊んでいる最中は未来を見せない（見えていたら遅延が痛みにならない）が、
 * 終わったあとは全部見せていい。むしろ見せないと、
 * 「あのとき医師を1人減らしたのが31ヶ月目に効いた」という因果を確認できない。
 */
import { monthLabel, type EndState, type GoalProgress } from '@med/sim';
import { HeroRow, HeroStat, Note, SectionTitle } from '../../components/Section';
import { StatRow } from '../../components/StatRow';
import { compactMan, man, people } from '../../format';

const REASON_LEAD: Record<string, string> = {
  goal: '目標に到達しました',
  timeUp: '10年が終わりました',
  bankrupt: '債務超過が1年続き、法人が立ち行かなくなりました',
};

function goalValueText(g: GoalProgress): string {
  if (g.unit === '人') return `${people(g.value)}人`;
  return `${man(g.value)}万円`;
}

export function EndingScreen({
  end,
  goals,
  onReview,
  onRestart,
}: {
  end: EndState;
  goals: GoalProgress[];
  onReview: () => void;
  onRestart: () => void;
}) {
  const achieved = goals.filter((g) => g.achieved);

  return (
    <div
      data-testid="ending-screen"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-900)',
        color: 'var(--paper)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6) var(--space-4)' }}>
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0 var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
            {end.month !== null ? monthLabel(end.month) : ''}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.3,
              margin: 'var(--space-3) 0',
              color: end.reason === 'bankrupt' ? 'var(--critical)' : 'var(--star)',
            }}
          >
            {end.title}
          </div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--paper-dim)', lineHeight: 1.7 }}>
            {REASON_LEAD[end.reason ?? 'timeUp']}
          </div>
        </div>

        <HeroRow>
          {goals.map((g) => (
            <HeroStat
              key={g.id}
              label={g.name}
              value={String(Math.round(g.ratio * 100))}
              unit="%"
              tone={g.achieved ? 'positive' : undefined}
            />
          ))}
        </HeroRow>

        <SectionTitle>10年の結果</SectionTitle>
        {goals.map((g) => (
          <StatRow
            key={g.id}
            label={g.name}
            value={goalValueText(g)}
            compare={g.unit === '人' ? `${people(g.target)}人` : `${man(g.target)}万円`}
            emphasis={g.achieved}
          />
        ))}
        <Note>
          左が到達点、右が目標。
          {achieved.length === 0
            ? ' どれにも届かなかった。3本は同じ財布を取り合うので、どれか1本に賭ける必要がある。'
            : ` ${achieved.map((g) => g.name).join('・')}に到達。`}
        </Note>

        {end.reason === 'bankrupt' && (
          <>
            <SectionTitle>何が起きたか</SectionTitle>
            <Note>
              債務超過が12ヶ月続きました。<strong>1ヶ月の谷では終わりません。</strong>
              大型投資の直後に現金が沈むのは正常で、そこで殺すと正しい投資が全部悪手になる。
              1年沈みっぱなしなら、それはもう谷ではないという判定です。
            </Note>
          </>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          paddingBottom: 'calc(var(--space-3) + var(--safe-bottom))',
          background: 'var(--ink-900)',
          borderTop: '1px solid var(--ink-600)',
        }}
      >
        <button type="button" className="btn" style={{ flex: 1 }} onClick={onReview}>
          10年を見直す
        </button>
        <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={onRestart}>
          もう一度
        </button>
      </div>
    </div>
  );
}
