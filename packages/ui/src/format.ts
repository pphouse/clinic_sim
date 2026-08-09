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
