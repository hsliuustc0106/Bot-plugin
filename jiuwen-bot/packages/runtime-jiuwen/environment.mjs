import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function childEnvironment(dataDir, credentials = {}, parent = process.env) {
  // The SDK overlays its env onto process.env. Explicit undefined entries remove inheritance.
  const env = Object.fromEntries(Object.keys(parent).map(key => [key, undefined]))
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'WINDIR']) {
    if (parent[key]) env[key] = parent[key]
  }
  const home = resolve(dataDir, 'runtime-home')
  const temp = resolve(dataDir, 'tmp')
  for (const dir of [home, temp]) mkdirSync(dir, { recursive: true, mode: 0o700 })
  return { ...env, ...credentials, HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    JIUWENSWARM_DATA_DIR: resolve(dataDir, 'runtime'), PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1' }
}
