# 画像素材

Higgsfield（Recraft V4.1 の `vector` モード）で生成した SVG。
ラスタではなくベクタなので、モバイルの等倍・2倍どちらでも潰れない。

## 生成条件

| ファイル | 比率 | 用途 |
|---|---|---|
| `clinic-illustration.svg` | 16:9 | 診療所画面のイラスト帯 |
| `manager-portrait.svg` | 3:4 | NPC（事務長）の立ち絵 |
| `clinic-icon.svg` | 1:1 | ヘッダのアイコン |
| `tab-overview.svg` | 1:1 | 下タブ「概要」＝聴診器 |
| `tab-patients.svg` | 1:1 | 下タブ「患者」＝人物3体 |
| `tab-income.svg` | 1:1 | 下タブ「収支」＝電卓と書類 |
| `map-district.svg` | 1:1 | マップ画面の街区（ピンの下地） |
| `tab-map.svg` | 1:1 | 地図アイコン（現状は未使用。マップが根なのでタブに出さない） |
| `icon-hq/accounting/personnel/igyoku/agency/school/bank/bureau.svg` | 1:1 | 建物アイコン（1次分） |
| `icon-shikai.svg` | 1:1 | 地域医師会＝瓦屋根の会館 |
| `icon-hospital.svg` | 1:1 | 連携基幹病院＝ヘリポート付きの病棟 |
| `icon-care.svg` | 1:1 | ケアマネ＝訪問車のある地域包括 |
| `icon-pharmacy.svg` | 1:1 | 門前薬局＝ガラス張りの小店舗 |
| `icon-vendor.svg` | 1:1 | 機器商社＝スキャナとサーバのある倉庫 |
| `icon-estate.svg` | 1:1 | 不動産＝鍵の立てかけられた店舗 |
| `icon-personal.svg` | 1:1 | 個人資産＝灯りの点いた邸宅 |

パレットは `design/tokens.css` の値をそのまま渡している。
`#6e8ca0`（hq accent）/ `#e8ede9`（paper）/ `#2a3843` / `#1f2a34` / `#0e1419` /
`#e0a63c`（warning＝灯りの色）/ `#4fa97a`（positive＝十字）。

プロンプトの要点：

- **文字を描かせない。** `no text, no letters, no numbers` を必ず入れる。
  入れないと日本語風の崩れた文字が看板に載る
- **イラスト帯は左上を空ける。** ScreenShell が NPC の台詞をそこに重ねる
  （`left:0 right:30% top:16px`）。「upper left third is empty sky reserved for text」と書く
- **立ち絵は余白付きで中央に、背景と明確に分離。** 切り抜きのため
- **地図の下地は「低コントラストで、上に置く目印が目立つように」と書く。**
  `LOW CONTRAST, calm and recessive so that bright markers placed on top will stand out`。
  これを書かないと建物が明るく塗られ、ピンが埋もれる
- **小さく使うアイコンは「26pxで読める」と書く。** ディテールを盛られると潰れる。
  `bold simple silhouette, very few details, readable at 26 pixels` が効いた

## 後処理

生成物にはそのまま使えない部分があるので、取り込み時に手を入れている。

1. **C2PA メタデータを削る。** base64 の塊が数十KB乗っている
2. **立ち絵の背景を外す。** 全面を覆う矩形パスが1本目に入っているので、それだけ削除
3. **全面を覆う背景パスを削る。** 1本目の `d` が `M 0 0 L 2048 0 L 2048 2048 ...`
   で始まっていたらそれ。残すと次の bbox が canvas 全体になり、余白が詰まらない
4. **アイコンは viewBox を実際の描画範囲まで詰める。**
   生成物は対象の周りに canvas の 6 割ほど余白がある。そのままだと 27px の
   タブアイコンで絵が潰れて読めない。`getBBox()` で測って正方形に切り直す
5. **色をパレットに寄せる。** 指定した色以外（紫がかった青など）が混ざるので、
   トークンの色のうち一番近いものへ寄せ直す
6. **立ち絵の座標系を直す。** `viewBox` が正方形なのに `width` が 3:4 で
   `preserveAspectRatio="none"` という組み合わせで返ってくる。
   そのままだと拡大縮小で歪むので、`scale()` を焼き込んで素直な viewBox にした

### 建物アイコンのプロンプトで効いた条件

`Object centered, fills the frame edge to edge with almost no margin` を入れても
生成側は 3 割ほど余白を残すので、後処理の切り直しは必須。
**「敷地」「庭」「地面」を描かせると 27px で潰れる。** 個人資産のアイコンは
最初「庭付きの家」で出して読めず、`only the house itself, tall and chunky`
と書き直して作り直した。建物1個だけを大きく、が正解。

## 作り直すとき

`docs/design/` にプロンプトを置く運用にはしていない。ここに書いてある要点を守れば
同じ系統のものが出る。**16画面ぶん作るときは、先にスタイルを1枚決めてから
それを参照画像として渡す**（`medias` に role: reference）。テキストプロンプトだけで
16枚揃えるとトーンがばらつく。
