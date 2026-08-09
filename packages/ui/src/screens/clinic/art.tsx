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
import tabIncome from '../../assets/tab-income.svg';
import tabOverview from '../../assets/tab-overview.svg';
import tabPatients from '../../assets/tab-patients.svg';
import clinicIllustration from '../../assets/clinic-illustration.svg';
import managerPortrait from '../../assets/manager-portrait.svg';

/** イラスト帯の高さ。ScreenShell はこの高さをそのまま帯にする */
export const ILLUSTRATION_HEIGHT = 172;

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
      {/*
        台詞が乗る左側だけを沈める。素材の側で空けてあるとはいえ、
        月によって建物の見え方が変わるので、文字の下地は常に確保しておく
      */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(100deg, rgba(14,20,25,0.92) 0%, rgba(14,20,25,0.78) 34%, rgba(14,20,25,0.12) 62%, rgba(14,20,25,0) 78%)',
        }}
      />
      {waiting > 0 && (
        <svg
          viewBox="0 0 390 172"
          width="100%"
          height={ILLUSTRATION_HEIGHT}
          aria-hidden
          style={{ position: 'absolute', inset: 0 }}
        >
          {Array.from({ length: waiting }, (_, i) => (
            <g key={i} transform={`translate(${44 + i * 14} ${158 - (i % 2) * 4})`} opacity="0.92">
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
      height={112}
      style={{ display: 'block', height: 112, width: 'auto', marginRight: 4 }}
    />
  );
}

/**
 * 下タブのアイコン。
 *
 * 線画ではなくアイソメの立体ミニチュアにしている。線画は軽くて、
 * 情報密度の高い画面の底に敷くと「仮置き」に見える。**物として存在させる。**
 * 生成条件は assets/README.md。
 */
const TAB_ICONS = {
  overview: tabOverview,
  patients: tabPatients,
  income: tabIncome,
} as const;

export function TabIcon({ kind }: { kind: keyof typeof TAB_ICONS }) {
  return <img src={TAB_ICONS[kind]} alt="" width={27} height={27} style={{ display: 'block' }} />;
}
