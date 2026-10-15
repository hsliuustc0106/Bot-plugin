import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tests/fixtures/comparison.json')))
export function compare(a, b) {
  const reasons = []
  if (a.settingsVerified !== true || b.settingsVerified !== true) reasons.push('Actual settings have not been verified for both backends')
  for (const key of fixture.requiredSettings) {
    if (a.settings?.[key] == null || b.settings?.[key] == null || ['', 'unknown', 'unverified'].includes(a.settings[key]) || JSON.stringify(a.settings[key]) !== JSON.stringify(b.settings[key])) reasons.push(`Unverified or different ${key}`)
  }
  const rows = fixture.cases.map(item => {
    const left = a.results?.find(result => result.id === item.id)
    const right = b.results?.find(result => result.id === item.id)
    if (!left || !right) reasons.push(`Missing result for ${item.id}`)
    for (const result of [left, right]) if (result?.supported === false && !result.reason) reasons.push(`Unsupported case needs a reason: ${item.id}`)
    const supported = left?.supported === true && right?.supported === true
    const metrics = ['correct', 'manualInterventions', 'latencyMs', 'usage', 'failure']
    const recorded = left && right && metrics.every(key => key in left && key in right)
    if (supported && !recorded) reasons.push(`Missing metrics for ${item.id}`)
    return { id: item.id, comparable: supported && recorded, dsh: left ?? null, jiuwen: right ?? null }
  })
  return { comparable: reasons.length === 0 && rows.some(row => row.comparable), reasons, rows,
    note: 'Unsupported cases are excluded. Missing usage is unknown, never zero. No harness advantage is inferred automatically.' }
}
if (process.argv[1] === import.meta.filename) {
  if (process.argv.length !== 4) { console.error('Usage: node scripts/compare.mjs DSH-results.json Jiuwen-results.json'); process.exitCode = 2 }
  else {
    const report = compare(...process.argv.slice(2).map(path => JSON.parse(readFileSync(path))))
    console.log(JSON.stringify(report, null, 2))
    if (!report.comparable) process.exitCode = 1
  }
}
