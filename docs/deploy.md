# iPhone で遊べるようにする

サーバは要らない。シム核は純粋関数で、セーブは localStorage なので、
**ビルドした `dist` を静的に置くだけ**で動く。

---

## 1回だけ手で要る設定

GitHub の **Settings → Pages → Source** を「**GitHub Actions**」にする。
これをしないと `.github/workflows/deploy.yml` が配れない。

そのあと `main` に push すれば自動でビルドして配られる。URL は

```
https://<ユーザー名>.github.io/clinic_sim/
```

ワークフローは配る前に `pnpm typecheck` と `pnpm test` を通す。
**ゴールデンが落ちているものを iPhone に届けない。**

## iPhone での開き方

1. Safari で上の URL を開く
2. 共有ボタン → **ホーム画面に追加**
3. ホーム画面のアイコンから開く

★ **タブから開くのとホーム画面から開くのでは別物。**
Safari のタブだと下にアドレスバーが居座って、操作卓（親指の届く画面下半分。
CLAUDE.md §5）が潰れる。ホーム画面から開くと全画面になる。

## 対応済みの iPhone まわり

| | やったこと |
|---|---|
| ノッチ | ヘッダに `env(safe-area-inset-top)` ぶんの余白 |
| ホームバー | 操作卓に `env(safe-area-inset-bottom)` ぶんの余白 |
| アドレスバーの出入り | `height: 100dvh`（動的ビューポート） |
| ダブルタップの拡大 | ボタンに `touch-action: manipulation`。月送りの連打で必ず踏む |
| 長押しの選択メニュー | ボタンで `user-select: none` |
| タップの青い枠 | `-webkit-tap-highlight-color: transparent` |
| 端の跳ね返り | `overscroll-behavior: none` |
| 横向きの文字拡大 | `text-size-adjust: 100%` |
| オフライン | サービスワーカー。**電波が無くても遊べる** |
| 置き場所 | `base: './'`。サブパスでも file:// でも動く |

## セーブについて

localStorage に置いている（`med-sim:save:v1`）。

- **端末ごとに別のセーブになる。** iPhone と PC は繋がらない
- Safari の履歴を消すと消える
- ホーム画面から開いた版とタブで開いた版は、**同じ localStorage を共有する**

同期したいなら決定列（`SaveData`）をどこかへ送るだけでよい。
状態ではなく決定列なので数KBしかない（`03-game.md` §5）。

## 他のホスティングへ移すとき

`base: './'` で相対パスに吐いているので、`packages/ui/dist` をそのまま置けば動く。
Cloudflare Pages / Netlify / Vercel なら、ビルドコマンドを

```
pnpm install && pnpm --filter @med/ui build
```

出力ディレクトリを `packages/ui/dist` にする。
