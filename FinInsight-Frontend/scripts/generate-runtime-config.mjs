import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const apiBaseUrl = process.argv[2] || ''
const content = `window.__FININSIGHT_API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};\n`

await writeFile(resolve('dist', 'runtime-config.js'), content, 'utf8')
