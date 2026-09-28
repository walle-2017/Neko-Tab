import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const packagePath = resolve(root, 'package.json')
const manifestPath = resolve(root, 'public/manifest.json')
const lockPath = resolve(root, 'package-lock.json')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const packageJson = readJson(packagePath)
const manifest = readJson(manifestPath)
const lockfile = readJson(lockPath)
const version = packageJson.version

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `package.json version "${version}" must use numeric major.minor.patch format for Chrome manifest compatibility.`
  )
  process.exit(1)
}

const mismatches = []
if (manifest.version !== version) {
  mismatches.push(`public/manifest.json: ${manifest.version}`)
}
if (lockfile.version !== version) {
  mismatches.push(`package-lock.json: ${lockfile.version}`)
}
if (lockfile.packages?.['']?.version !== version) {
  mismatches.push(
    `package-lock.json packages[""]: ${lockfile.packages?.['']?.version ?? 'missing'}`
  )
}

const command = process.argv[2] ?? 'check'

if (command === 'sync') {
  manifest.version = version
  lockfile.version = version
  if (!lockfile.packages?.['']) {
    console.error('package-lock.json is missing packages[""] metadata.')
    process.exit(1)
  }
  lockfile.packages[''].version = version

  writeJson(manifestPath, manifest)
  writeJson(lockPath, lockfile)
  console.log(`Synchronized extension metadata to version ${version}.`)
  process.exit(0)
}

if (command !== 'check') {
  console.error('Usage: node scripts/version.mjs [check|sync]')
  process.exit(1)
}

if (mismatches.length > 0) {
  console.error(`Version mismatch: package.json is ${version}, but:`)
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`)
  }
  console.error('Run "npm run version:sync" after changing package.json.')
  process.exit(1)
}

console.log(`Version metadata is synchronized at ${version}.`)
