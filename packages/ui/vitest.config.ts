/**
 * UI の試験。**描画そのものは見ない**（それは e2e/play.mjs の仕事）。
 * ここで拾うのは typecheck を通ってしまう種類の壊れ方：
 * 台帳と中身の食い違い、通知の行き先、壊れたセーブ。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
