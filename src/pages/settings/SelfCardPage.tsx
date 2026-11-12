import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import SubPage from '@/components/settings/SubPage'
import { useSelfCardStore } from '@/store/selfCardStore'
import { useChatPrefsStore } from '@/store/chatPrefsStore'
import { usePersonaStore } from '@/store/personaStore'
import { useProfileStore } from '@/store/profileStore'
import {
  SELF_CARD_SECTION_MAX,
  SELF_CARD_SECTIONS,
  SELF_CARD_TOTAL_MAX,
  selfCardLength,
  type SelfCard,
  type SelfCardKey,
} from '@/lib/selfCard'

const when = (at: number) =>
  at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/**
 * iOS PWA：键盘开着时点按钮，输入框先失焦、页面一跳，click 常常丢。按下抬起（pointerup）就执行，
 * 紧跟着的 click 不再重复执行（键盘/桌面的 click 照常）。
 */
function useTap() {
  const last = useRef(0)
  return (action: () => void) => ({
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      last.current = Date.now()
      action()
    },
    onClick: () => {
      if (Date.now() - last.current < 600) return
      action()
    },
  })
}

/** 输入框聚焦：等键盘弹完再把它滚到可见区域中间（iOS 不会自己滚好） */
function scrollFieldIntoView(e: FocusEvent<HTMLElement>) {
  const el = e.currentTarget
  window.setTimeout(() => {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      /* noop */
    }
  }, 320)
}

/** 设置 → 他自己写的卡：每栏可编辑（离开输入框 / 离开页面时保存），展开收起，历史可恢复，开关「让他自己补全」。 */
export default function SelfCardPage() {
  const card = useSelfCardStore((s) => s.card)
  const history = useSelfCardStore((s) => s.history)
  const setSection = useSelfCardStore((s) => s.setSection)
  const restore = useSelfCardStore((s) => s.restore)
  const enabled = useChatPrefsStore((s) => s.selfCardEdit)
  const setEnabled = useChatPrefsStore((s) => s.setSelfCardEdit)
  const personaName = usePersonaStore((s) => s.persona.name)
  const nameB = useProfileStore((s) => s.profile.nameB)
  const nameA = useProfileStore((s) => s.profile.nameA)
  // 默认资料是「我 / 你」，这里不拿来当名字
  const herName = nameA && nameA !== '我' ? nameA : '惟惟'
  const name = personaName || (nameB && nameB !== '你' ? nameB : '伯恩')
  const tap = useTap()

  const [drafts, setDrafts] = useState<SelfCard>(card)
  const signature = JSON.stringify(card)
  // 他在聊天里改了卡（或恢复了历史），输入框跟着换成新内容。
  useEffect(() => {
    setDrafts(JSON.parse(signature) as SelfCard)
  }, [signature])

  // 返回 / 切走 / 关掉装机版时输入框可能来不及失焦：把没保存的栏目补存一次。
  const pending = useRef({ drafts, card })
  pending.current = { drafts, card }
  useEffect(() => {
    const flush = () => {
      const { drafts: last, card: saved } = pending.current
      SELF_CARD_SECTIONS.forEach(({ key }) => {
        if (last[key] !== undefined && (last[key] || '').trim() !== (saved[key] || '')) {
          useSelfCardStore.getState().setSection(key, last[key] || '', 'her')
        }
      })
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const [open, setOpen] = useState<Partial<Record<SelfCardKey, boolean>>>({})
  const total = selfCardLength(card)
  const versions = history.map((version, index) => ({ version, index })).reverse()

  return (
    <SubPage title="他自己写的卡">
      <p className="px-1 text-[12px] leading-relaxed text-muted">
        {name}在和{herName}相处里慢慢补全的自己。原来的人设卡一个字都不动，这份紧跟在原卡后面一起带给他。
      </p>

      <div className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">让他自己补全</div>
          <div className="text-[11px] text-muted">相处中偶尔改一栏，消息下面会出「✎ 他改了自己的…」</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="让他自己补全"
          {...tap(() => setEnabled(!useChatPrefsStore.getState().selfCardEdit))}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled ? 'bg-accent' : 'bg-black/15'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? 'translate-x-4' : ''}`}
          />
        </button>
      </div>

      {SELF_CARD_SECTIONS.map(({ key, label }) => {
        const value = drafts[key] || ''
        const isOpen = !!open[key]
        return (
          <div key={key} className="glass rounded-2xl px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <label htmlFor={`self-card-${key}`} className="flex-1 text-sm font-medium text-ink">
                {label}
                <span className="ml-2 text-[11px] font-normal text-muted">
                  {value.length} / {SELF_CARD_SECTION_MAX}
                </span>
              </label>
              <button
                type="button"
                aria-expanded={isOpen}
                {...tap(() => setOpen((cur) => ({ ...cur, [key]: !cur[key] })))}
                className="rounded-full px-2 py-0.5 text-[11px] text-accent"
              >
                {isOpen ? '收起' : '展开'}
              </button>
            </div>
            <textarea
              id={`self-card-${key}`}
              rows={isOpen ? 12 : 3}
              maxLength={SELF_CARD_SECTION_MAX}
              value={value}
              placeholder="还空着"
              onFocus={scrollFieldIntoView}
              onChange={(e) => {
                const v = e.target.value
                setDrafts((cur) => ({ ...cur, [key]: v }))
              }}
              onBlur={() => {
                if ((drafts[key] || '').trim() !== (card[key] || '')) setSection(key, drafts[key] || '', 'her')
              }}
              className={`block w-full resize-y rounded-xl border border-line bg-white/40 px-3 py-2 text-base leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent ${isOpen ? 'min-h-[16rem]' : 'min-h-[4.5rem]'}`}
            />
          </div>
        )
      })}

      <p className="px-1 text-[11px] text-muted" role="status">
        离开输入框时自动保存 · 合计 {total} / {SELF_CARD_TOTAL_MAX}
      </p>

      {versions.length > 0 && (
        <details className="glass rounded-2xl px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">历史 · {versions.length} 版</summary>
          {versions.map(({ version, index }) => (
            <div key={`${version.at}-${index}`} className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] text-ink">{version.reason ? `${version.reason}之前` : '旧版本'}</div>
                <div className="text-[10px] text-muted">
                  {when(version.at)} · {selfCardLength(version.card)} 字
                </div>
              </div>
              <button
                type="button"
                {...tap(() => {
                  if (window.confirm('恢复到这一版？现在的内容也会留在历史里。')) restore(index)
                })}
                className="shrink-0 rounded-full border border-accent/40 px-2.5 py-1 text-[11px] text-accent"
              >
                恢复到这一版
              </button>
            </div>
          ))}
        </details>
      )}
    </SubPage>
  )
}
