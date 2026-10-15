// Original deterministic process fixture. No model, credentials or network are used.
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
const lines = createInterface({ input: process.stdin })
let request, sessionId, sequence = 0, finished = false
const send = value => process.stdout.write(`${JSON.stringify({ schema_version: '0.1', request_id: request.request_id, session_id: sessionId, sequence: sequence++, ...value })}\n`)
const event = (event_type, payload) => send({ type: 'event', event_type, payload })
const done = (status = 'completed', output = 'Fixture reply', code = 0) => {
  if (finished) return
  finished = true
  send({ type: 'result', status, exit_code: code, output, output_json: null, usage: { input_tokens: 10, output_tokens: 5, model_calls: 1 }, error: code ? { code: status.toUpperCase(), message: 'Fixture result' } : null })
  process.exitCode = code
  lines.close(); process.stdin.destroy()
}
const reply = async () => {
  const output = request.input.includes('Summarize the worker') ? 'Chief summary: the worker returned a result.' : request.input.includes('Carry out Chief') ? 'Worker result: task complete.' : request.input.includes('Assign a concrete') ? 'Worker, complete the requested task.' : 'Fixture reply: ' + request.input
  event('chat.delta', { text: output.slice(0, 8) })
  await new Promise(resolve => setTimeout(resolve, 20))
  if (finished) return
  event('chat.delta', { text: output.slice(8) })
  event('chat.final', { text: output })
  if (request.input === 'bad-exit') { done('completed', output); process.exitCode = 1; return }
  done('completed', output)
}
lines.on('line', line => {
  const value = JSON.parse(line)
  if (!request) {
    request = value; sessionId = value.type === 'query' ? null : value.session_id ?? randomUUID()
    if (value.type === 'query') {
      const features = Object.fromEntries(['custom_agent', 'run_model', 'empty_tools', 'host_tools', 'run_permissions', 'max_turns', 'cancel', 'session_resume', 'stable_event_fields', 'interaction_callback'].map(key => [key, true]))
      const data = value.operation === 'protocol.capabilities' ? { supported_schema_versions: ['0.1'], features, query_operations: ['session.get'], protocol_revision: 1 } : { session: { available: true } }
      send({ type: 'query_result', operation: value.operation, status: 'completed', exit_code: 0, error: null, data })
      lines.close(); process.stdin.destroy(); return
    }
    event('run.started', {})
    if (value.input === 'fail' || value.input.includes('FAIL_WORKER') && value.input.includes('Carry out Chief')) { done('failed', '', 1); return }
    if (value.input === 'hang') return
    if (value.input === 'truncate') { event('chat.final', { text: 'Not proof of success' }); lines.close(); process.stdin.destroy(); return }
    if (value.input === 'inspect-env') { done('completed', process.env.JIUWEN_TEST_SECRET ? 'LEAK' : 'CLEAN'); return }
    if (value.input === 'read note') { event('host_tool.requested', { call_id: 'read-1', name: 'read_note', arguments: {} }); return }
    if (value.input === 'question') {
      event('interaction.requested', { interaction_id: 'question-1', kind: 'question', questions: [{ question_id: 'q0', question: 'Which approach?', options: [{ value: 'brief', label: 'Brief' }], card_id: null, allow_custom_input: true }] }); return
    }
    void reply()
  } else if (value.type === 'cancel') done('cancelled', '', 130)
  else if (value.type === 'tool_result') done('completed', value.error ? 'Tool denied or unavailable.' : value.result.text)
  else if (value.type === 'answer') done('completed', `Answer: ${value.answers[0].custom_input || value.answers[0].selected_options.join(', ')}`)
})
