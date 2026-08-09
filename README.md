# 医療グループ経営シミュレーション

日本の診療所チェーンを経営するモバイルゲーム。Coffee Inc の情報密度を、
日本の保険診療の制度制約に置き換える。

## 中核

**患者はフローではなくストック。** コーヒーの客は毎回ゼロから獲得するが、
慢性疾患の患者は月1回通い続ける。だから経営は売上を作るゲームではなく、
**通院患者という資産を積んで守るゲーム**になる。

```
診察枠が足りない → 待ち時間が伸びる → 評判が落ちる
  → 4四半期後に患者ストックが減る → 収益が落ちてから気づく
```

## 現在地

- [x] シミュレーションモデルの検証（表計算で40四半期）
- [x] ゴールデンテスト用データの固定
- [x] **シム核の実装** — 40四半期が自走し、ゴールデンテストが全て緑
- [x] **診療所画面 1 枚で手触りを確認** — 操作できるプロトタイプまで
- [ ] ← いまここ。**手触りの判定**。面白くなければ残り15画面は作らない
- [ ] 残り 15 画面を並列実装

シム核は意思決定の列（`BASELINE_SCENARIO`）だけを入力に 40 四半期を回す。

```ts
import { runSimulation, deriveGroupTotals } from '@med/sim';

const { quarters } = runSimulation();
quarters[6].clinics[0].waitMinutes;   // 53.19 分。既定シナリオの待ち時間ピーク
deriveGroupTotals(quarters[39]);      // 全社の集計。UI はここを読む
```

## セットアップ

```bash
pnpm install
pnpm test        # ゴールデンテストが緑であることを常に確認する
pnpm typecheck
```

### 画面を動かす

```bash
pnpm --filter @med/ui dev     # http://127.0.0.1:5173/ 縦持ち 390×844 で見る
```

実装済みの画面は**診療所だけ**。マップも本社もまだ無い。

```bash
node packages/ui/e2e/tour.mjs # 操作を録画して e2e-out/ に出す（別シェルで dev を起動しておく）
```

このツアーは見た目の確認ではなく、**中核ループが操作で体感できるか**を見るためのもの。
Q5 に医師を1名戻すと、Q7 の待ち時間と Q11 の患者ストックがどう変わるかを往復して見せる。

## ドキュメント

| | |
|---|---|
| [CLAUDE.md](CLAUDE.md) | **開発ルール。最初に読む** |
| [docs/spec/01-simulation-core.md](docs/spec/01-simulation-core.md) | 因果の鎖と検証済みの挙動 |
| [docs/spec/02-accounting.md](docs/spec/02-accounting.md) | P/L・B/S・C/F |
| [docs/spec/screens/](docs/spec/screens/README.md) | 16 画面の仕様 |

## 数値について

全ての定数は表計算で構築した検証モデルの前提値であり、**仮置き**。
実在の診療報酬点数・給与水準・学費ではない。
