# 画面仕様一覧

シム核が凍ってから、1画面 = 1ワークツリーで並列に実装する。

| ScreenId | 画面 | 領域色 | ステータス |
|---|---|---|---|
| [`map`](screens/map.md) | マップ | `-` | **実装済み** |
| [`hq`](screens/hq.md) | 本社 | `hq` | **実装済み** |
| [`clinic`](screens/clinic.md) | 診療所 | `hq` | **実装済み** |
| [`igyoku`](screens/igyoku.md) | 医局 | `igyoku` | **実装済み** |
| [`agency`](screens/agency.md) | 紹介会社 | `agency` | **実装済み** |
| [`medicalAssociation`](screens/medicalAssociation.md) | 地域医師会 | `shikai` | 未着手 |
| [`referralHospital`](screens/referralHospital.md) | 連携基幹病院 | `hospital` | 未着手 |
| [`careManager`](screens/careManager.md) | ケアマネ・地域包括 | `hospital` | 未着手 |
| [`bureau`](screens/bureau.md) | 厚生局 | `bureau` | **実装済み** |
| [`pharmacy`](screens/pharmacy.md) | 門前薬局 | `pharmacy` | 未着手 |
| [`nursingSchool`](screens/nursingSchool.md) | 看護学校 | `school` | **実装済み** |
| [`vendor`](screens/vendor.md) | システム・機器商社 | `vendor` | 未着手 |
| [`bank`](screens/bank.md) | 銀行 | `bank` | **実装済み** |
| [`realEstate`](screens/realEstate.md) | 不動産 | `bank` | 未着手 |
| [`accounting`](screens/accounting.md) | 経理 | `hq` | **実装済み** |
| [`personnel`](screens/personnel.md) | 人事 | `hq` | **実装済み** |
| [`personalWealth`](screens/personalWealth.md) | 個人資産 | `hq` | 未着手 |

## 実装の順序

0. **map** — 根。ここだけモーダルではない。全社の現在地と、各院への入口
1. **clinic** — ★最初の1枚。中核ループの手触りをここで確かめる
2. **igyoku** + **agency** — 2つで1セット。トレードオフが主題なので同時に作る
3. **accounting** — 三表。sim の会計レイヤーが正しいかがここで露見する
4. **vendor** — 電子カルテの移行が「自分で起こす医師不足」として効くか確かめる
5. 残り13画面 — 並列

`clinic` が面白くなければ残りを作っても面白くならない。ここで止まる勇気を持つこと。

## 未着手の6画面について

残りは**シム核に対応するデータが一切無い**。作るには検証されていないゲーム機構を
新規に設計することになる。画面の問題ではなく、**モデルの問題**。

| 画面 | 何が無いか | 入れるなら先に決めること |
|---|---|---|
| 地域医師会 | 医師会という主体が無い | 何を差し出すと何が返るのか。関係値をもう1本増やす価値があるか |
| 連携基幹病院 | 紹介・逆紹介が無い | 紹介率が患者ストックにどう効くか。評判との違い |
| ケアマネ・地域包括 | 在宅の患者区分が無い | 外来と在宅を分けるのか。分けると患者ストックが2本になる |
| 門前薬局 | 賃料収入の口だけある（`rentalRevenue` は常に0） | 薬局を建てるのか誘致するのか。建てるなら不動産と重なる |
| システム・機器商社 | 定数だけある（`EMR_TIERS` / `AI_TOOLS`）。シミュレーションは無い | カルテ移行の枠低下を engine に通すか。**ここは通せば効く** |
| 不動産・個人資産 | 法人と個人の区別が無い | 個人資産を持つと役員報酬の判断が要る。ゲームが2階建てになる |

**このうち「システム・機器商社」だけは既に定数が置いてあり、
カルテ移行のペナルティを engine に通すだけで成立する**（`migrationCapacityPenalty`）。
診察枠が落ちる → 待ち時間 → 評判 → 1年後に患者ストック、という検証済みの経路を
そのまま通るので、新しい因果を発明しなくてよい。次に作るならここ。
