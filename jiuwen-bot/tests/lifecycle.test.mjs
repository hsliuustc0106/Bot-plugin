import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { acquireDataLock } from '../packages/domain/lock.mjs'
import { setTimeout as delay } from 'node:timers/promises'
const root = resolve(import.meta.dirname, '..')
async function launch(dir) {
  const child = spawn(process.execPath, ['apps/api/main.mjs', '--mock'], { cwd: root,
    env: { PATH: process.env.PATH, JIUWEN_BOT_DATA: dir, PORT: '0' }, stdio: ['ignore', 'pipe', 'ignore'] })
  const exited = new Promise(resolveExit => child.once('exit', code => resolveExit(code)))
  let output = ''
  child.stdout.on('data', data => { output += data })
  const start = Date.now()
  while (!/http:\/\/127\.0\.0\.1:\d+/.test(output)) {
    if (child.exitCode !== null || Date.now() - start > 10000) { child.kill('SIGKILL'); throw new Error('Test server did not start') }
    await delay(20)
  }
  const origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]
  const session = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })
  const cookie = session.headers.get('set-cookie').split(';')[0]
  return { child, exited, async request(path, body) {
    const response = await fetch(origin + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert(response.ok); return response.json()
  }, async stop(signal = 'SIGTERM') {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    await Promise.race([exited, delay(5000).then(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })])
  } }
}
test('server process restart expires approvals and preserves submission identity', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'jiuwen-bot-restart-'))
  let first, second
  try {
    first = await launch(dir)
    const state = await first.request('/state')
    const id = state.conversations[0].id
    const submission = await first.request(`/conversations/${id}/messages`, { text: 'read note', key: 'crash-test' })
    let before
    for (let i = 0; i < 100; i++) {
      before = await first.request(`/conversations/${id}`)
      if (before.interactions.some(item => item.status === 'pending')) break
      await delay(20)
    }
    assert(before.interactions.some(item => item.status === 'pending'))
    await first.stop('SIGKILL')
    second = await launch(dir)
    const after = await second.request(`/conversations/${id}`)
    assert.equal(after.runs[0].status, 'interrupted')
    assert.equal(after.interactions[0].status, 'expired')
    const retry = await second.request(`/conversations/${id}/messages`, { text: 'read note', key: 'crash-test' })
    assert.equal(retry.duplicate, true)
    assert.deepEqual(retry.runIds, submission.runIds)
    assert.equal((await second.request(`/conversations/${id}`)).runs.length, 1)
    await second.stop()
    const release = acquireDataLock(dir)
    assert.throws(() => acquireDataLock(dir), /already in use/)
    release()
  } finally { await first?.stop(); await second?.stop(); await rm(dir, { recursive: true, force: true }) }
})
