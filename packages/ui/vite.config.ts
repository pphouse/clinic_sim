import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  /*
   * ★相対パスで吐く。
   * GitHub Pages は https://<user>.github.io/<repo>/ という**サブパス**に置かれるので、
   * 絶対パス（/assets/...）で吐くと 404 になる。'./' なら置き場所を選ばない
   * （ローカルの file:// でも、別のホスティングへ移しても動く）。
   */
  base: './',
});
