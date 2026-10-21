import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        quickChat: path.resolve(__dirname, 'quick-chat.html'),
        updateNotification: path.resolve(__dirname, 'update-notification.html'),
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Serve .wasm and .onnx files with correct MIME types so
    // onnxruntime-web and @ricky0123/vad-web can load them at runtime.
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Both @ricky0123/vad-web and onnxruntime-web are CJS-only packages.
  // @ricky0123/vad-web uses require('onnxruntime-web/wasm') internally.
  // If onnxruntime-web is excluded while vad-web is included, esbuild marks
  // onnxruntime-web as an external `require()` — but `require` does not exist
  // in the browser's ESM environment → runtime crash.
  //
  // Letting esbuild pre-bundle BOTH together resolves this:
  //   • esbuild converts CJS → ESM for both packages in one pass
  //   • Named exports (MicVAD, etc.) are properly exposed
  //   • onnxruntime-web's WASM files are NOT embedded — they are fetched at
  //     runtime from public/vad/ via the onnxWASMBasePath option passed to
  //     MicVAD.new() in useLiveTranslate.ts → no path breakage from bundling.
  optimizeDeps: {
    include: ['@ricky0123/vad-web', 'onnxruntime-web'],
  },
  // Tell Vite to treat .onnx and .wasm files as static assets so they are
  // copied verbatim into dist/ and not transformed by any plugin.
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
})
