import assert from 'node:assert/strict'
import { startServer } from '../apps/api/server.mjs'
import { bench, until, settled } from '../tests/helpers.mjs'
const b = await bench()
const app = await startServer(b.service)
try {
  const session = await fetch(app.origin + '/api/session', { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' }, body: '{}' })
  const headers = { Origin: app.origin, 'Content-Type': 'application/json', Cookie: session.headers.get('set-cookie').split(';')[0] }
  const send = async (id, text, key) => {
    const res = await fetch(`${app.origin}/api/conversations/${id}/messages`, { method: 'POST', headers, body: JSON.stringify({ text, key }) })
    assert.equal(res.status, 202); return res.json()
  }
  const privateChat = await send(b.privateId, 'hello', 'smoke-private')
  const group = await send(b.groupId, 'prepare a concise result', 'smoke-group')
  await until(() => settled(b.store, [...privateChat.runs, ...group.runs]))
  assert([...privateChat.runIds, ...group.runIds].every(id => b.store.get('runs', id).status === 'completed'))
  const reading = await send(b.privateId, 'read note', 'smoke-tool')
  const interaction = await until(() => b.store.all('interactions').find(item => item.status === 'pending'))
  const approved = await fetch(`${app.origin}/api/conversations/${b.privateId}/runs/${interaction.runId}/interactions/${interaction.id}`, {
    method: 'POST', headers, body: JSON.stringify({ answers: [{ selected_options: ['allow_once'], custom_input: '' }] }),
  })
  assert.equal(approved.status, 200)
  await until(() => settled(b.store, reading.runs))
  assert.match(b.store.get('runs', reading.runIds[0]).text, /Shared note/)
  const hang = await send(b.privateId, 'hang', 'smoke-cancel')
  const stopped = await fetch(`${app.origin}/api/conversations/${b.privateId}/runs/${hang.runIds[0]}/cancel`, { method: 'POST', headers, body: '{}' })
  assert.equal(stopped.status, 200)
  await until(() => settled(b.store, hang.runs))
  assert.equal(b.store.get('runs', hang.runIds[0]).status, 'cancelled')
  console.log('PASS: localhost API, private chat, three-turn team, approved note read, saved transcript and cancellation (fixture; no model).')
} finally { await app.close(); await b.close() }
