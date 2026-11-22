export interface BodyState {
  energy: number
  drowsiness: number
  line: string
  updatedAt: number
}

export const DEFAULT_BODY_STATE: BodyState = {
  energy: 82,
  drowsiness: 18,
  line: '今天也在好好陪着你。',
  updatedAt: 0,
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)))

export function normalizeBodyState(raw: unknown): BodyState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BODY_STATE }
  const value = raw as Partial<BodyState>
  const energy = Number(value.energy)
  const drowsiness = Number(value.drowsiness)
  return {
    energy: Number.isFinite(energy) ? clamp(energy) : DEFAULT_BODY_STATE.energy,
    drowsiness: Number.isFinite(drowsiness) ? clamp(drowsiness) : DEFAULT_BODY_STATE.drowsiness,
    line: typeof value.line === 'string' && value.line.trim() ? value.line.trim().slice(0, 120) : DEFAULT_BODY_STATE.line,
    updatedAt: Number.isFinite(value.updatedAt) ? Math.max(0, Number(value.updatedAt)) : 0,
  }
}

/** 随现实时间缓慢恢复：每小时精力最多回 4，困意最多回落 3。 */
export function currentBody(state: BodyState, at = Date.now()): BodyState {
  const normalized = normalizeBodyState(state)
  if (!normalized.updatedAt || at <= normalized.updatedAt) return normalized
  const hours = Math.min(24, (at - normalized.updatedAt) / 3_600_000)
  return {
    ...normalized,
    energy: clamp(normalized.energy + hours * 4),
    drowsiness: clamp(normalized.drowsiness - hours * 3),
    updatedAt: at,
  }
}

/** 回复会消耗一点精力，也会让困意轻轻上升。 */
export function afterReplyBody(state: BodyState, at = Date.now()): BodyState {
  const now = currentBody(state, at)
  return { ...now, energy: clamp(now.energy - 2), drowsiness: clamp(now.drowsiness + 2), updatedAt: at }
}

export function bodyTurnLine(state: BodyState): string {
  const body = currentBody(state)
  if (body.energy <= 20 || body.drowsiness >= 80) return '有点困了，想靠着你缓一会儿。'
  if (body.energy <= 45) return '今天电量不太满，但还是想陪你。'
  if (body.drowsiness >= 60) return '眼皮有点沉，声音也慢了一点。'
  return body.line
}

export function buildBodyPrompt(state: BodyState): string {
  const body = currentBody(state)
  return `【他的小天地·身体状态】\n这是你此刻自己的身体感受：精力 ${body.energy}/100，困意 ${body.drowsiness}/100。你可以自然地让语气带出一点疲惫、清醒或想休息，但不要提“数值”“状态条”或系统。必要时可在回复最后写一个隐藏标记：［身体状态：精力|困意|一句简短状态话］，例如［身体状态：68|30|还醒着，想听你说完］。除此之外不要输出任何代码或标记。`
}

export interface BodyTag {
  energy: number
  drowsiness: number
  line: string
}

export function parseBodyTag(text: string): BodyTag | null {
  const pattern = /[\[［]\s*身体状态\s*[:：]\s*(\d{1,3})\s*[|｜/]\s*(\d{1,3})\s*[|｜/]\s*([^\]］\n]{1,120})\s*[\]］]/g
  let match: RegExpExecArray | null
  let found: BodyTag | null = null
  while ((match = pattern.exec(text))) {
    found = { energy: clamp(Number(match[1])), drowsiness: clamp(Number(match[2])), line: match[3].trim() }
  }
  return found
}

export function stripBodyTags(text: string): string {
  return text
    .replace(/[\[［]\s*身体状态\s*[:：]\s*\d{1,3}\s*[|｜/]\s*\d{1,3}\s*[|｜/]\s*[^\]］\n]{1,120}\s*[\]］]/g, '')
    .replace(/[\[［]\s*身体状态[^\]］\n]{0,120}$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function applyBodyTag(state: BodyState, tag: BodyTag, at = Date.now()): BodyState {
  return {
    energy: clamp(tag.energy),
    drowsiness: clamp(tag.drowsiness),
    line: tag.line.trim().slice(0, 120) || bodyTurnLine(state),
    updatedAt: at,
  }
}
