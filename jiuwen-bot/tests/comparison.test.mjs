import test from 'node:test'
import assert from 'node:assert/strict'
import { compare } from '../scripts/compare.mjs'
test('comparison rejects unverified settings and preserves unsupported cases', () => {
  assert.equal(compare({}, {}).comparable, false)
  const settings = { provider: 'fixture', modelVersion: 'fixture-v1', reasoning: 'off', tools: ['read_note'], permissions: 'ask', maxModelCalls: 4, timeoutSeconds: 180 }
  const result = { id: 'private-reply', supported: true, correct: true, manualInterventions: 0, latencyMs: 10, usage: null, failure: null }
  const results = [result, ...['read-note', 'denied-note', 'group', 'cancel'].map(id => ({ id, supported: false, reason: 'Not supported by fixture' }))]
  const report = { settings, settingsVerified: true, results }
  assert.equal(compare(report, report).comparable, true)
  assert.equal(compare({ ...report, settingsVerified: false }, report).comparable, false)
  assert.equal(compare(report, { ...report, settings: { ...settings, reasoning: 'unknown' } }).comparable, false)
  assert.equal(compare(report, { ...report, results: results.map(item => ({ ...item, supported: false, reason: 'Unsupported' })) }).comparable, false)
})
