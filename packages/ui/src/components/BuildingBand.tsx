/**
 * 建物のイラスト帯。
 *
 * 診療所はアイソメの外観を1枚起こしたが、残りの建物ぶんを全部描くのは
 * いまやることではない。**領域色のグラデーションの上に、その建物のアイコンを
 * 大きく置く**だけで、帯としての役目（ここはどこかを示す）は果たせる。
 *
 * ScreenShell の台詞は左上に重なるので、アイコンは右へ寄せて左を空ける。
 * 差し替えるときも同じ条件を守ること。
 */
export const BUILDING_BAND_HEIGHT = 132;

export function BuildingBand({ icon }: { icon: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height: BUILDING_BAND_HEIGHT,
        overflow: 'hidden',
        background: `
          radial-gradient(120% 130% at 88% 120%,
            color-mix(in srgb, var(--screen-accent, var(--hq-accent)) 26%, transparent) 0%,
            transparent 62%),
          linear-gradient(180deg, var(--ink-900) 0%, var(--screen-surface, var(--ink-800)) 100%)
        `,
      }}
    >
      <img
        src={icon}
        alt=""
        style={{
          position: 'absolute',
          right: 18,
          bottom: -8,
          width: 118,
          height: 118,
          opacity: 0.95,
        }}
      />
      {/* 台詞の下地。左から沈める */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(100deg, rgba(14,20,25,0.9) 0%, rgba(14,20,25,0.7) 40%, rgba(14,20,25,0) 76%)',
        }}
      />
    </div>
  );
}
