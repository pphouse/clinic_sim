# 画面仕様：厚生局

> ステータス: **実装済み**
> 担当ブランチ: `feature/screen-bureau`
> ScreenId: `bureau`
> 領域色: `bureau`

## この画面の唯一の仕事

**加算の要件をいま満たしているか**を一覧で示す。このゲームの主戦場。

## 表示するデータ

sim から読む値だけを列挙する。UI で計算しない（CLAUDE.md §2）。

| 表示名 | sim のフィールド |
|---|---|
| 点数指数 | `FeeTick.feePointIndex` |
| 加算の合計 | `FeeTick.addonTotal` |
| 実効点数指数 | `FeeTick.effectiveFeeIndex` |
| 施設基準の現在値 | `StaffTick.doctorsTotal` / `nurseSufficiency` |
| 加算ごとの状態 | `FeeTick.addons[]`（有効／要件割れ／未取得） |
| 改定の一覧 | `FEE_REVISIONS` |

**加算ごとに要件（必要医師数・必要充足率）を併記する。**
「なぜ落ちたか」がその場で分からないと、要件割れがただの事故に見える。

## プレイヤーができること

加算の取得は投資の意思決定（`acquireAddons`）。現状はシナリオが持つ。

## やらないこと

- **改定の予測。** 検証で没になった方向性（CLAUDE.md §7）
- **個別指導・返還請求。** 未モデル化。入れるなら先に仕様へ
