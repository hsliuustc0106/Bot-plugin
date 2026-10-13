import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Store } from '../packages/domain/store.mjs'
import { BotService } from '../packages/domain/service.mjs'
import { bench, until, settled } from './helpers.mjs'

const send = (b, text, id = b.privateId) => b.service.submit(id, { text, key: randomUUID() })
const pending = b => b.store.all('interactions').find(item => item.status === 'pending')
const answer = (b, item, value) => b.service.answer(item.conversationId, item.runId, item.id, [{ selected_options: [value], custom_input: '' }])

test('stream, terminal completion, idempotency, session queue and reload', async t => {
  const b = await bench(); t.after(() => b.close())
  const submission = send(b, 'first')
  const duplicate = b.service.submit(b.privateId, { text: 'first', key: submission.id.split(':')[1] })
  assert.equal(duplicate.duplicate, true)
  assert.deepEqual(duplicate.runIds, submission.runIds)
  assert.throws(() => b.service.submit(b.privateId, { text: 'different', key: submission.id.split(':')[1] }), /different content/)
  const second = send(b, 'second')
  await until(() => settled(b.store, [...submission.runs, ...second.runs]))
  const events = b.store.replay(b.privateId)
  assert(events.some(event => event.type === 'text.delta'))
  const firstComplete = events.findIndex(event => event.runId === submission.runIds[0] && event.type === 'run.completed')
  const secondStart = events.findIndex(event => event.runId === second.runIds[0] && event.type === 'run.started')
  assert(firstComplete < secondStart)
  const session = b.store.all('runtime_sessions')[0]
  assert(session.runtimeId)
  assert.equal(b.store.all('runtime_sessions').length, 1)
  assert.equal((await b.runtime.reopenSession(session.runtimeId)).available, true)
  b.store.close()
  b.store = new Store(resolve(b.dir, 'bot.sqlite')); b.service.store = b.store
  assert.equal(b.service.snapshot(b.privateId).messages.length, 4)
  assert.equal(b.store.all('runtime_sessions')[0].runtimeId, session.runtimeId)
  for (const run of [...submission.runs, ...second.runs]) {
    const own = events.filter(event => event.runId === run.id)
    assert.deepEqual(own.map(event => event.sequence), own.map((_, i) => i))
    assert(own.every(event => event.conversationId === b.privateId))
  }
})

test('host deny, stale/foreign answers and cancellation at approval', async t => {
  let calls = 0
  const b = await bench({ readNote: async () => { calls++; return { text: 'read' } } }); t.after(() => b.close())
  b.service.setPermission(b.privateId, 'deny')
  const denied = send(b, 'read note'); await until(() => settled(b.store, denied.runs)); assert.equal(calls, 0)
  b.service.setPermission(b.privateId, 'ask')
  const allowed = send(b, 'read note'); const item = await until(() => pending(b))
  assert.throws(() => b.service.answer(b.groupId, item.runId, item.id, []), /not found/)
  assert.throws(() => answer(b, item, 'anything'), /Invalid answer option/)
  answer(b, item, 'allow_once')
  assert.throws(() => answer(b, item, 'allow_once'), /already answered/)
  await until(() => settled(b.store, allowed.runs)); assert.equal(calls, 1)
  const cancelled = send(b, 'read note'); const waiting = await until(() => pending(b))
  b.service.cancel(b.privateId, cancelled.runIds[0])
  await until(() => settled(b.store, cancelled.runs))
  assert.equal(b.store.get('runs', cancelled.runIds[0]).status, 'cancelled')
  assert.equal(b.store.get('interactions', waiting.id).status, 'expired')
  assert.equal(calls, 1)
})

test('cancel while question waits; approved question preserves option values', async t => {
  const b = await bench(); t.after(() => b.close())
  const first = send(b, 'question'); const item = await until(() => pending(b))
  answer(b, item, 'brief'); await until(() => settled(b.store, first.runs))
  assert.equal(b.store.get('runs', first.runIds[0]).text, 'Answer: brief')
  const second = send(b, 'question'); await until(() => pending(b))
  b.service.cancel(b.privateId, second.runIds[0]); await until(() => settled(b.store, second.runs))
  assert.equal(b.store.get('runs', second.runIds[0]).status, 'cancelled')
})

test('cancellation waits for outstanding read and prevents additional dispatch', async t => {
  let settleRead, calls = 0
  const b = await bench({ readNote: () => { calls++; return new Promise(resolve => { settleRead = resolve }) } }); t.after(() => b.close())
  b.service.setPermission(b.privateId, 'allow')
  const submission = send(b, 'read note'); await until(() => settleRead)
  b.service.cancel(b.privateId, submission.runIds[0])
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(b.store.get('runs', submission.runIds[0]).status, 'cancelling')
  const entry = b.service.active.get(submission.runIds[0])
  await assert.rejects(b.service.tool(entry.run, { call_id: 'late', name: 'read_note', arguments: {} }, b.dir, entry.controller.signal))
  assert.equal(calls, 1)
  settleRead({ text: 'read settled' })
  await until(() => settled(b.store, submission.runs))
})

