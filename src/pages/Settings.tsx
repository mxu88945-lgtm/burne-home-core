import { Link } from 'react-router-dom'
import BackBar from '@/components/layout/BackBar'

const ITEMS = [
  { to: '/theme', icon: '🎨', title: '主题', sub: '外观配色' },
  { to: '/settings/appearance', icon: '🖼', title: '形象 · 外观', sub: '头像 · 聊天背景' },
  { to: '/persona', icon: '🎭', title: '角色人设', sub: '灵魂设定与参数' },
  { to: '/settings/sync', icon: '☁️', title: '账号 · 多设备同步', sub: 'Supabase 登录共享' },
  { to: '/settings/api', icon: '🤖', title: 'API · 模型', sub: '渠道与模型管理' },
  { to: '/settings/tts', icon: '🔊', title: '语音朗读', sub: 'MiniMax 海螺 TTS' },
  { to: '/settings/usage', icon: '📊', title: '用量 · 账单', sub: 'token 与花费' },
  { to: '/settings/data', icon: '💾', title: '数据 · 备份', sub: '导出 / 恢复 / 更新' },
  { to: '/settings/privacy', icon: '🔒', title: '隐私锁', sub: '本地保护' },
]

function Row({
  to,
  icon,
  title,
  sub,
}: {
  to: string
  icon: string
  title: string
  sub: string
}) {
  return (
    <Link
      to={to}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-4 transition active:scale-[0.99]"
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span className="text-accent">›</span>
    </Link>
  )
}

export default function Settings() {
  return (
    <div className="space-y-2.5">
      <BackBar />
      <div className="px-1 pb-1">
        <h2 className="headline text-2xl text-ink">设置 ⚙️</h2>
        <p className="mt-1 text-sm text-muted">个性 · 同步 · 备份 · 隐私</p>
      </div>
      {ITEMS.map((i) => (
        <Row key={i.to} {...i} />
      ))}
      <p className="pt-2 text-center text-[11px] text-muted">
        详细计划见仓库 docs/ROADMAP.md ♡
      </p>
    </div>
  )
}
