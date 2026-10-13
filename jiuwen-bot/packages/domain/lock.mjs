import { DatabaseSync } from 'node:sqlite'
import { chmodSync } from 'node:fs'
import { resolve } from 'node:path'

export function acquireDataLock(dataDir) {
  const path = resolve(dataDir, 'owner.sqlite')
  const db = new DatabaseSync(path)
  chmodSync(path, 0o600)
  try {
    // A separate DB holds an OS-released lock across the server lifetime, including crashes.
    db.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER);')
    return () => db.close()
  } catch {
    db.close()
    throw new Error('This data directory is already in use')
  }
}
