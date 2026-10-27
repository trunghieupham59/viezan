// Pure Qt domain adapter. No UI, network, filesystem or timers; exercised in Node too.
// biome-ignore lint/correctness/noUnusedVariables: Public global read by QJSEngine and the contract test harness.
var Domain = (() => {
  const models = ['demo.standard', 'demo.slow', 'demo.failure']
  const languages = ['vi', 'en', 'ja']
  const appearanceModes = ['system', 'light', 'dark']
  const textSizes = ['small', 'medium', 'large']
  const appearance = state => state.appearance || {mode: 'system', textSize: 'medium'}
  const session = (id, feature) => ({id, feature, title: '', draft: '', model: models[0], source: 'en', target: 'vi', revision: 0, output: '', messages: []})
  const clone = value => JSON.parse(JSON.stringify(value))
  const running = (state, id) => state.tasks.find(task => task.request.sessionID === id && task.status === 'running')
  const current = state => state.sessions.find(item => item.id === state.active[state.feature])
  function create(chatID, translateID) {
    return {schemaVersion: 1, sessions: [session(chatID, 'chat'), session(translateID, 'translate')], tasks: [], active: {chat: chatID, translate: translateID}, feature: 'chat', locale: 'vi'}
  }
  function validate(state) {
    if (state?.schemaVersion !== 1 || !languages.includes(state.locale) || !['chat', 'translate'].includes(state.feature) || !Array.isArray(state.sessions) || !Array.isArray(state.tasks)) throw new Error('invalidData')
    if (state.appearance != null && (!appearanceModes.includes(state.appearance.mode) || !textSizes.includes(state.appearance.textSize))) throw new Error('invalidAppearance')
    if (state.shell != null && typeof state.shell.navigationCollapsed !== 'boolean') throw new Error('invalidShell')
    if (new Set(state.sessions.map(item => item.id)).size !== state.sessions.length || new Set(state.tasks.map(task => task.id)).size !== state.tasks.length) throw new Error('duplicateIdentity')
    for (const feature of ['chat', 'translate']) if (!state.sessions.some(item => item.id === state.active?.[feature] && item.feature === feature)) throw new Error('invalidActiveSession')
    for (const item of state.sessions) {
      if (!models.includes(item.model) || !languages.includes(item.source) || !languages.includes(item.target) || !Number.isInteger(item.revision) || item.revision < 0 || !Array.isArray(item.messages) || ['id','title','draft','output'].some(key => typeof item[key] !== 'string')) throw new Error('invalidSession')
    }
    for (const task of state.tasks) {
      if (!['running','succeeded','cancelled','failed','interrupted'].includes(task.status) || !state.sessions.some(item => item.id === task.request?.sessionID && item.feature === task.request.feature) || !models.includes(task.request.model) || typeof task.output !== 'string') throw new Error('invalidTask')
    }
    return state
  }
  function recover(saved) {
    const state = clone(validate(saved))
    for (const task of state.tasks) if (task.status === 'running') task.status = 'interrupted'
    return state
  }
  function canRetry(state, task) {
    return !['running','succeeded'].includes(task.status) && !running(state, task.request.sessionID) && (task.request.feature === 'chat' || state.sessions.find(item => item.id === task.request.sessionID)?.revision === task.request.revision)
  }
  function command(original, name, payload, id, attemptID) {
    const state = clone(original)
    const item = state.sessions.find(candidate => candidate.id === (payload.sessionID || state.active[state.feature]))
    if (name === 'navigate' && ['chat','translate'].includes(payload.feature)) state.feature = payload.feature
    else if (name === 'select' && item) { state.feature = item.feature; state.active[item.feature] = item.id }
    else if (name === 'locale' && languages.includes(payload.value)) state.locale = payload.value
    else if (name === 'navigation' && typeof payload.collapsed === 'boolean' && payload.collapsed !== !!state.shell?.navigationCollapsed) state.shell = {navigationCollapsed: payload.collapsed}
    else if (name === 'appearance' && (payload.mode === undefined || appearanceModes.includes(payload.mode)) && (payload.textSize === undefined || textSizes.includes(payload.textSize))) {
      const next = appearance(state)
      const mode = payload.mode ?? next.mode, textSize = payload.textSize ?? next.textSize
      if (mode !== next.mode || textSize !== next.textSize) state.appearance = {mode, textSize}
    }
    else if (name === 'new') { const fresh = session(id, state.feature); state.sessions.unshift(fresh); state.active[state.feature] = fresh.id }
    else if (name === 'draft' && item && item.draft !== payload.value) {
      if (item.feature === 'translate') { const task = running(state, item.id); if (task) task.status = 'cancelled'; item.output = '' }
      item.draft = payload.value; item.revision++
    } else if (name === 'model' && item && models.includes(payload.value)) item.model = payload.value
    else if (name === 'pair' && item && languages.includes(payload.source) && languages.includes(payload.target)) {
      const task = running(state, item.id); if (task) task.status = 'cancelled'
      item.source = payload.source; item.target = payload.target; item.revision++; item.output = ''
    } else if (name === 'submit' && item && item.draft.trim() && !running(state, item.id)) {
      const request = {sessionID: item.id, feature: item.feature, model: item.model, input: item.draft, source: item.source, target: item.target, revision: item.revision, locale: state.locale}
      if (!item.title) item.title = Array.from(item.draft).slice(0,64).join('').replace(/\n/g, ' ')
      if (item.feature === 'chat') { item.messages.push({id: `${id}-user`, role: 'user', text: item.draft}, {id, role: 'assistant', text: ''}); item.draft = '' }
      else item.output = ''
      state.tasks.unshift({id, attemptID, attemptNumber: 1, request, status: 'running', output: ''})
    } else if (name === 'cancel') {
      const task = state.tasks.find(task => task.id === payload.taskID && task.status === 'running'); if (task) task.status = 'cancelled'
    } else if (name === 'retry') {
      const task = state.tasks.find(task => task.id === payload.taskID)
      if (task && canRetry(state, task)) {
        task.attemptID = attemptID; task.attemptNumber++; task.status = 'running'; task.output = ''
        const target = state.sessions.find(candidate => candidate.id === task.request.sessionID)
        if (target.feature === 'translate') target.output = ''
        else { const message = target.messages.find(message => message.id === task.id); if (message) message.text = '' }
      }
    } else if (name === 'receive') {
      const task = state.tasks.find(task => task.id === payload.taskID && task.attemptID === payload.attemptID && task.status === 'running')
      if (task) {
        const target = state.sessions.find(candidate => candidate.id === task.request.sessionID)
        if (target && (target.feature === 'chat' || target.revision === task.request.revision)) {
          task.output += payload.chunk || ''
          if (target.feature === 'translate') target.output = task.output
          else { const message = target.messages.find(message => message.id === task.id); if (message) message.text = task.output }
          if (['succeeded','failed'].includes(payload.terminal)) task.status = payload.terminal
        } else task.status = 'cancelled'
      }
    }
    return state
  }
  return {create, validate, recover, command, current, running, canRetry}
})()
