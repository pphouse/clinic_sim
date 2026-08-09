/**
 * 診療所画面のアート。
 *
 * 実体は Higgsfield（Recraft V4.1 vector）で生成した SVG（`src/assets/`）。
 * 生成条件と後処理は `src/assets/README.md` に書いてある。
 *
 * ★イラスト帯の左上には ScreenShell が NPC の台詞を重ねる。
 * だから素材の側で「左上を空ける」構図にしてある。差し替えるときも同じ条件を守ること。
 */
import clinicIcon from '../../assets/clinic-icon.svg';
import clinicIllustration from '../../assets/clinic-illustration.svg';
import managerPortrait from '../../assets/manager-portrait.svg';

/** イラスト帯の高さ。ScreenShell はこの高さをそのまま帯にする */
export const ILLUSTRATION_HEIGHT = 190;

/** ヘッダの小さなアイコン */
export function ClinicIcon() {
  return <img src={clinicIcon} alt="" width={36} height={36} style={{ display: 'block' }} />;
}

/**
 * イラスト帯。
 *
 * 素材は静止画なので、混雑だけはコードで足す。**待合の人影の数が稼働率そのもの。**
 * 数字を読まなくても詰まっているのが分かる、というのがこの帯の仕事。
 */
export function ClinicIllustration({ crowding }: { crowding: number }) {
  const waiting = Math.min(9, Math.max(0, Math.round(crowding * 6)));
  return (
    <div
      style={{
        position: 'relative',
        height: ILLUSTRATION_HEIGHT,
        overflow: 'hidden',
        background: 'var(--ink-900)',
      }}
    >
      <img
        src={clinicIllustration}
        alt=""
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          // 帯より縦長なので下を残して切る。歩道と入口が見えていないと混雑が読めない
          objectFit: 'cover',
          objectPosition: '50% 100%',
        }}
      />
      {waiting > 0 && (
        <svg
          viewBox="0 0 390 190"
          width="100%"
          height={ILLUSTRATION_HEIGHT}
          aria-hidden
          style={{ position: 'absolute', inset: 0 }}
        >
          {Array.from({ length: waiting }, (_, i) => (
            <g key={i} transform={`translate(${44 + i * 14} ${176 - (i % 2) * 4})`} opacity="0.92">
              <circle cx="0" cy="0" r="3.1" fill="#131b22" />
              <path d="M-3.6 3.6 q3.6 -2 7.2 0 v9 h-7.2 Z" fill="#131b22" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/**
 * NPC の立ち絵。事務長。背景は取り込み時に外してある。
 *
 * 高さは建物より明確に低くする。同じ背丈で並べると、
 * 立ち絵が建物の前に立っているのか屋根に乗っているのか分からなくなる。
 */
export function ManagerPortrait() {
  return (
    <img
      src={managerPortrait}
      alt=""
      height={118}
      style={{ display: 'block', height: 118, width: 'auto', marginRight: 4 }}
    />
  );
}
