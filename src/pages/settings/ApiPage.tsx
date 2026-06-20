import SubPage from '@/components/settings/SubPage'
import ApiManager from '@/components/settings/ApiManager'

export default function ApiPage() {
  return (
    <SubPage title="API · 模型 🤖">
      <div className="glass rounded-2xl p-4">
        <ApiManager />
      </div>
    </SubPage>
  )
}
