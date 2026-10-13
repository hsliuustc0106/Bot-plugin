const $ = id => document.getElementById(id)
let selected, stream, state, snapshot, sending = false, pendingSubmission, refreshTimer, viewVersion = 0, refreshVersion = 0
const final = new Set(['completed', 'failed', 'cancelled', 'timed_out', 'interrupted'])
function error(err) { $('error').textContent = err.message }
async function api(path, value) {
  const res = await fetch(`/api${path}`, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data
}
function node(tag, content, className) { const el = document.createElement(tag); el.textContent = content; if (className) el.className = className; return el }
async function loadState() {
  state = await api('/state')
  $('conversations').replaceChildren(...state.conversations.map(conversation => {
    const button = node('button', conversation.name, conversation.id === selected ? 'selected' : '')
    button.onclick = () => choose(conversation.id).catch(error)
    return button
  }))
}
async function choose(id) {
  const version = ++viewVersion
  stream?.close(); clearTimeout(refreshTimer); refreshTimer = null; selected = id; pendingSubmission = null
  $('stop').disabled = true
  await loadState()
  if (version !== viewVersion) return
  await refresh()
  if (version !== viewVersion) return
  stream = new EventSource(`/api/conversations/${id}/events`)
  stream.onopen = () => { $('connection').textContent = 'Connected' }
  stream.onerror = () => { $('connection').textContent = 'Reconnecting…' }
  stream.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.conversationId !== selected) return
    if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refresh().catch(error) }, 60)
  }
}
async function refresh() {
  const id = selected
  const version = ++refreshVersion
  const next = await api(`/conversations/${id}`)
  if (selected !== id || version !== refreshVersion) return
  snapshot = next
  $('title').textContent = snapshot.conversation.name
  $('permission').value = snapshot.conversation.permission
  const botName = botId => snapshot.bots.find(bot => bot.id === botId)?.name ?? 'Bot'
  const cards = snapshot.messages.map(message => {
    const card = node('article', '', `card ${message.role}`)
    card.append(node('strong', message.role === 'user' ? 'You' : botName(message.botId)), node('p', message.text))
    return { time: message.createdAt, card }
  })
  for (const run of snapshot.runs.filter(run => run.status !== 'completed')) {
    const card = node('article', '', 'card')
    card.append(node('strong', botName(run.botId)), node('small', `${run.stage} · ${run.status}`), node('p', run.text || (run.status === 'queued' ? 'Waiting for an earlier turn…' : '')))
    if (run.error) card.append(node('p', typeof run.error === 'string' ? run.error : run.error.code))
    cards.push({ time: run.createdAt, card })
  }
  cards.sort((a, b) => a.time.localeCompare(b.time))
  $('messages').replaceChildren(...cards.map(item => item.card))
  const pending = snapshot.interactions.filter(item => item.status === 'pending')
  const existing = [...$('approvals').children].map(el => el.dataset.id).join(',')
  if (existing !== pending.map(item => item.id).join(',')) $('approvals').replaceChildren(...pending.map(interactionCard))
  $('stop').disabled = !snapshot.runs.some(run => !final.has(run.status))
}
function interactionCard(item) {
  const form = node('form', '', 'card approval'); form.dataset.id = item.id
  form.append(node('strong', item.kind === 'permission' ? 'Approval required' : 'Answer required'))
  const fields = item.questions.map(question => {
    const row = node('div', '', 'question'); row.append(node('label', question.question))
    const select = document.createElement('select'); select.append(new Option('Choose…', ''))
    for (const option of question.options) select.append(new Option(option.label, option.value))
    row.append(select)
    const custom = document.createElement('input'); custom.placeholder = 'Your answer'; custom.maxLength = 4000
    custom.setAttribute('aria-label', question.question)
    if (question.allow_custom_input) row.append(custom)
    form.append(row); return { select, custom }
  })
  const button = node('button', 'Submit answer'); form.append(button)
  form.onsubmit = async event => {
    event.preventDefault(); button.disabled = true
    try {
      await api(`/conversations/${item.conversationId}/runs/${item.runId}/interactions/${item.id}`, { answers: fields.map(({ select, custom }) => ({ selected_options: select.value ? [select.value] : [], custom_input: custom.value })) })
      await refresh()
    } catch (err) { error(err); button.disabled = false }
  }
  return form
}
$('compose').onsubmit = async event => {
  event.preventDefault(); if (sending) return
  sending = true; $('error').textContent = ''
  const text = $('message').value
  if (!pendingSubmission || pendingSubmission.text !== text || pendingSubmission.conversationId !== selected) pendingSubmission = { key: crypto.randomUUID(), text, conversationId: selected }
  try { await api(`/conversations/${selected}/messages`, pendingSubmission); $('message').value = ''; pendingSubmission = null; await refresh() }
  catch (err) { error(err) } finally { sending = false }
}
$('stop').onclick = async () => {
  const run = snapshot.runs.find(run => !final.has(run.status))
  if (run) try { await api(`/conversations/${selected}/runs/${run.id}/cancel`, {}); await refresh() } catch (err) { error(err) }
}
$('permission').onchange = () => api(`/conversations/${selected}/permission`, { permission: $('permission').value }).catch(error)
$('new-bot').onclick = async () => {
  const name = prompt('Bot name'); if (!name) return
  const instructions = prompt('Bot instructions'); if (!instructions) return
  try {
    const bot = await api('/bots', { name, instructions, role: 'worker' })
    const conversation = await api('/conversations', { name, kind: 'private', botIds: [bot.id] })
    await choose(conversation.id)
  } catch (err) { error(err) }
}
try { await api('/session', {}); await loadState(); await choose(state.conversations[0].id) } catch (err) { error(err) }
