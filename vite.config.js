import { resolve } from 'node:path'

export default {
  appType: 'mpa',
  build: {
    // JS-Dateien (z. B. der AudioWorklet pcm-processor.js) nie als data:-URL einbetten
    assetsInlineLimit: (file) => (file.endsWith('.js') ? false : undefined),
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'fractal-demo': resolve(import.meta.dirname, 'src/projekte/fractal-demo/index.html')
      }
    }
  }
}