test('duplicate tool callbacks share one in-flight action', async t => {
  let calls = 0
  const b = await bench({ readNote: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 50)); return { text: 'once' } } }); t.after(() => b.close())
  b.service.setPermission(b.privateId, 'allow')
  const submission = send(b, 'hang')
  await until(() => b.service.active.get(submission.runIds[0]))
  const run = b.store.get('runs', submission.runIds[0])
  const payload = { call_id: 'same-call', name: 'read_note', arguments: {} }
  const signal = b.service.active.get(run.id).controller.signal
  const values = await Promise.all([b.service.tool(run, payload, b.dir, signal), b.service.tool(run, payload, b.dir, signal)])
  assert.deepEqual(values, [{ text: 'once' }, { text: 'once' }]); assert.equal(calls, 1)
  assert.deepEqual(await b.service.tool(run, payload, b.dir, signal), { text: 'once' }); assert.equal(calls, 1)
  b.service.cancel(b.privateId, run.id)
})

test('group coordination is bounded, isolated, ordered and stops after worker failure', async t => {
  const b = await bench(); t.after(() => b.close())
  const secret = send(b, 'PRIVATE CANARY'); await until(() => settled(b.store, secret.runs))
  const inputs = []; const start = b.runtime.startTurn.bind(b.runtime)
  b.runtime.startTurn = (turn, handlers) => { inputs.push(turn); return start(turn, handlers) }
  const submission = send(b, 'group task', b.groupId)
  send(b, 'later private canary')
  await until(() => settled(b.store, submission.runs))
  const groupInputs = inputs.filter(turn => turn.conversationId === b.groupId)
  assert.equal(groupInputs.length, 3)
  assert(groupInputs.every(turn => !turn.input.includes('PRIVATE CANARY') && !turn.input.includes('later private canary')))
  assert(groupInputs[2].input.includes('Worker result'))
  const groupSessions = b.store.all('runtime_sessions').filter(session => session.conversationId === b.groupId)
  assert.equal(groupSessions.length, 2)
  assert.notEqual(groupSessions[0].runtimeId, b.store.all('runtime_sessions')[0].runtimeId)
  assert.equal(submission.runIds.filter(id => b.store.get('runs', id).status === 'completed').length, 3)
  const failed = send(b, 'FAIL_WORKER', b.groupId)
  await until(() => settled(b.store, failed.runs))
  assert.deepEqual(failed.runIds.map(id => b.store.get('runs', id).status), ['completed', 'failed', 'failed'])
  assert.equal(inputs.filter(turn => turn.conversationId === b.groupId).length, 5)
})

test('restart marks generation, queued work, tool work and approval unknown without replay', async t => {
  const b = await bench(); t.after(() => b.close())
  const run = b.store.insert('runs', { conversationId: b.privateId, status: 'running' })
  const queued = b.store.insert('runs', { conversationId: b.privateId, status: 'queued' })
  const interaction = b.store.insert('interactions', { conversationId: b.privateId, runId: run.id, status: 'pending' })
  const tool = b.store.insert('tool_calls', { runId: run.id, status: 'running' })
  b.store.close(); b.store = new Store(resolve(b.dir, 'bot.sqlite'))
  b.service = new BotService(b.store, b.runtime, b.dir)
  assert.equal(b.store.get('runs', run.id).status, 'interrupted')
  assert.equal(b.store.get('runs', queued.id).status, 'interrupted')
  assert.equal(b.store.get('interactions', interaction.id).status, 'expired')
  assert.equal(b.store.get('tool_calls', tool.id).status, 'unknown')
  assert.equal(b.service.active.size, 0)
  assert.throws(() => b.service.answer(b.privateId, run.id, interaction.id, []), /expired/)
})

test('chat.final and mismatched exit are never completion; inherited secrets are removed', async t => {
  const b = await bench(); t.after(() => b.close())
  for (const input of ['truncate', 'bad-exit']) {
    const submission = send(b, input); await until(() => settled(b.store, submission.runs))
    assert.equal(b.store.get('runs', submission.runIds[0]).status, 'failed')
    assert.equal(b.service.snapshot(b.privateId).messages.filter(message => message.role === 'assistant').length, 0)
  }
  // This sentinel is test data, not a credential.
  process.env.JIUWEN_TEST_SECRET = 'test-sentinel'
  const fresh = await bench(); t.after(() => fresh.close()); t.after(() => { delete process.env.JIUWEN_TEST_SECRET })
  const submission = send(fresh, 'inspect-env'); await until(() => settled(fresh.store, submission.runs))
  assert.equal(fresh.store.get('runs', submission.runIds[0]).text, 'CLEAN')
})
