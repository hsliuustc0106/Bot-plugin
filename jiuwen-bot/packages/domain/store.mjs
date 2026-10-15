import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

const tables = new Set(['bots', 'conversations', 'members', 'messages', 'runs', 'interactions', 'runtime_sessions', 'tool_calls', 'submissions'])
export class Store extends EventEmitter {
  constructor(path) {
    super()
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;')
    for (const name of tables) this.db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(run_id, sequence)); CREATE INDEX IF NOT EXISTS events_conversation ON events(conversation_id, id);`)
  }
  table(name) { if (!tables.has(name)) throw new Error('Unknown table'); return name }
  get(table, id) {
    const row = this.db.prepare(`SELECT data FROM ${this.table(table)} WHERE id=?`).get(id)
    return row ? JSON.parse(row.data) : null
  }
  all(table) { return this.db.prepare(`SELECT data FROM ${this.table(table)} ORDER BY rowid`).all().map(row => JSON.parse(row.data)) }
  put(table, value) {
    this.db.prepare(`INSERT INTO ${this.table(table)}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value))
    return value
  }
  insert(table, value) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...value }
    this.db.prepare(`INSERT INTO ${this.table(table)}(id,data) VALUES(?,?)`).run(record.id, JSON.stringify(record))
    return record
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  event(run, type, payload = {}) {
    const sequence = this.db.prepare('SELECT COALESCE(MAX(sequence), -1)+1 AS n FROM events WHERE run_id=?').get(run.id).n
    const createdAt = new Date().toISOString()
    const row = this.db.prepare('INSERT INTO events(run_id,conversation_id,sequence,type,payload,created_at) VALUES(?,?,?,?,?,?)')
      .run(run.id, run.conversationId, sequence, type, JSON.stringify(payload), createdAt)
    const event = { id: Number(row.lastInsertRowid), runId: run.id, conversationId: run.conversationId, sequence, type, payload, createdAt }
    this.emit('event', event)
    return event
  }
  replay(conversationId, after = 0, limit = 500) {
    return this.db.prepare('SELECT * FROM events WHERE conversation_id=? AND id>? ORDER BY id LIMIT ?').all(conversationId, after, limit).map(row => ({
      id: row.id, runId: row.run_id, conversationId: row.conversation_id, sequence: row.sequence,
      type: row.type, payload: JSON.parse(row.payload), createdAt: row.created_at,
    }))
  }
  recover() {
    this.transaction(() => {
      for (const run of this.all('runs')) if (['queued', 'running', 'cancelling'].includes(run.status)) {
        this.put('runs', { ...run, status: 'interrupted', error: 'Server stopped; execution outcome unknown', finishedAt: new Date().toISOString() })
        this.event(run, 'run.interrupted', { outcome: 'unknown', automaticRetry: false })
      }
      for (const item of this.all('interactions')) if (item.status === 'pending') {
        this.put('interactions', { ...item, status: 'expired' })
        this.event(this.get('runs', item.runId), 'interaction.expired', { interactionId: item.id })
      }
      for (const call of this.all('tool_calls')) if (call.status === 'pending' || call.status === 'running') this.put('tool_calls', { ...call, status: 'unknown' })
    })
  }
  close() { this.db.close() }
}
