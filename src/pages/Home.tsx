import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import { useProfileStore, daysTogether } from '@/store/profileStore'
import { useChatStore } from '@/store/chatStore'
import { useDramaStore } from '@/store/dramaStore'
import { usePeriodStore } from '@/store/periodStore'
import { computeStat } from '@/lib/period'
import { EditIcon } from '@/components/ui/icons'
import { PhoneIcon, ChatIcon, DatabaseIcon, BookIcon, UsersIcon, GearIcon, HeartIcon } from '@/components/ui/navIcons'
import Avatar from '@/components/ui/Avatar'

const avatarStyle = {
  backgroundColor: 'var(--card-strong)',
  border: '2px solid var(--card-border)',
  boxShadow: '0 8px 22px var(--shadow)',
}

function QuickEntry({
  to,
  Icon,
  title,
  sub,
  tint,
  onClick,
}: {
  to: string
  Icon: ComponentType<{ className?: string }>
  title: string
  sub: string
  /** 专属主色（hex），做图标牌的柔和渐变 */
  tint: string
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="glass flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center transition active:scale-[0.98]"
    >
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{
          background: `linear-gradient(135deg, ${tint}33, ${tint}14)`,
          boxShadow: `0 6px 16px ${tint}26`,
          border: `1px solid ${tint}33`,
          color: tint,
        }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-medium text-ink">{title}</span>
      <span className="text-[11px] text-muted">{sub}</span>
    </Link>
  )
}

export default function Home() {
  const { profile, setProfile } = useProfileStore()
  const startBlank = useChatStore((s) => s.startBlank)
  const hasDrama = useDramaStore((s) => s.scenes.length > 0)
  const periodDays = usePeriodStore((s) => s.days)
  const periodLen = usePeriodStore((s) => s.periodLen)
  const pstat = computeStat(periodDays, periodLen)
  const days = daysTogether(profile.anniversary)

  const pMain = !pstat.hasData
    ? '记录'
    : pstat.todayDay
      ? `第 ${pstat.todayDay} 天`
      : pstat.daysUntilNext != null
        ? `${pstat.daysUntilNext} 天`
        : '—'
  const pSub = !pstat.hasData
    ? '生理期日历'
    : pstat.todayDay
      ? '经期中 · 记得喝热水'
      : '距下次生理期'

  function editProfile() {
    const nameA = window.prompt('你的名字', profile.nameA)
    if (nameA === null) return
    const nameB = window.prompt('TA 的名字', profile.nameB)
    if (nameB === null) return
    const anniversary = window.prompt(
      '纪念日（格式 yyyy-mm-dd）',
      profile.anniversary
    )
    if (anniversary === null) return
    const signature = window.prompt('心情签名', profile.signature)
    if (signature === null) return
    setProfile({
      nameA: nameA.trim() || profile.nameA,
      nameB: nameB.trim() || profile.nameB,
      anniversary: anniversary.trim() || profile.anniversary,
      signature: signature.trim() || profile.signature,
    })
  }

  return (
    <div className="home-glassy space-y-3">
      {/* 情侣主视觉 */}
      <section className="glass-strong relative overflow-hidden rounded-3xl px-6 py-6 text-center">
        {/* 头像后一层柔光晕，暖一点、不再白惨惨 */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-40 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 68%)', opacity: 0.16 }}
        />
        <div className="relative flex items-center justify-center gap-5">
          <Avatar
            img={profile.avatarAImg}
            emoji={profile.avatarA}
            className="h-20 w-20 rounded-full text-3xl"
            textCls="text-3xl"
            style={avatarStyle}
          />
          <span className="headline text-2xl text-accent-2">&</span>
          <Avatar
            img={profile.avatarBImg}
            emoji={profile.avatarB}
            className="h-20 w-20 rounded-full text-3xl"
            textCls="text-3xl"
            style={avatarStyle}
          />
        </div>
        <h2 className="headline mt-5 text-2xl text-ink">
          {profile.nameA} <span className="text-accent">♡</span> {profile.nameB}
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-relaxed text-muted">
          “{profile.signature}”
        </p>
      </section>

      {/* 在一起的天数（点击改纪念日） */}
      <button
        type="button"
        onClick={() => {
          const v = window.prompt('你们在一起的纪念日（如 2025-05-01）', profile.anniversary)
          if (v == null) return
          const norm = v.trim().replace(/[./]/g, '-')
          if (norm) setProfile({ anniversary: norm })
        }}
        className="glass relative w-full overflow-hidden rounded-3xl px-6 py-6 text-center transition active:scale-[0.99]"
      >
        <div
          className="mx-auto text-6xl font-bold leading-none"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {days}
        </div>
        <div className="label mt-2">
          <span className="text-accent">♡</span> 一起的 {days} 天
        </div>
        <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted">
          Since {profile.anniversary}
          <EditIcon className="h-3 w-3" />
        </div>
      </button>

      {/* 生理期日历卡（两块居中靠拢，不疏远） */}
      <Link
        to="/calendar"
        className="glass flex items-center justify-center gap-4 rounded-3xl px-6 py-5 transition active:scale-[0.99]"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, #f7a8c433, #f7a8c414)',
            border: '1px solid #f7a8c433',
            color: '#ef7a9b',
          }}
        >
          <HeartIcon className="h-5 w-5" />
        </span>
        <div className="text-right">
          <div className="label">生理期</div>
          <div className="mt-1 text-[11px] text-muted">{pSub}</div>
        </div>
        <div className="text-2xl font-semibold" style={{ color: '#ef7a9b' }}>{pMain}</div>
      </Link>

      {/* 小手机 + 今天聊聊（并排两块） */}
      <section className="grid grid-cols-2 gap-3">
        <QuickEntry to="/phone" Icon={PhoneIcon} title="小手机" sub="像发消息一样聊 · 短句" tint="#6aa9f0" />
        <QuickEntry to="/chat" Icon={ChatIcon} title="今天聊聊" sub="说点什么吧" tint="#f48fb1" onClick={startBlank} />
      </section>

      {/* 快捷入口（四个平铺） */}
      <section className="grid grid-cols-2 gap-3">
        <QuickEntry to="/memories" Icon={DatabaseIcon} title="我们的记忆" sub="摘要 · 核心 · 全部" tint="#b191e0" />
        <QuickEntry to="/reading" Icon={BookIcon} title="一起看书" sub="和 TA 共读一本书" tint="#e6a760" />
        {/* 有剧场→直接进聊天房间（☰ 抽屉里切对话）；还没有→落地管理页新建 */}
        <QuickEntry to={hasDrama ? '/drama/room' : '/drama'} Icon={UsersIcon} title="戏剧" sub="多角色群聊 · 扮演" tint="#ef7a9b" />
        <QuickEntry to="/settings" Icon={GearIcon} title="设置" sub="同步 · 备份 · 隐私" tint="#5cb6a6" />
      </section>

      <button
        type="button"
        onClick={editProfile}
        className="mx-auto block text-[12px] text-muted underline-offset-4 hover:underline"
      >
        ✎ 编辑主页信息
      </button>
    </div>
  )
}
