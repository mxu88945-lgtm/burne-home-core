import SubPage from '@/components/settings/SubPage'
import UsagePanel from '@/components/settings/UsagePanel'

export default function UsagePage() {
  return (
    <SubPage title="用量 · 账单 📊">
      <div className="glass rounded-2xl p-4">
        <UsagePanel />
      </div>
    </SubPage>
  )
}
