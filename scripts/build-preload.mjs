import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')
const isProd = !watch
const outputDirArgument = process.argv.indexOf('--out-dir')
const outputDir = outputDirArgument >= 0
  ? process.argv[outputDirArgument + 1]
  : 'dist/preload'
if (!outputDir) throw new Error('--out-dir 必须指定输出目录')
const outfile = `${outputDir}/index.js`

const options = {
  entryPoints: ['preload/index.ts'],
  outfile,
  bundle: isProd,
  platform: 'node',
  format: 'cjs',
  target: 'node16.17',
  minify: false, // utools审核需要不能压缩代码
  keepNames: true,
  sourcemap: watch,
  logLevel: 'info',
  charset: 'utf8',
}

if (watch) {
  const buildContext = await context(options)
  await buildContext.watch()
  console.log(`preload 构建监听已启动：${outfile}`)
} else {
  await build(options)
}
