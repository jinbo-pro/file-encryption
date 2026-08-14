import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const outputDirectory = path.resolve('dist/utools')
fs.rmSync(outputDirectory, { recursive: true, force: true })

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('vite', ['build', '--outDir', 'dist/utools'])
run('node', ['scripts/build-preload.mjs', '--out-dir', 'dist/utools/preload'])

const preloadPackage = path.join(outputDirectory, 'preload/package.json')
if (!fs.existsSync(preloadPackage)) {
  fs.writeFileSync(preloadPackage, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8')
}
