import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  // Rapier importe son WebAssembly en module ESM. Sans ce plugin, seule la
  // variante `-compat` fonctionne, et elle embarque 2.7 Mo de base64 dans le
  // bundle JS au lieu de charger un .wasm en parallele.
  plugins: [wasm()],
  server: { host: true },
  build: { target: 'es2022' },
});
