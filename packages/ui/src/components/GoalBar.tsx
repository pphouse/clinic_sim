/**
 * ゴールの進捗帯。マップの一番上に置く。
 *
 * **「何を目指しているか」が常に見えていないと、月を進める意味が分からない。**
 * 3本を並べるのは、どれか1本を選ばせるためではなく、
 * **1本を伸ばすと他が縮むのが見える**ようにするため。
 * 役員報酬を上げた翌月、資産家の帯が伸びて内部留保の帯が縮む。そこが主題。
 */
import type { GoalProgress } from '@med/sim';

const GOAL_COLOR: Record<string, string> = {
  personalWealth: 'var(--star)',
  scale: 'var(--hq-accent)',
  corporate: 'var(--positive)',
};

export function GoalBar({
  goals,
  onOpen,
}: {
  goals: GoalProgress[];
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="目標の詳細"
      data-testid="goal-bar"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${goals.length}, 1fr)`,
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-2) var(--space-4) var(--space-3)',
        background: 'transparent',
        border: 'none',
        cursor: onOpen ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {goals.map((g) => (
        <div key={g.id} style={{ minWidth: 0, textAlign: 'left' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
              {g.name}
            </span>
            <span
              className="num"
              style={{
                fontSize: 'var(--text-caption)',
                color: g.achieved ? GOAL_COLOR[g.id] : 'var(--paper-mute)',
                fontWeight: g.achieved ? 700 : 400,
              }}
            >
              {Math.round(g.ratio * 100)}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              marginTop: 3,
              borderRadius: 2,
              background: 'var(--ink-700)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${g.ratio * 100}%`,
                height: '100%',
                borderRadius: 2,
                background: GOAL_COLOR[g.id] ?? 'var(--hq-accent)',
                transition: 'width 240ms ease-out',
              }}
            />
          </div>
        </div>
      ))}
    </button>
  );
}
