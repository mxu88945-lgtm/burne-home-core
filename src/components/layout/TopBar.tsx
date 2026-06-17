import { usePrivacyStore } from '@/store/privacyStore'
import { useSettingsStore } from '@/store/settingsStore'

export default function TopBar() {
  const { enabled: lockEnabled, unlocked } = usePrivacyStore()
  const syncStatus = useSettingsStore((s) => s.syncStatus)

  return (
    <header className="flex items-center justify-between border-b border-home-border bg-home-bg/60 px-6 py-3 backdrop-blur">
      <div className="text-sm text-home-muted">主屋 · 长期记忆</div>
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded-full bg-home-card px-3 py-1 text-home-muted">
          同步：{syncStatus === 'idle' ? '未连接' : syncStatus}
        </span>
        <span className="rounded-full bg-home-card px-3 py-1 text-home-muted">
          {lockEnabled ? (unlocked ? '🔓 已解锁' : '🔒 已锁定') : '隐私锁未启用'}
        </span>
      </div>
    </header>
  )
}
