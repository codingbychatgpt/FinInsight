import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve('dist')
const cssDir = resolve(distDir, 'css')
const jsDir = resolve(distDir, 'js')

const cssFiles = (await readdir(cssDir))
  .filter((file) => file.endsWith('.css'))
  .sort((left, right) => {
    if (left === 'app.css') {
      return -1
    }
    if (right === 'app.css') {
      return 1
    }
    return left.localeCompare(right)
  })

const cssLinks = cssFiles.map((file) => `    <link rel="stylesheet" href="/css/${file}">`).join('\n')
const jsFiles = (await readdir(jsDir))
  .filter((file) => file.endsWith('.js'))
  .sort((left, right) => {
    if (left === 'app.js') {
      return 1
    }
    if (right === 'app.js') {
      return -1
    }
    return left.localeCompare(right)
  })

const scriptTags = jsFiles.map((file) => `    <script src="/js/${file}"></script>`).join('\n')

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta name="description" content="FinInsight 智汇金融，聚合金融政策热点并提供 AI 解读。">
    <title>FinInsight 智汇金融</title>
${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script src="/runtime-config.js"></script>
${scriptTags}
  </body>
</html>
`

await mkdir(distDir, { recursive: true })
await writeFile(resolve(distDir, 'index.html'), html, 'utf8')
