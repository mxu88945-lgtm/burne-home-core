import { Link } from 'react-router-dom'
import BackBar from '@/components/layout/BackBar'

const ITEMS: { to: string; title: string; sub: string }[] = [
  { to: '/theme', title: '主题', sub: '外观配色' },
  { to: '/settings/appearance', title: '形象 · 外观', sub: '头像 · 聊天背景' },
  { to: '/persona', title: '角色人设', sub: '灵魂设定与参数' },
  { to: '/settings/reading', title: '读书', sub: '独立模型 · 剧情摘要 · 跟读' },
  { to: '/settings/sync', title: '账号 · 多设备同步', sub: 'Supabase 登录共享' },
  { to: '/settings/api', title: 'API · 模型', sub: '渠道与模型管理' },
  { to: '/settings/tts', title: '语音朗读', sub: 'MiniMax 海螺 TTS · 声音克隆' },
  { to: '/settings/stt', title: '语音输入', sub: '说话转文字' },
  { to: '/settings/imagegen', title: '生成图片', sub: '文生图渠道' },
  { to: '/settings/vision', title: '读图模型', sub: '主模型不支持图时用' },
  { to: '/settings/memory-model', title: '记忆模型', sub: '单独模型记记忆 · 不占主模型' },
  { to: '/settings/usage', title: '用量 · 账单', sub: 'token 与花费' },
  { to: '/settings/data', title: '数据 · 备份', sub: '导出 / 恢复 / 更新' },
  { to: '/settings/privacy', title: '隐私锁', sub: '本地保护' },
]

function Row({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Link
      to={to}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-4 transition active:scale-[0.99]"
    >
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span className="text-muted">›</span>
    </Link>
  )
}

export default function Settings() {
  return (
    <div className="space-y-2.5">
      <BackBar />
      <div className="px-1 pb-1">
        <h2 className="headline text-2xl text-ink">设置</h2>
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
