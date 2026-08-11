/**
 * 表示の整形だけ。**計算はしない**（CLAUDE.md §2）。
 * 「割る」「引く」が要るなら sim に derive を足す。ここは桁区切りと単位だけ。
 */
export const people = (v: number): string => Math.round(v).toLocaleString('ja-JP');

export const visits = (v: number): string => Math.round(v).toLocaleString('ja-JP');

export const minutes = (v: number): string => v.toFixed(1);

export const points = (v: number): string => v.toFixed(1);

/** 0〜1 の率を % 文字列に。丸めるだけで、意味のある計算ではない */
export const percent = (v: number, digits = 1): string => (v * 100).toFixed(digits);

/** 万円。負値は会計慣習どおり括弧書き */
export const man = (v: number): string =>
  v < 0
    ? `(${Math.abs(Math.round(v)).toLocaleString('ja-JP')})`
    : Math.round(v).toLocaleString('ja-JP');

/**
 * 万円を桁に応じて億／万で丸める。
 * 全社の金額は万円のままだと桁が読めない（−14,987万 より −1.5億 の方が速い）。
 */
export const compactMan = (v: number): string => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}億`;
  return `${sign}${Math.round(abs).toLocaleString('ja-JP')}万`;
};

/** 増減の表示。0 は ±0。+0 と出すと動いたように見える */
export const formatSignedMan = (v: number, unit: string): string => {
  const rounded = Math.round(v);
  if (rounded === 0) return `±0${unit}`;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('ja-JP')}${unit}`;
};
