export interface PrivateEntry {
  id: string
  text: string
  createdAt: number
}

export interface PrivacyRoomState {
  enabled: boolean
  entries: PrivateEntry[]
  requestAt: number
  deniedUntil: number
  unlocked: boolean
}

export const DEFAULT_PRIVACY_ROOM: PrivacyRoomState = {
  enabled: false,
  entries: [],
  requestAt: 0,
  deniedUntil: 0,
  unlocked: false,
}

const SIX_HOURS = 6 * 60 * 60 * 1000

export function normalizePrivacyRoom(raw: unknown): PrivacyRoomState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRIVACY_ROOM }
  const value = raw as Partial<PrivacyRoomState>
  const entries = Array.isArray(value.entries)
    ? value.entries
        .filter((item): item is PrivateEntry => !!item && typeof item === 'object' && typeof (item as PrivateEntry).text === 'string')
        .slice(-30)
        .map((item) => ({ id: String(item.id || `private-${item.createdAt || Date.now()}`), text: item.text.trim().slice(0, 2000), createdAt: Number(item.createdAt) || Date.now() }))
        .filter((item) => item.text)
    : []
  return {
    enabled: value.enabled === true,
    entries,
    requestAt: Number(value.requestAt) > 0 ? Number(value.requestAt) : 0,
    deniedUntil: Number(value.deniedUntil) > 0 ? Number(value.deniedUntil) : 0,
    unlocked: value.unlocked === true,
  }
}

export function canRequest(state: PrivacyRoomState, at = Date.now()): boolean {
  return state.enabled && !state.unlocked && state.deniedUntil <= at && !state.requestAt
}

export function requestPrivacyAccess(state: PrivacyRoomState, at = Date.now()): PrivacyRoomState {
  if (!canRequest(state, at)) return state
  return { ...state, requestAt: at }
}

export function decidePrivacyAccess(state: PrivacyRoomState, decision: 'grant' | 'deny', at = Date.now()): PrivacyRoomState {
  if (!state.requestAt) return state
  if (decision === 'grant') return { ...state, requestAt: 0, unlocked: true, deniedUntil: 0 }
  return { ...state, requestAt: 0, deniedUntil: at + SIX_HOURS, unlocked: false }
}

export function addPrivateEntry(state: PrivacyRoomState, text: string, at = Date.now()): PrivacyRoomState {
  const clean = text.trim().slice(0, 2000)
  if (!clean) return state
  return { ...state, entries: [...state.entries, { id: `private-${at}-${Math.random().toString(36).slice(2, 8)}`, text: clean, createdAt: at }].slice(-30) }
}

export function parsePrivateEntryTag(text: string): string | null {
  const matches = [...text.matchAll(/[\[［]\s*隐私室\s*[:：|｜]\s*([^\]］\n]{1,2000})\s*[\]］]/g)]
  return matches.at(-1)?.[1]?.trim() || null
}

export function parsePrivacyDecisionTag(text: string): 'grant' | 'deny' | null {
  const matches = [...text.matchAll(/[\[［]\s*隐私室(?:决定|门禁)\s*[:：|｜]\s*(同意|允许|解锁|拒绝|不允许|上锁)[^\]］]*[\]］]/g)]
  const value = matches.at(-1)?.[1]
  if (!value) return null
  return /同意|允许|解锁/.test(value) ? 'grant' : 'deny'
}

export function stripPrivacyTags(text: string): string {
  return text
    .replace(/[\[［]\s*隐私室\s*(?:决定|门禁)?\s*[:：|｜]\s*[^\]］\n]{1,2000}\s*[\]］]/g, '')
    .replace(/[\[［]\s*隐私室[^\]］\n]{0,120}$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildPrivacyPrompt(state: PrivacyRoomState): string {
  if (!state.enabled) return ''
  const request = state.requestAt ? '她刚申请看隐私室，请你自己决定是否开门。' : '目前没有新的申请。'
  const unlocked = state.unlocked && state.entries.length
    ? `已经解锁的内容：\n${state.entries.map((entry) => `- ${entry.text}`).join('\n')}`
    : '隐私室目前上锁，里面的内容不要主动展示。'
  return `【他的小天地·隐私室】隐私室只属于你自己。你可以用隐藏标记［隐私室：内容］保存不给她看的内容；这段标记不会显示给她。${request}${unlocked}。她申请时，请在回复最后用［隐私室决定：同意］或［隐私室决定：拒绝］，并用你自己的话说明。这里的规则只涉及上锁、解锁和门禁；不要输出任何代码或标记。`
}
