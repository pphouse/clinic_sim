/**
 * シム核に副作用が無いことを機械的に守る（CLAUDE.md §1）。
 *
 * この制約が崩れるとテストが再現しなくなり、セーブデータとリプレイが壊れる。
 * レビューで気づける類の事故ではないので、テストで落とす。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /Math\.random\s*\(/, reason: '乱数は createRng(seed) からのみ取得する' },
  { pattern: /\bnew Date\b/, reason: '時刻は四半期インデックスで表す' },
  { pattern: /\bDate\.now\s*\(/, reason: '時刻は四半期インデックスで表す' },
  { pattern: /\bfetch\s*\(/, reason: 'シム核は I/O を持たない' },
  { pattern: /\bdocument\./, reason: 'シム核は DOM を知らない' },
  { pattern: /\bwindow\./, reason: 'シム核は DOM を知らない' },
  { pattern: /from ['"](react|node:fs|node:path|fs|path)['"]/, reason: 'シム核は React と I/O を import しない' },
];

function sourceFiles(): string[] {
  return readdirSync(SRC)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(SRC, f));
}

/**
 * コメントは対象外にする。
 * 「Math.random() を使わない」と書いてあるコメントで落とすと、
 * ルールを書き残せなくなって本末転倒になる。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('シム核の純粋性', () => {
  it('src 配下のファイルを走査できている', () => {
    expect(sourceFiles().length).toBeGreaterThan(5);
  });

  for (const { pattern, reason } of FORBIDDEN) {
    it(`${pattern.source} を含まない — ${reason}`, () => {
      for (const file of sourceFiles()) {
        const source = stripComments(readFileSync(file, 'utf8'));
        expect(pattern.test(source), `${file} が ${pattern.source} を含んでいる`).toBe(false);
      }
    });
  }
});

describe('決定的な乱数', () => {
  it('同じ種からは同じ列が出る', () => {
    const a = Array.from({ length: 8 }, () => createRng(42).next());
    const rng = createRng(42);
    const b = Array.from({ length: 8 }, () => rng.next());
    expect(a[0]).toBe(b[0]);
    expect(new Set(b).size).toBe(8);
  });

  it('種が違えば列も違う', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('0〜1 の範囲に収まる', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は範囲内に収まる', () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
    }
  });

  it('chance(0) は常に false、chance(1) は常に true', () => {
    const rng = createRng(11);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});
