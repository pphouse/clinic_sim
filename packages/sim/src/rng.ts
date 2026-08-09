/**
 * 決定的な乱数。mulberry32。
 * Math.random() を使うとテストが再現せず、セーブデータもリプレイも壊れる。
 */
import type { Rng } from './types';

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),
    chance: (p) => next() < p,
  };
}
