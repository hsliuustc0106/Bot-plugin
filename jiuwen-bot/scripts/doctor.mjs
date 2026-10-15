import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRuntime } from '../packages/runtime-jiuwen/index.mjs'
import { runtimeOptions } from '../packages/runtime-jiuwen/config.mjs'
import { childEnvironment } from '../packages/runtime-jiuwen/environment.mjs'
const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(readFileSync(resolve(root, 'runtime-lock.json')))
const mock = process.argv.includes('--mock')
const options = runtimeOptions(mock)
const { dataDir } = options
mkdirSync(dataDir, { recursive: true, mode: 0o700 })
let failed = false
async function check(label, fn) {
  try { await fn(); console.log(`PASS ${label}`) }
  catch { failed = true; console.log(`FAIL ${label}`) }
}
await check('Node.js >=22.19', () => {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || major === 22 && minor < 19) throw new Error()
})
await check('Pinned JiuwenSwarm checkout', () => {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(root, '.runtime/jiuwenswarm'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (revision !== lock.revision) throw new Error()
})
await check('Built TypeScript process SDK', () => { if (!existsSync(resolve(root, '.runtime/jiuwenswarm/sdks/typescript/dist/index.js'))) throw new Error() })
const python = process.env.JIUWEN_BOT_PYTHON ?? resolve(root, '.venv/bin/python')
if (!mock) await check('Python >=3.11,<3.14 and installed JiuwenSwarm module', () => {
  execFileSync(python, ['-c', 'import sys, importlib.util; assert (3,11) <= sys.version_info < (3,14); assert importlib.util.find_spec("jiuwenswarm")'], { env: childEnvironment(dataDir), stdio: 'ignore', timeout: 10000 })
})
if (!mock) await check('Complete Python package dependencies', () => {
  execFileSync(python, ['-m', 'pip', 'check'], { env: childEnvironment(dataDir), stdio: 'ignore', timeout: 10000 })
})
let runtime
await check(`${mock ? 'Fixture' : 'Python'} process starts, reports required capabilities and exits`, async () => {
  runtime = await createRuntime(options)
  await runtime.inspectCapabilities()
})
if (!mock && runtime) await check('Configured model catalog is nonempty (no generation)', async () => {
  const result = await runtime.client.query('model.list', {}, { deadlineMs: 30000 })
  if (result.status !== 'completed' || !result.data?.models?.length) throw new Error()
})
console.log(`Platform: ${process.platform}. ${mock ? 'Fixture checks do not validate the Python Runtime or a model.' : 'No model generation was requested.'}`)
if (process.platform !== 'darwin') console.log('Target Mac acceptance remains unverified; run doctor and smoke on that Mac.')
process.exitCode = failed ? 1 : 0
