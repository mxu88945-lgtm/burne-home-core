import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import BackBar from '@/components/layout/BackBar'
import {
  PaletteIcon,
  ImageIcon,
  PersonIcon,
  CloudIcon,
  ChipIcon,
  SpeakerWaveIcon,
  ImageSparkIcon,
  EyeIcon,
  ChartIcon,
  ArchiveIcon,
  LockIcon,
  BookIcon,
  DatabaseIcon,
} from '@/components/ui/navIcons'

type IconType = ComponentType<{ className?: string }>
type Item = { to: string; Icon: IconType; title: string; sub: string }

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: '个性化',
    items: [
      { to: '/settings/appearance', Icon: ImageIcon, title: '形象 · 外观', sub: '头像 · 聊天背景' },
      { to: '/theme', Icon: PaletteIcon, title: '主题', sub: '外观配色' },
      { to: '/persona', Icon: PersonIcon, title: '角色人设', sub: '灵魂设定与参数' },
    ],
  },
  {
    label: '模型 · 服务',
    items: [
      { to: '/settings/api', Icon: ChipIcon, title: 'API · 模型', sub: '渠道与模型管理' },
      { to: '/settings/memory-model', Icon: DatabaseIcon, title: '记忆模型', sub: '单独模型记记忆 · 不占主模型' },
      { to: '/settings/vision', Icon: EyeIcon, title: '读图模型', sub: '主模型不支持图时用' },
      { to: '/settings/imagegen', Icon: ImageSparkIcon, title: '生成图片', sub: '文生图渠道' },
      { to: '/settings/tts', Icon: SpeakerWaveIcon, title: '语音朗读', sub: 'MiniMax 海螺 TTS · 声音克隆' },
      { to: '/settings/stt', Icon: SpeakerWaveIcon, title: '语音输入', sub: '说话转文字' },
    ],
  },
  {
    label: '内容 · 数据',
    items: [
      { to: '/settings/reading', Icon: BookIcon, title: '读书', sub: '独立模型 · 剧情摘要 · 跟读' },
      { to: '/settings/usage', Icon: ChartIcon, title: '用量 · 账单', sub: 'token 与花费' },
      { to: '/settings/sync', Icon: CloudIcon, title: '账号 · 多设备同步', sub: 'Supabase 登录共享' },
      { to: '/settings/data', Icon: ArchiveIcon, title: '数据 · 备份', sub: '导出 / 恢复 / 更新' },
      { to: '/settings/privacy', Icon: LockIcon, title: '隐私锁', sub: '本地保护' },
    ],
  },
]

function Row({ to, Icon, title, sub }: { to: string; Icon: IconType; title: string; sub: string }) {
  return (
    <Link
      to={to}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-4 transition active:scale-[0.99]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/40 text-accent">
        <Icon className="h-5 w-5" />
      </span>
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
      {GROUPS.map((g) => (
        <div key={g.label} className="space-y-2.5 pt-1.5">
          <div className="label px-1">{g.label}</div>
          {g.items.map(({ to, Icon, title, sub }) => (
            <Row key={to} to={to} Icon={Icon} title={title} sub={sub} />
          ))}
        </div>
      ))}
      <p className="pt-3 text-center text-[11px] text-muted">
        详细计划见仓库 docs/ROADMAP.md ♡
      </p>
    </div>
  )
}
