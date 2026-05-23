import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve('dist')
const cssDir = resolve(distDir, 'css')

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

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>FinInsight 智汇金融</title>
${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script src="/js/467.js"></script>
    <script src="/js/app.js"></script>
  </body>
</html>
`

await mkdir(distDir, { recursive: true })
await writeFile(resolve(distDir, 'index.html'), html, 'utf8')
