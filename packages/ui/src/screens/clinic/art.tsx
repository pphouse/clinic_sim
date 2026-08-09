/**
 * 診療所画面のプレースホルダ・アート。
 *
 * ScreenShell は「アートが揃うまでは色ブロックで進める」前提で書かれている。
 * ここはその色ブロックの代わり。フラットなアイソメで、差し替え前提の暫定物。
 */

/** ヘッダの小さなアイコン */
export function ClinicIcon() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden>
      <path d="M18 5 L31 12 L18 19 L5 12 Z" fill="var(--hq-accent)" opacity="0.9" />
      <path d="M5 12 L18 19 L18 31 L5 24 Z" fill="var(--ink-700)" />
      <path d="M31 12 L18 19 L18 31 L31 24 Z" fill="var(--ink-600)" />
      <rect x="16" y="9.5" width="4" height="1.6" fill="var(--paper)" />
      <rect x="17.2" y="8.3" width="1.6" height="4" fill="var(--paper)" />
    </svg>
  );
}

/**
 * イラスト帯。混雑しているほど待合の人影が増える。
 *
 * **上半分は空けておく。** ScreenShell が NPC の台詞をここに重ねて描くので、
 * 建物を上に置くと文字が読めなくなる（left:0 right:30% top:16px の領域）。
 */
export function ClinicIllustration({ crowding }: { crowding: number }) {
  const people = Math.min(8, Math.max(0, Math.round(crowding * 6)));
  return (
    <svg viewBox="0 0 390 176" width="100%" height="176" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2733" />
          <stop offset="70%" stopColor="#111a22" />
          <stop offset="100%" stopColor="#0e1419" />
        </linearGradient>
      </defs>
      <rect width="390" height="176" fill="url(#sky)" />

      {/* 背景の街。低く置いて、台詞の帯にかからないようにする */}
      {[6, 40, 74, 292, 330, 364].map((x, i) => (
        <rect key={x} x={x} y={116 + (i % 3) * 10} width="24" height="60" fill="#151f28" />
      ))}

      {/* 診療所の建物（アイソメ）。帯の下半分にだけ置く */}
      <g transform="translate(112 92)">
        <path d="M56 0 L112 27 L56 54 L0 27 Z" fill="var(--hq-accent)" opacity="0.85" />
        <path d="M0 27 L56 54 L56 96 L0 69 Z" fill="#1c2731" />
        <path d="M112 27 L56 54 L56 96 L112 69 Z" fill="#141d25" />
        {[0, 1].map((r) =>
          [0, 1, 2].map((c) => (
            <path
              key={`${r}-${c}`}
              d={`M${10 + c * 14} ${38 + r * 15 + c * 7} l8 4 v9 l-8 -4 Z`}
              fill={r === 0 ? 'var(--warning)' : '#2b3a45'}
              opacity={r === 0 ? 0.7 : 1}
            />
          )),
        )}
        <g transform="translate(70 42)">
          <rect x="4" y="0" width="5" height="15" fill="var(--paper)" opacity="0.9" />
          <rect x="0.5" y="5" width="12" height="5" fill="var(--paper)" opacity="0.9" />
        </g>
      </g>

      {/* 待合の人影。混雑の指標そのもの */}
      {Array.from({ length: people }, (_, i) => (
        <g key={i} transform={`translate(${22 + i * 14} ${158 - (i % 2) * 4})`} opacity="0.9">
          <circle cx="0" cy="0" r="3.2" fill="var(--paper-mute)" />
          <path d="M-3.8 3.8 q3.8 -2 7.6 0 v9 h-7.6 Z" fill="var(--paper-mute)" />
        </g>
      ))}
    </svg>
  );
}

/** NPC の立ち絵。事務長 */
export function ManagerPortrait() {
  return (
    <svg viewBox="0 0 104 150" width="104" height="150" aria-hidden style={{ display: 'block' }}>
      <ellipse cx="52" cy="148" rx="34" ry="6" fill="#000" opacity="0.35" />
      {/* 白衣 */}
      <path d="M52 62 q26 6 30 34 l4 54 h-68 l4 -54 q4 -28 30 -34 Z" fill="#dfe6e2" />
      <path d="M52 62 l-9 26 l9 12 l9 -12 Z" fill="#c3cdc8" />
      <rect x="44" y="62" width="16" height="10" fill="#8d9a96" />
      {/* 顔 */}
      <circle cx="52" cy="44" r="19" fill="#e8c9a8" />
      <path d="M33 40 q4 -20 19 -20 q15 0 19 20 q-6 -9 -19 -9 q-13 0 -19 9 Z" fill="#2b2622" />
      <circle cx="45" cy="45" r="1.8" fill="#2b2622" />
      <circle cx="59" cy="45" r="1.8" fill="#2b2622" />
      <path d="M47 54 q5 3 10 0" stroke="#b98d6d" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
