import test from 'node:test'
import { request as httpRequest } from 'node:http'
import assert from 'node:assert/strict'
import { startServer } from '../apps/api/server.mjs'
import { bench, until, settled } from './helpers.mjs'

test('loopback access, browser origin checks, reconnect replay and idempotent HTTP requests', async t => {
  const b = await bench()
  const app = await startServer(b.service)
  t.after(async () => { await app.close(); await b.close() })
  const request = (path, options = {}) => fetch(app.origin + path, options)
  assert.equal((await request('/api/state')).status, 401)
  assert.equal((await request('/api/session', { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  const bootstrap = await request('/api/session', { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(bootstrap.status, 200)
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
  const headers = { Origin: app.origin, Cookie: cookie, 'Content-Type': 'application/json' }
  assert.equal((await request('/api/state', { headers })).status, 200)
  const badHost = await new Promise(resolve => {
    const req = httpRequest(app.origin + '/api/state', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
    req.end()
  })
  assert.equal(badHost, 403)
  const path = `/api/conversations/${b.privateId}`
  const first = await (await request(path + '/messages', { method: 'POST', headers, body: JSON.stringify({ key: 'retry-1', text: 'first' }) })).json()
  const disconnect = new AbortController()
  const events = await request(path + '/events', { headers, signal: disconnect.signal })
  const reader = events.body.getReader()
  const chunk = new TextDecoder().decode((await reader.read()).value)
  assert.match(chunk, /connected/)
  disconnect.abort()
  const duplicate = await (await request(path + '/messages', { method: 'POST', headers, body: JSON.stringify({ key: 'retry-1', text: 'first' }) })).json()
  assert.equal(duplicate.duplicate, true)
  await until(() => settled(b.store, first.runs))
  const saved = b.store.replay(b.privateId)
  const cursor = saved[1].id
  const reconnect = new AbortController()
  const replay = await request(path + '/events', { headers: { ...headers, 'Last-Event-ID': String(cursor) }, signal: reconnect.signal })
  const replayReader = replay.body.getReader()
  let output = ''
  while (!output.includes('run.completed')) output += new TextDecoder().decode((await replayReader.read()).value)
  reconnect.abort()
  const replayed = output.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
  assert.deepEqual(replayed.map(event => event.id), saved.filter(event => event.id > cursor).map(event => event.id))
  assert.equal(b.store.all('runs').length, 1)
})


test('local forwarded ports work while foreign hosts and mismatched origins are rejected', async t => {
  const b = await bench()
  const app = await startServer(b.service)
  t.after(async () => { await app.close(); await b.close() })
  const request = (path, host, origin, cookie) => new Promise((resolve, reject) => {
    const headers = { Host: host, 'Content-Type': 'application/json' }
    if (origin) headers.Origin = origin
    if (cookie) headers.Cookie = cookie
    const req = httpRequest(app.origin + path, { method: path === '/api/session' ? 'POST' : 'GET', headers }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0].split(';')[0] }))
    })
    req.on('error', reject)
    req.end(path === '/api/session' ? '{}' : undefined)
  })
  for (const host of ['localhost:56061', '127.0.0.1:56061', '[::1]:56061', 'localhost']) {
    const origin = `http://${host}`
    assert.equal((await request('/', host)).status, 200)
    const session = await request('/api/session', host, origin)
    assert.equal(session.status, 200)
    assert.equal((await request('/api/state', host, origin, session.cookie)).status, 200)
    assert.equal((await request('/api/state', host, 'http://localhost:9999', session.cookie)).status, 403)
  }
  for (const host of ['evil.example', 'localhost.evil.example:56061', '127.0.0.1.evil.example', 'localhost:65536', 'user@localhost:56061']) {
    assert.equal((await request('/', host)).status, 403)
  }
  assert.equal((await request('/api/session', 'localhost:56061', 'http://127.0.0.1:4318')).status, 403)
})
