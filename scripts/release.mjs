import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const rootUrl = new URL('../', import.meta.url)
const rootDir = fileURLToPath(rootUrl)
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function projectPath(relativePath) {
  return fileURLToPath(new URL(relativePath, rootUrl))
}

function normalizeVersion(inputVersion) {
  return inputVersion.trim().replace(/^v/i, '')
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(projectPath(relativePath), 'utf8'))
}

function writeJson(relativePath, value) {
  writeFileSync(projectPath(relativePath), `${JSON.stringify(value, null, 2)}\n`)
}

function updateVersions(version) {
  const packageJson = readJson('package.json')
  packageJson.version = version
  writeJson('package.json', packageJson)

  const packageLock = readJson('package-lock.json')
  packageLock.version = version
  packageLock.packages[''].version = version
  writeJson('package-lock.json', packageLock)
}

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

async function main() {
  const currentVersion = readJson('package.json').version
  const rl = createInterface({ input, output })
  let version

  try {
    version = normalizeVersion(
      await rl.question(`Current version is ${currentVersion}, new version: `),
    )
  } finally {
    rl.close()
  }

  if (!semverPattern.test(version)) {
    throw new Error('Version must be a valid semver value, for example 1.0.1')
  }

  const tag = `v${version}`

  updateVersions(version)

  run('git', ['add', '.'])
  run('git', ['commit', '-m', `chore: release ${version}`])
  run('git', ['push', 'github', 'HEAD:master'])
  run('git', ['tag', tag])
  run('git', ['push', 'github', tag])

  console.log(`Released ${tag}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
