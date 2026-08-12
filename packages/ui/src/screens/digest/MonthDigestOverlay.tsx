/**
 * 月次ダイジェスト。docs/spec/screens/month-digest.md
 *
 * ★「翌月へ」を押した結果が、それまでどこにも出ていなかった。
 * マップの数字が静かに書き変わるだけなので、10回押しても何が起きたか分からない。
 *
 * **この画面は変化しか出さない。** 絶対値は主役ではない。
 * 数字は前月の値から数え上げる。0 から始めると
 * 「増えた」と「そもそも大きい」の区別がつかない。
 *
 * 何を出すかは sim の `monthDigest` が決めている。ここは並べて動かすだけ（CLAUDE.md §2）。
 */
import { useEffect, useRef, useState } from 'react';
import { monthLabel, type DigestLine, type GameEvent, type MonthDigest } from '@med/sim';
import { StarRating } from '../../components/StarRating';
import { compactMan, minutes, people } from '../../format';

/** 行が立ち上がる間隔。速すぎると同時に見えて、遅いと月送りが重くなる */
const LINE_STAGGER_MS = 80;
const COUNT_UP_MS = 520;
/** 出来事が無いときだけ自動で閉じる。読ませたいものが出ているなら消さない */
const AUTO_DISMISS_MS = 2600;

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function MonthDigestOverlay({
  digest,
  answerableMonth,
  onChoose,
  onDismiss,
}: {
  digest: MonthDigest;
  /**
   * この月のイベントだけ答えられる。
   * ★まとめて進んだとき、途中の月のイベントには答えられない
   * （進んだ分は確定。docs/spec/08-decisions.md §3）
   */
  answerableMonth?: number;
  onChoose?: (key: string, choiceId: string) => void;
  onDismiss: () => void;
}) {
  const still = reduceMotion();
  /** 選択を迫るイベントが残っているあいだは、タップで閉じない */
  const pending = digest.events.some(
    (e) => e.choices && e.month === answerableMonth && !e.answered,
  );

  useEffect(() => {
    if (digest.events.length > 0) return;
    const timer = setTimeout(onDismiss, still ? 1200 : AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [digest, onDismiss, still]);

  return (
    <div
      data-testid="month-digest"
      role="button"
      tabIndex={0}
      aria-label="閉じる"
      onClick={() => {
        if (!pending) onDismiss();
      }}
      onKeyDown={(e) => {
        if (!pending && (e.key === 'Enter' || e.key === ' ')) onDismiss();
      }}
      className={still ? undefined : 'digest-veil'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        /*
          ★中央寄せは**内側の箱でやる。**
          スクロールする flex コンテナに justify-content: center を掛けると、
          中身が画面より高いときに上端がはみ出したまま辿り着けなくなる。
          出来事が増えた瞬間にこれを踏んだ。
        */
        display: 'block',
        padding: 'var(--space-6) var(--space-4)',
        paddingTop: 'calc(var(--space-6) + var(--safe-top))',
        paddingBottom: 'calc(var(--space-6) + var(--safe-bottom))',
        /* 下の画面が透けると数字が読めない。ここは読ませる画面なので、ほぼ塗り潰す */
        background: 'rgba(8, 12, 16, 0.975)',
        backdropFilter: 'blur(3px)',
        color: 'var(--paper)',
        fontFamily: 'var(--font-ui)',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
      <div className={still ? undefined : 'digest-head'} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>
          {monthLabel(digest.month)}
          {digest.spanMonths > 1 && (
            <span style={{ marginLeft: 6 }}>（{digest.spanMonths}ヶ月ぶん）</span>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            marginTop: 4,
            color: 'var(--star)',
          }}
        >
          {digest.headline}
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        {digest.lines.map((line, i) => (
          <DigestRow key={line.id} line={line} index={i} still={still} />
        ))}
      </div>

      {digest.events.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          {digest.events.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              delay={(digest.lines.length + i) * LINE_STAGGER_MS}
              still={still}
              onChoose={
                event.month === answerableMonth && onChoose
                  ? (choiceId) => onChoose(event.choiceKey!, choiceId)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 'var(--space-6)',
          textAlign: 'center',
          fontSize: 'var(--text-caption)',
          color: 'var(--paper-mute)',
        }}
      >
        {pending ? '選んでください。答えないと既定の側に倒れます' : 'タップで閉じる'}
      </div>
      </div>
    </div>
  );
}

/**
 * 出来事のカード。**選択肢があるときは訊く。**
 * docs/spec/08-decisions.md §2
 */
function EventCard({
  event,
  delay,
  still,
  onChoose,
}: {
  event: GameEvent;
  delay: number;
  still: boolean;
  onChoose?: (choiceId: string) => void;
}) {
  const tone =
    event.severity === 'critical' ? 'critical' : event.severity === 'warning' ? 'warning' : 'hq-accent';

  return (
    <div
      className={still ? undefined : 'digest-line'}
      style={{
        animationDelay: `${delay}ms`,
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-2)',
        borderRadius: 'var(--radius-md)',
        borderLeft: `3px solid var(--${tone})`,
        background: 'var(--ink-800)',
      }}
    >
      <div style={{ fontSize: 'var(--text-label)', fontWeight: 600 }}>{event.title}</div>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--paper-dim)',
          lineHeight: 1.6,
          marginTop: 2,
        }}
      >
        {event.body}
      </div>

      {event.choices && event.choices.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {event.choices.map((choice) => {
            const decided = event.answered === true;
            const picked = event.answered === true && event.chosen === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                data-testid={`choice-${event.choiceKey}-${choice.id}`}
                disabled={!onChoose}
                onClick={(e) => {
                  // 背景のタップで閉じる作りなので、ここで止めないと選んだ瞬間に消える
                  e.stopPropagation();
                  onChoose?.(choice.id);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  // ★選んだ方を強く、選ばなかった方を薄く。
                  // どちらも同じ濃さだと、決めたのかどうかが画面から読めない
                  border: `1px solid ${picked ? 'var(--positive)' : 'var(--ink-600)'}`,
                  background: picked ? 'rgba(78, 160, 116, 0.14)' : 'var(--ink-900)',
                  color: 'var(--paper)',
                  opacity: decided && !picked ? 0.4 : 1,
                  cursor: onChoose ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    fontSize: 'var(--text-label)',
                    fontWeight: 600,
                    color: picked ? 'var(--positive)' : 'var(--paper)',
                  }}
                >
                  {picked && <span aria-hidden>✓</span>}
                  {choice.label}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--paper-mute)',
                    lineHeight: 1.5,
                    marginTop: 2,
                  }}
                >
                  {choice.detail}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DigestRow({ line, index, still }: { line: DigestLine; index: number; still: boolean }) {
  const delay = index * LINE_STAGGER_MS;
  const value = useCountUp(line.from, line.value, still ? 0 : COUNT_UP_MS, delay);
  const delta = formatDelta(line);
  // 増減の善し悪しは sim が持っている。ここで「待ち時間は増えたら赤」と書かない。
  // ★「±0」と出しているのに色が付いていると、動いていないのに動いたように見える
  const good = delta.startsWith('±') ? null : line.delta > 0 === line.higherIsBetter;

  return (
    <div
      className={still ? undefined : 'digest-line'}
      style={{
        animationDelay: `${delay}ms`,
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <span style={{ fontSize: 'var(--text-label)', color: 'var(--paper-dim)' }}>{line.label}</span>
      <DigestValue unit={line.unit} value={value} />
      <span
        className="num"
        style={{
          minWidth: 64,
          textAlign: 'right',
          fontSize: 'var(--text-label)',
          color:
            good === null ? 'var(--paper-mute)' : good ? 'var(--positive)' : 'var(--negative)',
        }}
      >
        {delta}
      </span>
    </div>
  );
}

function DigestValue({ unit, value }: { unit: DigestLine['unit']; value: number }) {
  if (unit === 'stars') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <StarRating value={value} size={16} />
      </span>
    );
  }
  return (
    <span
      className="num"
      style={{ fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      {unit === 'people' ? people(value) : unit === 'man' ? compactMan(value) : minutes(value)}
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 500, marginLeft: 1 }}>
        {unit === 'people' ? '人' : unit === 'man' ? '円' : '分'}
      </span>
    </span>
  );
}

/** 増減の表示。単位ごとに桁が違うので、丸め方だけ分ける */
function formatDelta(line: DigestLine): string {
  const sign = line.delta > 0 ? '+' : '−';
  const abs = Math.abs(line.delta);
  if (line.unit === 'stars') return abs < 0.05 ? '±0' : `${sign}${abs.toFixed(1)}`;
  if (line.unit === 'minutes') return abs < 0.05 ? '±0分' : `${sign}${abs.toFixed(1)}分`;
  if (Math.round(abs) === 0) return line.unit === 'people' ? '±0人' : '±0円';
  // ★人に compactMan を使うと「+9万人」になる。万は金額の単位であって人数の単位ではない
  if (line.unit === 'people') return `${sign}${people(abs)}人`;
  return `${sign}${compactMan(abs)}円`;
}

/**
 * 前月の値から今月の値へ数え上げる。
 * ★ここが sim ではなく UI に居てよい理由：これは「見せ方」であって、計算ではない。
 * 始点も終点も sim が持ってきた値で、間を補間しているだけ。
 */
function useCountUp(from: number, to: number, duration: number, delay: number): number {
  const [value, setValue] = useState(duration === 0 ? to : from);
  const frame = useRef<number>();

  useEffect(() => {
    if (duration === 0) {
      setValue(to);
      return;
    }
    setValue(from);
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      // ease-out。終盤で止まって見える方が、読む時間が取れる
      setValue(from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [from, to, duration, delay]);

  return value;
}
