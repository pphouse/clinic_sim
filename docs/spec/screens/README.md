# 画面仕様一覧

シム核が凍ってから、1画面 = 1ワークツリーで並列に実装する。

| ScreenId | 画面 | 領域色 | ステータス |
|---|---|---|---|
| [`map`](screens/map.md) | マップ | `-` | **実装済み** |
| [`hq`](screens/hq.md) | 本社 | `hq` | **実装済み** |
| [`clinic`](screens/clinic.md) | 診療所 | `hq` | **実装済み** |
| [`igyoku`](screens/igyoku.md) | 医局 | `igyoku` | **実装済み** |
| [`agency`](screens/agency.md) | 紹介会社 | `agency` | **実装済み** |
| [`medicalAssociation`](screens/medicalAssociation.md) | 地域医師会 | `shikai` | **実装済み** |
| [`referralHospital`](screens/referralHospital.md) | 連携基幹病院 | `hospital` | **実装済み** |
| [`careManager`](screens/careManager.md) | ケアマネ・地域包括 | `hospital` | **実装済み** |
| [`bureau`](screens/bureau.md) | 厚生局 | `bureau` | **実装済み** |
| [`pharmacy`](screens/pharmacy.md) | 門前薬局 | `pharmacy` | **実装済み** |
| [`nursingSchool`](screens/nursingSchool.md) | 看護学校 | `school` | **実装済み** |
| [`bank`](screens/bank.md) | 銀行 | `bank` | **実装済み** |
| [`realEstate`](screens/realEstate.md) | 不動産 | `bank` | **実装済み** |
| [`accounting`](screens/accounting.md) | 経理 | `hq` | **実装済み** |
| [`personnel`](screens/personnel.md) | 人事 | `hq` | **実装済み** |
| [`personalWealth`](screens/personalWealth.md) | 個人資産 | `hq` | **実装済み** |
| [`vendor`](screens/vendor.md) | システム・機器商社 | `vendor` | **実装済み** |

## 実装の順序

0. **map** — 根。ここだけモーダルではない。全社の現在地と、各院への入口
1. **clinic** — ★最初の1枚。中核ループの手触りをここで確かめる
2. **igyoku** + **agency** — 2つで1セット。トレードオフが主題なので同時に作る
3. **accounting** — 三表。sim の会計レイヤーが正しいかがここで露見する
4. **vendor** — 電子カルテの移行が「自分で起こす医師不足」として効くか確かめる
5. 残り13画面 — 並列

`clinic` が面白くなければ残りを作っても面白くならない。ここで止まる勇気を持つこと。

## 全画面が実装済み

15画面すべてに中身がある。`test/screens.test.ts` が
**台帳（registry）と中身の対応**を検証しているので、
新しい ScreenId を足して台帳に書き忘れると試験が落ちる。

## 操作を持つ画面と、読むだけの画面

| 操作を持つ | 何を決めるか |
|---|---|
| 診療所 | 常勤医の増減 |
| マップ | 分院の候補地を選ぶ・月を進める |
| 開院 | **どの科で開くか**（`05-specialty.md` §7） |
| 医局 | 維持費の支払い・当直の派遣 |
| 紹介会社 | 枠の確保 |
| 看護学校 | 開校 |
| 厚生局 | 加算の取得 |
| 銀行 | 借入 |
| 地域医師会・連携基幹病院・ケアマネ | 活動の継続 |
| 門前薬局 | 誘致 |
| 機器商社 | カルテ移行・機器・AI・保守 |
| 不動産 | 物件の取得 |
| 個人資産 | 役員報酬・見栄資産 |

| 読むだけ | 理由 |
|---|---|
| 本社 | 全社の現在地。意思決定はそれぞれの建物で行う |
| 経理 | 三表。結果を読む場所 |
| 人事 | 医師の配置は診療所画面（そこでしか結果が見えない） |

**操作は「結果が見える場所」に置く。** 医師の増減を人事画面に置かないのは、
待ち時間と患者ストックが診療所画面にしかないから。

## 月の進め方

★**未来は見せない。** `currentMonth` までしか表示せず、
意思決定は `currentMonth` にしか書けない。過去へは戻れるが読むだけ。

このゲームの主題は遅延（壊すのは一瞬、直すのは何年）で、
120ヶ月目を見てから13ヶ月目に戻れるなら判断そのものが要らなくなる。
終局したあとはタイムラインを開放する。因果の確認は終わってからでいい。
