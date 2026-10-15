import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Store } from '../packages/domain/store.mjs'
import { BotService } from '../packages/domain/service.mjs'
import { createRuntime } from '../packages/runtime-jiuwen/index.mjs'
export async function bench(options = {}) {
  const dir = await mkdtemp(resolve(tmpdir(), 'jiuwen-bot-test-'))
  const runtime = await createRuntime({ dataDir: dir, command: [process.execPath, resolve(import.meta.dirname, 'fixtures/process.mjs')] })
  await runtime.inspectCapabilities()
  const store = new Store(resolve(dir, 'bot.sqlite'))
  const service = new BotService(store, runtime, dir, options)
  return { dir, store, service, runtime, privateId: store.all('conversations')[0].id, groupId: store.all('conversations')[2].id,
    async close() { await this.service.close(); this.store.close(); await rm(dir, { recursive: true, force: true }) } }
}
export async function until(fn, timeout = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { const value = fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('Timed out waiting for test condition')
}
export const settled = (store, runs) => runs.every(run => ['completed', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(store.get('runs', run.id).status))
