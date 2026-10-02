import { resolve } from 'node:path'

// Spiegelt die Rewrite-Regel aus netlify.toml für dev/preview
function rewrite(req, _res, next) {
  if (/^\/projekte\/fractal-demo\/?(\?.*)?$/.test(req.url)) {
    req.url = '/src/projekte/fractal-demo/index.html'
  }
  next()
}

const fractalDemoRewrite = {
  name: 'fractal-demo-rewrite',
  configureServer(server) { server.middlewares.use(rewrite) },
  configurePreviewServer(server) { server.middlewares.use(rewrite) }
}

export default {
  appType: 'mpa',
  plugins: [fractalDemoRewrite],
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
