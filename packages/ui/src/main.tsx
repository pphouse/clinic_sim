import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './design/tokens.css';
import './design/base.css';
import './design/controls.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * オフラインで遊べるようにする。
 * **失敗しても何もしない。** サービスワーカーが登録できないこと（file:// で開いた、
 * プライベートブラウジング）は、遊べない理由にならない。
 */
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', import.meta.url)).catch(() => {});
  });
}
