import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { childEnvironment } from './environment.mjs'
import { AppError, limits, requireValue } from '../runtime-contracts/index.mjs'

export const readTool = Object.freeze({
  name: 'read_note', description: 'Read the shared note in this conversation workspace after host approval.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
})
const needed = ['custom_agent', 'run_model', 'empty_tools', 'host_tools', 'run_permissions', 'max_turns', 'cancel', 'session_resume', 'stable_event_fields', 'interaction_callback']
export class JiuwenRuntime {
  constructor(client) { this.makeClient = typeof client === 'function' ? client : () => client; this.active = new Map(); this.capabilities = null }
  get client() { return this.makeClient() }
  async inspectCapabilities() {
    const result = await this.client.query('protocol.capabilities', {}, { deadlineMs: 30000 })
    requireValue(result.status === 'completed', 'Runtime capability query failed', 503)
    const data = result.data
    requireValue(data?.supported_schema_versions?.includes('0.1') && needed.every(key => data.features?.[key]), 'Unsupported JiuwenSwarm capabilities', 503)
    requireValue(data.query_operations?.includes('session.get'), 'Session reopen is unsupported', 503)
    this.capabilities = data
    return data
  }
  async reopenSession(sessionId) {
    if (!this.capabilities) await this.inspectCapabilities()
    const result = await this.client.query('session.get', { session_id: sessionId }, { deadlineMs: 30000 })
    requireValue(result.status === 'completed' && result.data?.session, 'Runtime session cannot be reopened', 409)
    return result.data.session
  }
  cancelRun(runId) { this.active.get(runId)?.controller.abort() }
  answerInteraction(runId, interactionId, answers) {
    const pending = this.active.get(runId)?.interactions.get(interactionId)
    requireValue(pending, 'Runtime interaction has expired', 409)
    pending.resolve(answers)
    this.active.get(runId).interactions.delete(interactionId)
  }
  async startTurn(turn, handlers) {
    if (!this.capabilities) await this.inspectCapabilities()
    handlers.signal.throwIfAborted()
    const controller = new AbortController()
    const state = { controller, interactions: new Map() }
    this.active.set(turn.runId, state)
    const abort = () => controller.abort()
    handlers.signal.addEventListener('abort', abort, { once: true })
    const waitAnswer = payload => new Promise((resolveAnswer, reject) => {
      const id = payload.interaction_id
      requireValue(typeof id === 'string' && !state.interactions.has(id), 'Invalid runtime interaction', 502)
      state.interactions.set(id, { resolve: resolveAnswer, reject })
      Promise.resolve().then(() => handlers.onInteraction(payload)).then(answers => {
        if (state.interactions.has(id)) this.answerInteraction(turn.runId, id, answers)
      }, reject)
    })
    try {
      const result = await this.client.run({
        request_id: turn.runId, ...(turn.sessionId ? { session_id: turn.sessionId } : {}),
        input: turn.input, agent: { ...turn.agent, tools: [readTool.name], skills: [], max_iterations: limits.modelCallsPerTurn },
        ...(turn.model ? { model: turn.model } : {}),
        workspace: { cwd: turn.workspace, project_dir: turn.workspace, trusted_dirs: [] },
        host_tools: [readTool], permissions: { tools: { read_note: 'allow' } },
        max_turns: limits.modelCallsPerTurn, timeout_seconds: limits.timeoutMs / 1000,
      }, {
        signal: controller.signal, deadlineMs: limits.timeoutMs + 10000,
        onEvent: event => {
          if (event.session_id) handlers.onSession(event.session_id)
          if (controller.signal.aborted) return
          const payload = event.payload
          const types = { 'chat.delta': 'text.delta', 'chat.final': 'text.final', 'chat.tool_call': 'tool.requested', 'chat.tool_result': 'tool.result' }
          if (types[event.event_type]) handlers.onEvent(types[event.event_type], payload)
        },
        onInteraction: event => waitAnswer(event.payload),
        onToolCall: event => {
          controller.signal.throwIfAborted()
          return handlers.onToolCall(event.payload)
        },
      })
      if (result.session_id) handlers.onSession(result.session_id)
      return { status: result.status, output: result.output ?? '', usage: result.usage, error: result.error ? { code: result.error.code } : null }
    } catch (error) {
      // Avoid persisting stderr, credentials, model configuration or arbitrary exception text.
      throw new AppError(error.name === 'ProtocolError' ? 'Runtime protocol validation failed; outcome unknown' : 'Runtime transport failed; outcome unknown', 502)
    } finally {
      handlers.signal.removeEventListener('abort', abort)
      for (const pending of state.interactions.values()) pending.reject(new Error('Interaction expired'))
      this.active.delete(turn.runId)
    }
  }
}
export async function createRuntime({ dataDir, command, credentials = {}, sdkPath } = {}) {
  const sdk = sdkPath ?? resolve(import.meta.dirname, '../../.runtime/jiuwenswarm/sdks/typescript/dist/index.js')
  const { Client } = await import(pathToFileURL(sdk).href)
  return new JiuwenRuntime(() => new Client({ command, cwd: resolve(dataDir), env: childEnvironment(dataDir, credentials), shutdownGraceMs: 3000 }))
}
