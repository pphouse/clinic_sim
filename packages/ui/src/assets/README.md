# 画像素材

Higgsfield（Recraft V4.1 の `vector` モード）で生成した SVG。
ラスタではなくベクタなので、モバイルの等倍・2倍どちらでも潰れない。

## 生成条件

| ファイル | 比率 | 用途 |
|---|---|---|
| `clinic-illustration.svg` | 16:9 | 診療所画面のイラスト帯 |
| `manager-portrait.svg` | 3:4 | NPC（事務長）の立ち絵 |
| `clinic-icon.svg` | 1:1 | ヘッダのアイコン |

パレットは `design/tokens.css` の値をそのまま渡している。
`#6e8ca0`（hq accent）/ `#e8ede9`（paper）/ `#2a3843` / `#1f2a34` / `#0e1419` /
`#e0a63c`（warning＝灯りの色）/ `#4fa97a`（positive＝十字）。

プロンプトの要点：

- **文字を描かせない。** `no text, no letters, no numbers` を必ず入れる。
  入れないと日本語風の崩れた文字が看板に載る
- **イラスト帯は左上を空ける。** ScreenShell が NPC の台詞をそこに重ねる
  （`left:0 right:30% top:16px`）。「upper left third is empty sky reserved for text」と書く
- **立ち絵は余白付きで中央に、背景と明確に分離。** 切り抜きのため

## 後処理

生成物にはそのまま使えない部分があるので、取り込み時に手を入れている。

1. **C2PA メタデータを削る。** base64 の塊が数十KB乗っている
2. **立ち絵の背景を外す。** 全面を覆う矩形パスが1本目に入っているので、それだけ削除
3. **立ち絵の座標系を直す。** `viewBox` が正方形なのに `width` が 3:4 で
   `preserveAspectRatio="none"` という組み合わせで返ってくる。
   そのままだと拡大縮小で歪むので、`scale()` を焼き込んで素直な viewBox にした

## 作り直すとき

`docs/design/` にプロンプトを置く運用にはしていない。ここに書いてある要点を守れば
同じ系統のものが出る。**16画面ぶん作るときは、先にスタイルを1枚決めてから
それを参照画像として渡す**（`medias` に role: reference）。テキストプロンプトだけで
16枚揃えるとトーンがばらつく。
