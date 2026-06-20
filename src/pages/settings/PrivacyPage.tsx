import SubPage from '@/components/settings/SubPage'
import { usePrivacyStore } from '@/store/privacyStore'

export default function PrivacyPage() {
  const privacy = usePrivacyStore()
  return (
    <SubPage title="隐私锁 🔒">
      <div className="glass rounded-2xl p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">启用隐私锁</span>
          <input
            type="checkbox"
            checked={privacy.enabled}
            onChange={(e) => privacy.setEnabled(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <p className="mt-2 text-[11px] text-muted">
          口令解锁与本地加密后续接入。
        </p>
      </div>
    </SubPage>
  )
}
