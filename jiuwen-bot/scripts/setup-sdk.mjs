import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(readFileSync(resolve(root, 'runtime-lock.json')))
const checkout = resolve(root, '.runtime/jiuwenswarm')
mkdirSync(resolve(root, '.runtime'), { recursive: true })
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } })
if (!existsSync(checkout)) run('git', ['clone', '--no-checkout', '--filter=blob:none', lock.repository, checkout])
const current = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()
if (current !== lock.revision) run('git', ['fetch', '--depth=1', 'origin', lock.revision], checkout)
run('git', ['checkout', '--detach', lock.revision], checkout)
run('npm', ['ci', '--no-audit', '--no-fund'], resolve(checkout, 'sdks/typescript'))
run('npm', ['run', 'build'], resolve(checkout, 'sdks/typescript'))
console.log(`SDK built at pinned revision ${lock.revision}. Python installation is a separate step; see README.md.`)
