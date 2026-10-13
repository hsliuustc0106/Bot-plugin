import { resolve } from 'node:path'
export const root = resolve(import.meta.dirname, '../..')
export function runtimeOptions(mock = false) {
  const dataDir = resolve(process.env.JIUWEN_BOT_DATA ?? resolve(root, '.data', mock ? 'mock' : 'live'))
  const credentials = {}
  for (const key of (process.env.JIUWEN_BOT_CREDENTIAL_VARS ?? '').split(',').filter(Boolean)) {
    // Only credential names are accepted, never loader, path or process-control settings.
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(key)) throw new Error('Invalid credential environment variable name')
    if (process.env[key]) credentials[key] = process.env[key]
  }
  const python = process.env.JIUWEN_BOT_PYTHON ?? resolve(root, '.venv/bin/python')
  const command = mock ? [process.execPath, resolve(root, 'tests/fixtures/process.mjs')] : [python, '-m', 'jiuwenswarm.channels.process_cli.main']
  return { dataDir, credentials, command }
}
