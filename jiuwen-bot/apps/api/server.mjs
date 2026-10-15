import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AppError, requireValue } from '../../packages/runtime-contracts/index.mjs'

const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }
const webRoot = resolve(import.meta.dirname, '../web')
export async function startServer(service, { port = 0 } = {}) {
  const token = randomBytes(32).toString('hex')
  const streams = new Set()
  let origin
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    try {
      const requestOrigin = localOrigin(req.headers.host)
      const url = new URL(req.url, requestOrigin)
      const path = url.pathname
      if (req.method === 'GET' && staticFiles[path]) {
        const [file, type] = staticFiles[path]
        res.setHeader('Content-Type', `${type}; charset=utf-8`)
        res.end(await readFile(resolve(webRoot, file))); return
      }
      requireValue(path.startsWith('/api/'), 'Not found', 404)
      if (req.headers.origin) requireValue(req.headers.origin === requestOrigin, 'Foreign origin', 403)
      if (req.headers['sec-fetch-site']) requireValue(req.headers['sec-fetch-site'] === 'same-origin', 'Foreign browser request', 403)
      if (req.method !== 'GET') {
        requireValue(req.headers.origin === requestOrigin, 'Same-origin request required', 403)
        requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON required', 415)
      }
      if (path === '/api/session' && req.method === 'POST') {
        await body(req)
        res.setHeader('Set-Cookie', `jiuwen_session=${token}; HttpOnly; SameSite=Strict; Path=/`)
        return json(res, { localSession: true })
      }
      const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('jiuwen_session='))?.slice(15) ?? ''
      const candidate = Buffer.from(cookie)
      requireValue(candidate.length === token.length && timingSafeEqual(candidate, Buffer.from(token)), 'Local session required', 401)
      if (req.method === 'GET' && path === '/api/state') return json(res, { bots: service.store.all('bots'), conversations: service.store.all('conversations') })
      if (req.method === 'GET' && path === '/api/capabilities') return json(res, await service.runtime.inspectCapabilities())
      if (req.method === 'POST' && path === '/api/bots') return json(res, service.createBot(await body(req)), 201)
      if (req.method === 'POST' && path === '/api/conversations') return json(res, service.createConversation(await body(req)), 201)
      const match = path.match(/^\/api\/conversations\/([a-f0-9-]+)(.*)$/)
      requireValue(match, 'Not found', 404)
      const [, id, action] = match
      service.conversation(id)
      if (req.method === 'GET' && action === '') return json(res, service.snapshot(id))
      if (req.method === 'POST' && action === '/messages') return json(res, service.submit(id, await body(req)), 202)
      if (req.method === 'POST' && action === '/permission') return json(res, service.setPermission(id, (await body(req)).permission))
      const cancel = action.match(/^\/runs\/([a-f0-9-]+)\/cancel$/)
      if (req.method === 'POST' && cancel) { await body(req); return json(res, service.cancel(id, cancel[1])) }
      const answer = action.match(/^\/runs\/([a-f0-9-]+)\/interactions\/([a-f0-9-]+)$/)
      if (req.method === 'POST' && answer) return json(res, service.answer(id, answer[1], answer[2], (await body(req)).answers))
      if (req.method === 'GET' && action === '/events') {
        let cursor = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0)
        requireValue(Number.isSafeInteger(cursor) && cursor >= 0, 'Invalid event cursor')
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
        res.write(': connected\n\n')
        streams.add(res)
        let blocked = false
        const poll = () => {
          if (blocked || res.destroyed) return
          for (const event of service.store.replay(id, cursor)) {
            cursor = event.id
            if (!res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)) { blocked = true; break }
          }
        }
        res.on('drain', () => { blocked = false; poll() })
        const interval = setInterval(poll, 100)
        const heartbeat = setInterval(() => { if (!blocked) blocked = !res.write(': heartbeat\n\n') }, 15000)
        res.on('close', () => { clearInterval(interval); clearInterval(heartbeat); streams.delete(res) })
        poll(); return
      }
      throw new AppError('Not found', 404)
    } catch (error) {
      if (!res.headersSent) json(res, { error: error instanceof AppError ? error.message : 'Request failed' }, error instanceof AppError ? error.status : 500)
      else res.end()
    }
  })
  server.requestTimeout = 15000
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen) })
  origin = `http://127.0.0.1:${server.address().port}`
  return { origin, server, async close() {
    await service.close()
    for (const res of streams) res.end()
    await new Promise(resolveClose => { server.close(resolveClose); server.closeIdleConnections() })
  } }
}
async function body(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) { size += chunk.length; requireValue(size <= 65536, 'Request body too large', 413); chunks.push(chunk) }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); requireValue(data && typeof data === 'object' && !Array.isArray(data), 'JSON object required'); return data }
  catch { throw new AppError('Invalid JSON body') }
}
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }

function localOrigin(host) {
  // Local tunnels can preserve a browser-facing port different from the listening port.
  const match = typeof host === 'string' && host.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?$/)
  requireValue(match && (!match[2] || Number(match[2]) <= 65535), 'Invalid host', 403)
  return new URL(`http://${host}`).origin
}
