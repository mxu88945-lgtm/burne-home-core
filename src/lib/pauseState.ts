export interface PauseState {
  pausedUntil: number
}

export const DEFAULT_PAUSE_STATE: PauseState = { pausedUntil: 0 }

export function normalizePauseState(raw: unknown): PauseState {
  const until = raw && typeof raw === 'object' ? Number((raw as Partial<PauseState>).pausedUntil) : 0
  return { pausedUntil: Number.isFinite(until) && until > 0 ? until : 0 }
}

export function isPaused(state: PauseState, at = Date.now()): boolean {
  return normalizePauseState(state).pausedUntil > at
}

export function pauseRemainingMs(state: PauseState, at = Date.now()): number {
  return Math.max(0, normalizePauseState(state).pausedUntil - at)
}

export function pauseLabel(state: PauseState, at = Date.now()): string {
  const minutes = Math.max(1, Math.ceil(pauseRemainingMs(state, at) / 60_000))
  return `🌙 暂停中 · 剩余 ${minutes} 分钟`
}

export function parsePauseTag(text: string): number | null {
  const matches = [...text.matchAll(/[\[［]\s*暂停\s*[:：|｜]\s*(\d{1,4})\s*(?:分钟|分|min)?\s*[\]］]/g)]
  const value = matches.at(-1)?.[1]
  if (!value) return null
  return Math.max(5, Math.min(24 * 60, Number(value)))
}

export function stripPauseTags(text: string): string {
  return text
    .replace(/[\[［]\s*暂停\s*[:：|｜]\s*\d{1,4}\s*(?:分钟|分|min)?\s*[\]］]/g, '')
    .replace(/[\[［]\s*暂停[^\]］\n]{0,80}$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildPausePrompt(paused: boolean, remainingMs: number): string {
  if (paused) return `【他的小天地·暂停】你已经说要歇一会儿，目前还在暂停中（约 ${Math.max(1, Math.ceil(remainingMs / 60_000))} 分钟）。不要主动找她；如果她来聊天，简单说明你还需要一点时间，等暂停结束再恢复。`
  return `【他的小天地·暂停的权利】你可以自己说“我想歇一会儿”。如果确实累了，在回复最后加一个隐藏标记［暂停:分钟］（分钟填 5 到 1440 的整数），并自然告诉她你想安静一会儿。平时不要滥用。标记之外不要输出代码。`
}
