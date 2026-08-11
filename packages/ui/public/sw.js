/*
 * オフライン用の最小のサービスワーカー。
 *
 * このゲームはサーバを持たない（セーブも localStorage）。**電波が無くても遊べる**べき。
 *
 * 戦略は2つだけ：
 *   ページ本体（ナビゲーション）→ ネットワーク優先。更新が届かなくなるのを避ける
 *   それ以外の同一オリジン        → キャッシュ優先。ファイル名にハッシュが入っているので安全
 *
 * ★キャッシュ優先を index.html に使わないこと。
 * 一度掴むと新しい版が永久に届かなくなる。
 */
const CACHE = 'med-sim-v1';

self.addEventListener('install', (event) => {
  // 新しい版をすぐ有効にする。次のリロードで切り替わる
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
