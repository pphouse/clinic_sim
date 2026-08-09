# 画面仕様一覧

シム核が凍ってから、1画面 = 1ワークツリーで並列に実装する。

| ScreenId | 画面 | 領域色 | ステータス |
|---|---|---|---|
| [`map`](screens/map.md) | マップ | `-` | **実装済み** |
| [`hq`](screens/hq.md) | 本社 | `hq` | 未着手 |
| [`clinic`](screens/clinic.md) | 診療所 | `hq` | **実装済み** |
| [`igyoku`](screens/igyoku.md) | 医局 | `igyoku` | 未着手 |
| [`agency`](screens/agency.md) | 紹介会社 | `agency` | 未着手 |
| [`medicalAssociation`](screens/medicalAssociation.md) | 地域医師会 | `shikai` | 未着手 |
| [`referralHospital`](screens/referralHospital.md) | 連携基幹病院 | `hospital` | 未着手 |
| [`careManager`](screens/careManager.md) | ケアマネ・地域包括 | `hospital` | 未着手 |
| [`bureau`](screens/bureau.md) | 厚生局 | `bureau` | 未着手 |
| [`pharmacy`](screens/pharmacy.md) | 門前薬局 | `pharmacy` | 未着手 |
| [`nursingSchool`](screens/nursingSchool.md) | 看護学校 | `school` | 未着手 |
| [`vendor`](screens/vendor.md) | システム・機器商社 | `vendor` | 未着手 |
| [`bank`](screens/bank.md) | 銀行 | `bank` | 未着手 |
| [`realEstate`](screens/realEstate.md) | 不動産 | `bank` | 未着手 |
| [`accounting`](screens/accounting.md) | 経理 | `hq` | 未着手 |
| [`personnel`](screens/personnel.md) | 人事 | `hq` | 未着手 |
| [`personalWealth`](screens/personalWealth.md) | 個人資産 | `hq` | 未着手 |

## 実装の順序

0. **map** — 根。ここだけモーダルではない。全社の現在地と、各院への入口
1. **clinic** — ★最初の1枚。中核ループの手触りをここで確かめる
2. **igyoku** + **agency** — 2つで1セット。トレードオフが主題なので同時に作る
3. **accounting** — 三表。sim の会計レイヤーが正しいかがここで露見する
4. **vendor** — 電子カルテの移行が「自分で起こす医師不足」として効くか確かめる
5. 残り13画面 — 並列

`clinic` が面白くなければ残り15画面を作っても面白くならない。
ここで止まる勇気を持つこと。
