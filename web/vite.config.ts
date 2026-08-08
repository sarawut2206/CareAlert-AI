import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { copyFileSync } from 'node:fs';

/**
 * โหมดสาธิต (VITE_DEMO=1) — สร้างไฟล์นิ่งสำหรับ GitHub Pages
 *
 * โค้ดฝั่งเซิร์ฟเวอร์ที่โหมดสาธิตนำมาใช้ซ้ำ (engine/*) เรียก server/src/config.js
 * ซึ่งใช้ node:fs / node:path — ใช้ในเบราว์เซอร์ไม่ได้
 * ปลั๊กอินด้านล่างจึงสลับไฟล์นั้นเป็น stub เฉพาะตอน build โหมดสาธิต
 * ทำให้ไม่ต้องแก้โค้ดฝั่งเซิร์ฟเวอร์แม้แต่บรรทัดเดียว
 */
function serverConfigStub(): Plugin {
  const stub = path.resolve(__dirname, 'src/demo/config-stub.ts');
  return {
    name: 'carealert-server-config-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('config.js')) return null;
      const resolved = path.resolve(path.dirname(importer), source);
      return resolved.replace(/\\/g, '/').endsWith('server/src/config.js') ? stub : null;
    },
  };
}

/** GitHub Pages ไม่มี server-side routing — ต้องมี 404.html ที่เป็นตัวแอปเอง เพื่อให้ลิงก์ตรงใช้งานได้ */
function spaFallback(outDir: string): Plugin {
  return {
    name: 'carealert-spa-fallback',
    closeBundle() {
      try {
        copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html'));
      } catch { /* ข้ามได้ถ้าไม่ได้ build */ }
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = process.env.VITE_DEMO === '1';
  const outDir = demo ? 'dist-demo' : 'dist';

  return {
    base: demo ? '/CareAlert-AI/' : '/',
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '0') },
    plugins: [
      react(),
      ...(demo ? [serverConfigStub()] : []),
      spaFallback(path.resolve(__dirname, outDir)),
    ],
    server: {
      port: 5173,
      proxy: demo ? undefined : { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    build: { outDir, sourcemap: false, emptyOutDir: true },
  };
});
