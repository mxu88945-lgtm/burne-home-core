import SubPage from '@/components/settings/SubPage'
import { setSenseEnabled, setSenseKind, startSavedSense } from '@/lib/senseRuntime'
import { useSenseStore } from '@/store/senseStore'
import type { SenseKind } from '@/lib/senseInteraction'
import { useEffect } from 'react'

const ITEMS: { kind: SenseKind; label: string; hint: string }[] = [
  { kind: 'blow', label: '吹气', hint: '对着手机轻轻吹一口气。' },
  { kind: 'shake', label: '摇晃', hint: '晃一晃手机。' },
  { kind: 'rotation', label: '转动', hint: '向左、向右转一转手机。' },
  { kind: 'longPress', label: '长按', hint: '在聊天区域长按一下。' },
]

export default function SensePage() {
  const enabled = useSenseStore((s) => s.enabled)
  const permissionMessage = useSenseStore((s) => s.permissionMessage)
  const values = useSenseStore((s) => ({ blow: s.blow, shake: s.shake, rotation: s.rotation, longPress: s.longPress }))

  useEffect(() => {
    void startSavedSense()
  }, [])

  return (
    <SubPage title="感知互动 📱">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">让他感觉到你在碰手机</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            默认关闭，只在主聊天生效。录音只在本机分析，不上传、不保存；第一次打开具体项目时，才会在那一刻请求 iPhone 权限。
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">总开关<span className="mt-0.5 block text-[11px] text-muted">关掉后不会监听，也不会请求权限。</span></span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void setSenseEnabled(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <div className="space-y-2">
          {ITEMS.map(({ kind, label, hint }) => (
            <div key={kind} className="flex items-start justify-between gap-3 rounded-xl bg-white/20 px-3 py-2.5">
              <span className="text-sm text-ink">
                {label}
                <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>
                {permissionMessage[kind] && <span className="mt-1 block text-[11px] text-accent">{permissionMessage[kind]}</span>}
              </span>
              <input
                type="checkbox"
                checked={values[kind]}
                disabled={!enabled}
                onChange={(e) => void setSenseKind(kind, e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              />
            </div>
          ))}
        </div>
      </div>
    </SubPage>
  )
}
