/**
 * 他管着你（锁屏 / 宵禁 / 限次）。App 里的锁屏盖层本地就能用；
 * 开了「门」（gateOn）后，状态同步到 burne-gate，iPhone 快捷指令靠它拦别的 App。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { GATE_BASE, type GateReport, type GuardCommand, type GuardLock } from '@/lib/guard'

interface Persisted {
  /** 让他能锁屏（聊天里给他说明） */
  enabled: boolean
  gateOn: boolean
  key: string
  curfew: { on: boolean; start: string; end: string }
  limit: { on: boolean; max: number }
  lock: GuardLock | null
  /** 已经告诉过他的告状截止时间 */
  toldUntil: number
  /** 没开门时，App 里偷偷解锁记在本地 */
  localBreach: { at: number; minutes: number; reason: string } | null
}

const DEFAULT: Persisted = {
  enabled: true,
  gateOn: false,
  key: '',
  curfew: { on: true, start: '23:30', end: '07:00' },
  limit: { on: true, max: 10 },
  lock: null,
  toldUntil: 0,
  localBreach: null,
}

const init: Persisted = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.guard, {}) }

function newKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return 'bw' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function post(key: string, body: Record<string, unknown>): Promise<GateReport | null> {
  try {
    const r = await fetch(`${GATE_BASE}/state?k=${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return r.ok ? ((await r.json()) as GateReport) : null
  } catch {
    return null
  }
}

interface GuardState extends Persisted {
  report: GateReport | null
  setEnabled: (v: boolean) => void
  enableGate: (profile: { name: string; avatar: string }) => Promise<boolean>
  disableGate: () => void
  setCurfew: (c: Partial<Persisted['curfew']>) => void
  setLimit: (l: Partial<Persisted['limit']>) => void
  /** 回复里的标记生效 */
  apply: (cmds: GuardCommand[]) => void
  /** App 里点了「偷偷解锁」 */
  sneak: () => void
  /** 发消息前拉一下今天的情况（1.5 秒没回就算了） */
  fetchReport: () => Promise<GateReport | null>
  markTold: () => void
  pushProfile: (profile: { name: string; avatar: string }) => void
}

export const useGuardStore = create<GuardState>((set, get) => {
  const persisted = (): Persisted => {
    const s = get()
    return { enabled: s.enabled, gateOn: s.gateOn, key: s.key, curfew: s.curfew, limit: s.limit, lock: s.lock, toldUntil: s.toldUntil, localBreach: s.localBreach }
  }
  const save = (patch: Partial<Persisted>) => {
    set(patch)
    writeJSON(STORAGE_KEYS.guard, persisted())
  }
  const sync = (body: Record<string, unknown>) => {
    const { gateOn, key } = get()
    if (!gateOn || !key) return
    void post(key, body).then((report) => report && set({ report }))
  }
  return {
    ...init,
    lock: init.lock && init.lock.until > Date.now() ? init.lock : null,
    report: null,

    setEnabled: (enabled) => save({ enabled }),

    enableGate: async (profile) => {
      const key = get().key || newKey()
      const report = await post(key, { name: profile.name, avatar: profile.avatar, curfew: get().curfew, limit: get().limit, lock: get().lock })
      if (!report) return false
      save({ key, gateOn: true })
      set({ report })
      return true
    },

    disableGate: () => {
      const { key } = get()
      if (key) void post(key, { curfew: { ...get().curfew, on: false }, limit: { ...get().limit, on: false }, lock: null })
      save({ gateOn: false })
    },

    setCurfew: (c) => {
      const curfew = { ...get().curfew, ...c }
      save({ curfew })
      sync({ curfew })
    },

    setLimit: (l) => {
      const limit = { ...get().limit, ...l, max: Math.max(1, Math.min(99, Math.round((l.max ?? get().limit.max) || 10))) }
      save({ limit })
      sync({ limit })
    },

    apply: (cmds) => {
      if (!cmds.length || !get().enabled) return
      for (const c of cmds) {
        if (c.kind === 'lock') {
          const now = Date.now()
          const lock = { until: now + c.minutes * 60000, startedAt: now, reason: c.reason }
          save({ lock })
          sync({ lock })
        } else if (c.kind === 'unlock') {
          save({ lock: null })
          sync({ lock: null })
        } else if (c.kind === 'curfew') {
          sync({ tonight: c.start })
        }
      }
    },

    sneak: () => {
      const { lock, gateOn, key } = get()
      if (!lock) return
      const minutes = Math.max(1, Math.ceil((lock.until - Date.now()) / 60000))
      if (gateOn && key) void fetch(`${GATE_BASE}/sneak?k=${key}&app=${encodeURIComponent('伯恩')}`, { method: 'POST' }).catch(() => {})
      else save({ localBreach: { at: Date.now(), minutes, reason: lock.reason } })
      save({ lock: null })
    },

    fetchReport: async () => {
      const { gateOn, key } = get()
      if (!gateOn || !key) return null
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 1500)
        const r = await fetch(`${GATE_BASE}/report?k=${key}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const report = (await r.json()) as GateReport
        // 服务器上的锁（比如另一台设备）跟本地对齐
        const lock = report.lock && report.lock.until > Date.now() ? report.lock : null
        set({ report })
        if ((lock?.until || 0) !== (get().lock?.until || 0)) save({ lock })
        return report
      } catch {
        return null
      }
    },

    markTold: () => save({ toldUntil: Date.now(), localBreach: null }),

    pushProfile: (profile) => sync({ name: profile.name, avatar: profile.avatar }),
  }
})

/** 没开门时的本地告状，并成服务器报告的格式。 */
export function localBreachReport(s: Persisted): GateReport | null {
  if (!s.localBreach) return null
  return {
    lock: null,
    curfew: s.curfew,
    curfewNow: false,
    curfewStart: null,
    limit: s.limit,
    counts: {},
    opens: [],
    breaches: [{ at: s.localBreach.at, kind: 'lock', app: '伯恩', minutes: s.localBreach.minutes, reason: s.localBreach.reason }],
  }
}
