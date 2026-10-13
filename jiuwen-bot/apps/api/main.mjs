import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { acquireDataLock } from '../../packages/domain/lock.mjs'
import { Store } from '../../packages/domain/store.mjs'
import { BotService } from '../../packages/domain/service.mjs'
import { createRuntime } from '../../packages/runtime-jiuwen/index.mjs'
import { startServer } from './server.mjs'
import { runtimeOptions } from '../../packages/runtime-jiuwen/config.mjs'

process.umask(0o077)
const mock = process.argv.includes('--mock')
const options = runtimeOptions(mock)
const { dataDir } = options
mkdirSync(dataDir, { recursive: true, mode: 0o700 })
let app, store, releaseLock
try {
  releaseLock = acquireDataLock(dataDir)
  const runtime = await createRuntime(options)
  await runtime.inspectCapabilities()
  store = new Store(resolve(dataDir, 'bot.sqlite'))
  const service = new BotService(store, runtime, dataDir)
  app = await startServer(service, { port: Number(process.env.PORT ?? 4318) })
  console.log(`Jiuwen Bot (${mock ? 'deterministic fixture' : 'JiuwenSwarm'}): ${app.origin}`)
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await app.close(); store.close(); releaseLock()
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
} catch {
  console.error('Jiuwen Bot could not start. Run npm run doctor and check the local setup instructions.')
  if (app) await app.close()
  store?.close()
  releaseLock?.()
  process.exitCode = 1
}
