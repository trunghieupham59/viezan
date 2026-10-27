// Offline adapter: exported browser data -> the native import preview format.
// Usage: node scripts/native/convert-legacy.mjs INPUT.json OUTPUT.json
// Refuses to overwrite output. Does not access the old profile or credentials.
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
const [input, output, ...extra] = process.argv.slice(2)
if (!input || !output || extra.length) throw new Error('Usage: convert-legacy.mjs INPUT.json OUTPUT.json')
const hash = data => createHash('sha256').update(data).digest('hex')
const uuid = value => { const h = hash(String(value)); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}` }
const stat = await fs.stat(input)
if (!stat.isFile() || stat.size > 128000000) throw new Error('Invalid export size')
const envelope = JSON.parse(await fs.readFile(input, 'utf8'))
if (envelope.format !== 'viezan-legacy-export' || envelope.version !== 1 || typeof envelope.payload !== 'string' || hash(envelope.payload) !== envelope.sha256) throw new Error('Invalid legacy export checksum')
const { state, recovery = {}, images = {}, missingImages = [] } = JSON.parse(envelope.payload)
if (!state || !Array.isArray(state.chatSessions)) throw new Error('Unsupported legacy state')
if (missingImages.length) throw new Error(`${missingImages.length} referenced images are missing. Restore the old image store before exporting again.`)
const languages = ['vi','en','ja','zh','zh-TW','ko','fr','de','es','pt','ru','ar','th','id','it','nl','pl','tr','hi']
const lang = (value, source = false) => languages.includes(value) || (source && value === 'auto') ? value : source ? 'auto' : 'en'
const locale = ['en','vi','ja'].includes(state.locale) ? state.locale : 'en'
const list = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value : ''
const model = value => {
  const provider = value.provider === 'anthropic' ? 'claude' : value.provider === 'local' ? (['lmstudio','llamacpp'].includes(value.engine || state.localAiEngine) ? value.engine || state.localAiEngine : 'ollama') : value.provider
  if (!['ollama','lmstudio','llamacpp','openai','claude','gemini'].includes(provider) || !text(value.model) || /[\x00-\x1f\x7f]/u.test(value.model)) throw new Error('An exported record has an unsupported provider/model; source export remains unchanged')
  return `${provider}:${value.model}`
}
const tasks = [], sessions = [], attachments = new Map(), active = {}, meetings = []
const stt = value => ({auto:'auto',whisper:'openai',google:'gemini',openai:'openai',gemini:'gemini',groq:'groq'}[value] || 'openai')
function fresh(feature, key, original = {}) {
  return { id: uuid(`${feature}:${key}`), feature, title: text(original.title), draft: '', model: model(original.provider && original.model ? original : {provider:'ollama', model:'llama3.2'}), source: lang(original.sourceLang || state.sourceLang, true), target: lang(original.targetLang || state.targetLang), revision: 0, output: '', messages: [] }
}
function image(part) {
  const stored = images[part.imageStoreKey] || part
  const data = text(stored.imageBase64 || stored.base64)
  const mime = text(stored.imageMimeType || stored.mimeType || part.imageMimeType)
  if (!data || !['image/png','image/jpeg','image/webp','image/gif'].includes(mime) || !/^[A-Za-z0-9+/]*={0,2}$/u.test(data)) throw new Error('Missing or invalid image payload')
  const bytes = Buffer.from(data, 'base64')
  if (!bytes.length || bytes.length > 20000000) throw new Error('Invalid image size')
  const id = uuid(`image:${hash(bytes)}`), name = text(part.imageFileName || part.fileName) || 'image'
  const record = { id, name, mime }
  const existing = attachments.get(id)
  if (existing) return {id, name: existing.name, mime: existing.mime}
  attachments.set(id, {...record, data: bytes.toString('base64'), sha256:hash(bytes)})
  return record
}
for (const old of state.chatSessions) {
  const session = fresh('chat', old.id, old); session.draft = text(old.draftInput)
  session.chatMode = old.imageMode ? 'image' : old.deepResearchMode ? 'research' : old.webSearchMode ? 'web' : 'text'
  session.carefulReasoning = old.carefulReasoning === true
  session.systemPrompt = text(state.chatSystemPrompt)
  session.messages = list(old.messages).map((message, index) => {
    const content = list(message.content), parts = content.filter(part => part.type === 'image').map(image)
    if (parts.length > 4) throw new Error('A message exceeds the native attachment limit')
    return {id:uuid(`message:${old.id}:${message.id || index}`), role:message.role, text: typeof message.content === 'string' ? message.content : content.filter(part => part.type === 'text').map(part => text(part.text)).join('\n'), ...(parts.length ? {images:parts} : {})}
  })
  for (const [index, message] of list(old.messages).entries()) {
    if (message.role !== 'assistant') continue
    const cost = message.cost
    if (!cost || !Number.isFinite(cost.inputTokens) || !Number.isFinite(cost.outputTokens)) continue
    const native = session.messages[index]
    tasks.push({id:native.id,attemptID:uuid(`attempt:${native.id}`),attemptNumber:1,status:'succeeded',output:native.text,usage:{input:Math.max(0,Math.trunc(cost.inputTokens)),output:Math.max(0,Math.trunc(cost.outputTokens))},request:{sessionID:session.id,feature:'chat',model:session.model,input:'',source:session.source,target:session.target,revision:0,locale}})
  }
  const resume = old.deepResearchResumeState
  if (resume && resume.lastCompletedPhase !== 'synth') {
    const done = new Set(list(resume.surveyCompletedIndexes))
    const remaining = list(resume.aspects).filter((v,i)=>!done.has(i) && !list(resume.surveyCompletedAspects).includes(v)).map(text)
    const gap = resume.activeGapRound
    const gapDone = new Set(list(gap?.completedQueryIndexes))
    const queries = gap ? list(gap.queries).filter((v,i)=>!gapDone.has(i)).map(text) : remaining
    if (queries.length > 6 || list(resume.knowledgeBase).length > 18 || list(resume.sources).length > 160) throw new Error('Research checkpoint exceeds native limits; keep original export and finish that research before retrying')
    const id = uuid(`research:${old.id}`)
    const research = {phase:resume.lastCompletedPhase==='cross'?'synth':queries.length?(gap?'gap':'survey'):'cross',queries,cursor:0,round:Math.min(3,Math.max(0,Number(resume.lastGapIteration)||0)),findings:list(resume.knowledgeBase).map(v=>text(v.label)+'\n'+text(v.content)),sources:list(resume.sources).map(v=>({title:text(v.title),url:text(v.url),content:''})),crossReference:text(resume.crossContent)}
    tasks.push({id,attemptID:uuid(`attempt:${id}`),attemptNumber:1,status:'interrupted',output:'',research,request:{sessionID:session.id,feature:'chat',model:session.model,input:text(resume.question),source:session.source,target:session.target,revision:0,locale,chatMode:'research'}})
    session.messages.push({id,role:'assistant',text:''})
  }
  sessions.push(session); if (old.id === state.activeChatSessionId) active.chat = session.id
}
for (const old of list(state.history)) {
  const session = fresh('translate', old.id, old); session.draft = text(old.sourceText); session.output = text(old.translatedText)
  if (['auto','low','medium','high'].includes(old.reasoningEffort || state.translationReasoningEffort)) session.reasoningEffort = old.reasoningEffort || state.translationReasoningEffort
  if (['general','formal','casual','business','technical','natural'].includes(old.translationStyle)) session.translationStyle = old.translationStyle
  sessions.push(session)
  for (const [index, result] of list(old.results).entries()) {
    const child = fresh('translate', `${old.id}:comparison:${index}`, {...old,...result}); child.draft = session.draft; child.output = text(result.translatedText); child.comparisonParent = session.id; child.comparisonRevision = 0; sessions.push(child)
    const id=uuid(`comparison-task:${child.id}`); tasks.push({id,attemptID:uuid(`attempt:${id}`),attemptNumber:1,status:'succeeded',output:child.output,request:{sessionID:child.id,feature:'translate',model:child.model,input:child.draft,source:child.source,target:child.target,revision:0,locale}})
  }
}
for (const old of list(state.dictionaryEntries)) {
  const session = fresh('dictionary', old.id, old); session.draft = text(old.term); session.dictionaryContext = text(old.context); session.favorite = !!old.favorite; session.output = JSON.stringify(old.result || {}); sessions.push(session)
}
for (const old of list(state.liveSessions)) {
  const segments = list(old.segments).map((segment,index,all) => {
    const origin = Number(all[0]?.timestamp) || Number(old.createdAt) || 0
    const start = Math.max(0, ((Number(segment.timestamp) || origin) - origin) / 1000), next = (Number(all[index+1]?.timestamp) - origin) / 1000
    return { id:uuid(`segment:${old.id}:${segment.id || index}`), start, end:Number.isFinite(next) ? Math.max(start,next) : start, original:text(segment.rawText), translated:text(segment.translation), status:'succeeded', speaker:text(segment.speaker) }
  })
  if (!segments.length && (old.rawTranscript || old.translation)) segments.push({id:uuid(`segment:${old.id}:whole`),start:0,end:0,original:text(old.rawTranscript),translated:text(old.translation),status:'succeeded'})
  meetings.push({id:uuid(`live:${old.id}`),created:(Number(old.createdAt)||0)/1000,model:model(old),provider:stt(state.sttProvider),source:lang(old.sourceLang,true),target:lang(old.targetLang),locale,segments,summary:text(old.summary),speakerAnalysis:text(old.speakerAnalysis),actionItems:text(old.actionItems),decisions:text(old.decisions),speakerNameMap:old.speakerNameMap||{}})
}
for (const feature of ['translate','dictionary']) {
  const old = recovery[feature]?.snapshot
  if (!old) continue
  const session = fresh(feature, 'recovered-draft', list(old.translationModels)[0] || {})
  session.source = lang(old.sourceLang,true); session.target = lang(old.targetLang); session.draft = text(feature==='translate'?old.sourceText:old.term); session.output = text(old.translatedText); session.dictionaryContext = text(old.context)
  if (['general','formal','casual','business','technical','natural'].includes(old.translationStyle)) session.translationStyle = old.translationStyle
  if (['auto','low','medium','high'].includes(old.translationReasoningEffort)) session.reasoningEffort = old.translationReasoningEffort
  if (old.imageAttachment) {
    session.images = [image(old.imageAttachment)]
    const context = old.resultContext
    const matches = context && typeof context.imageAttachment?.base64 === 'string' && context.imageAttachment.base64 === old.imageAttachment.base64 && context.imageAttachment.mimeType === old.imageAttachment.mimeType && context.sourceLang === old.sourceLang && context.targetLang === old.targetLang && context.sourceText === old.sourceText
    if (matches && (Array.isArray(old.imageRegions) || old.editedImageUrl)) {
      if (Array.isArray(old.imageRegions)) session.output = JSON.stringify({regions:old.imageRegions})
      if (old.editedImageUrl) {
        const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/u.exec(old.editedImageUrl)
        if (!match) throw new Error('The edited translation image is not embedded; export it from the old app before importing')
        session.messages = [{id:uuid(`translated-image:${session.id}`),role:'assistant',text:session.output,images:[image({base64:match[2],mimeType:match[1],fileName:'translation'})]}]
      }
      const id = uuid(`image-task:${session.id}`)
      tasks.push({id,attemptID:uuid(`attempt:${id}`),attemptNumber:1,status:'succeeded',output:session.output,request:{sessionID:session.id,feature:'translate',model:session.model,input:session.draft,source:session.source,target:session.target,revision:0,locale,messages:[{role:'user',content:session.draft,images:session.images}]}})
    }
  }
  sessions.push(session); active[feature] = session.id
}
for (const feature of ['chat','translate','dictionary']) if (!active[feature]) {
  let session = sessions.find(item=>item.feature===feature && !item.comparisonParent)
  if (!session) { session=fresh(feature,'empty'); if(feature==='chat') session.draft=text(state.chatPendingDraft); sessions.push(session) }
  active[feature]=session.id
}
const prompts = list(state.systemPromptPresets).map((prompt,index)=>({id:uuid(`prompt:${prompt.id||index}`), name:text(prompt.name).slice(0,100), text:text(prompt.prompt || prompt.content || prompt.text)}))
const workspace = {schemaVersion:1,sessions,tasks,active,feature:'chat',locale,prompts,appearance:{mode:['light','dark'].includes(state.theme)?state.theme:'system',textSize:['small','medium','large'].includes(state.fontSize)?state.fontSize:'medium'},shell:{navigationCollapsed:!!state.sidebarCollapsed}}
workspace.autoTranslate = state.autoTranslate === true
workspace.autoTranslateDelay = Number.isInteger(state.autoTranslateDelay) ? Math.min(5000,Math.max(100,state.autoTranslateDelay)) : 800
workspace.speechProvider = stt(state.sttProvider)
workspace.voice = {provider: ['edge','openai','gemini','elevenlabs'].includes(state.ttsMode) ? state.ttsMode : 'system', voice: text(state.ttsVoice)}
const snapshot = Buffer.from(JSON.stringify(workspace)), meetingData = Buffer.from(JSON.stringify(meetings))
const result = JSON.stringify({format:'viezan-native-backup',version:1,workspace:snapshot.toString('base64'),sha256:hash(snapshot),attachments:[...attachments.values()],interpretation:meetingData.toString('base64'),interpretationSHA256:hash(meetingData),legacyArchive:envelope})
if (Buffer.byteLength(result)>128000000) throw new Error('Converted backup exceeds the import limit')
await fs.writeFile(output,result,{flag:'wx',mode:0o600})
console.log(`Prepared ${sessions.length} sessions, ${meetings.length} interpretations and ${attachments.size} images. Import the output through native Settings > Data to review it.`)
