export const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'timed_out', 'interrupted'])
export const limits = Object.freeze({ concurrency: 2, modelCallsPerTurn: 4, groupTurns: 3, delegationDepth: 1, timeoutMs: 180000 })
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status)
}
export function text(value, label, max = 20000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `Invalid ${label}`)
  return value.trim()
}
