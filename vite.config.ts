import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const PYODIDE_RUNTIME_FILES = [
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'pyodide.mjs',
  'python_stdlib.zip',
];

const MIME_TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
};

function pyodideAssetsPlugin(): Plugin {
  const pyodideSrcDir = path.resolve(__dirname, 'node_modules/pyodide');

  return {
    name: 'pyodide-local-assets',
    configureServer(server) {
      server.middlewares.use('/pyodide', (req, res, next) => {
        const cleanUrl = (req.url || '/').split('?')[0].replace(/^\/+/, '');
        if (!cleanUrl || cleanUrl.includes('..') || cleanUrl.includes('/')) {
          next();
          return;
        }
        const filePath = path.join(pyodideSrcDir, cleanUrl);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }
        const ext = path.extname(cleanUrl).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle(error?: Error) {
      if (error) return;
      const distPyodide = path.resolve(__dirname, 'dist/pyodide');
      if (!fs.existsSync(pyodideSrcDir)) return;
      fs.mkdirSync(distPyodide, {recursive: true});
      for (const file of PYODIDE_RUNTIME_FILES) {
        const src = path.join(pyodideSrcDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(distPyodide, file));
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      pyodideAssetsPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    worker: {
      format: 'es' as const,
    },
    optimizeDeps: {
      exclude: ['pyodide'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: process.env.VITE_FASTAPI_PROXY === 'true'
        ? {
            '/api': {
              target: 'http://127.0.0.1:8000',
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
