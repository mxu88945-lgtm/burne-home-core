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
      className="glass flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center transition active:scale-[0.98]"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${tint}33, ${tint}14)`,
          boxShadow: `0 6px 16px ${tint}26`,
          border: `1px solid ${tint}33`,
          color: tint,
        }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[13px] font-medium leading-tight text-ink">{title}</span>
      <span className="line-clamp-1 text-[10px] leading-tight text-muted">{sub}</span>
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
    <div className="home-glassy space-y-2.5">
      {/* 情侣主视觉 */}
      <section className="glass-strong relative overflow-hidden rounded-3xl px-4 py-4 text-center">
        {/* 头像后一层柔光晕，暖一点、不再白惨惨 */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-40 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 68%)', opacity: 0.16 }}
        />
        <div className="relative flex items-center justify-center gap-4">
          <Avatar
            img={profile.avatarAImg}
            emoji={profile.avatarA}
            className="h-14 w-14 rounded-full text-2xl"
            textCls="text-2xl"
            style={avatarStyle}
          />
          <span className="headline text-xl text-accent-2">&</span>
          <Avatar
            img={profile.avatarBImg}
            emoji={profile.avatarB}
            className="h-14 w-14 rounded-full text-2xl"
            textCls="text-2xl"
            style={avatarStyle}
          />
        </div>
        <h2 className="headline mt-3 text-xl leading-tight text-ink">
          {profile.nameA} <span className="text-accent">♡</span> {profile.nameB}
        </h2>
        <p className="mx-auto mt-1.5 line-clamp-1 max-w-[20rem] text-[11px] leading-relaxed text-muted">
          “{profile.signature}”
        </p>
      </section>

      {/* 纪念日 + 生理期：两条独立横幅，保留主页的重要感。 */}
      <section className="space-y-2.5">
        <button
          type="button"
          onClick={() => {
            const v = window.prompt('你们在一起的纪念日（如 2025-05-01）', profile.anniversary)
            if (v == null) return
            const norm = v.trim().replace(/[./]/g, '-')
            if (norm) setProfile({ anniversary: norm })
          }}
          className="glass relative flex min-h-[82px] w-full items-center justify-center gap-5 overflow-hidden rounded-2xl px-5 py-3 text-center transition active:scale-[0.99]"
        >
          <div
            className="text-4xl font-bold leading-none"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {days}
          </div>
          <div className="text-left">
            <div className="label text-[11px]"><span className="text-accent">♡</span> 一起的 {days} 天</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
              Since {profile.anniversary}<EditIcon className="h-3 w-3" />
            </div>
          </div>
        </button>

        <Link
          to="/calendar"
          className="glass flex min-h-[82px] items-center justify-center gap-4 rounded-2xl px-5 py-3 transition active:scale-[0.99]"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{
              background: 'linear-gradient(135deg, #f7a8c433, #f7a8c414)',
              border: '1px solid #f7a8c433',
              color: '#ef7a9b',
            }}
          >
            <HeartIcon className="h-5 w-5" />
          </span>
          <div className="text-right">
            <div className="label text-[11px]">生理期</div>
            <div className="mt-1 whitespace-nowrap text-[10px] text-muted">{pSub}</div>
          </div>
          <div className="whitespace-nowrap text-2xl font-semibold" style={{ color: '#ef7a9b' }}>{pMain}</div>
        </Link>
      </section>

      {/* 小手机 + 今天聊聊（并排两块） */}
      <section className="grid grid-cols-2 gap-2.5">
        <QuickEntry to="/phone" Icon={PhoneIcon} title="小手机" sub="像发消息一样聊 · 短句" tint="#6aa9f0" />
        <QuickEntry to="/chat" Icon={ChatIcon} title="今天聊聊" sub="说点什么吧" tint="#f48fb1" onClick={startBlank} />
      </section>

      {/* 快捷入口（四个平铺） */}
      <section className="grid grid-cols-2 gap-2.5">
        <QuickEntry to="/memories" Icon={DatabaseIcon} title="我们的记忆" sub="摘要 · 核心 · 全部" tint="#b191e0" />
        <QuickEntry to="/reading" Icon={BookIcon} title="一起看书" sub="和 TA 共读一本书" tint="#e6a760" />
        {/* 有剧场→直接进聊天房间（☰ 抽屉里切对话）；还没有→落地管理页新建 */}
        <QuickEntry to={hasDrama ? '/drama/room' : '/drama'} Icon={UsersIcon} title="戏剧" sub="多角色群聊 · 扮演" tint="#ef7a9b" />
        <QuickEntry to="/settings" Icon={GearIcon} title="设置" sub="同步 · 备份 · 隐私" tint="#5cb6a6" />
      </section>

      <button
        type="button"
        onClick={editProfile}
        className="mx-auto block text-[10px] leading-none text-muted underline-offset-4 hover:underline"
      >
        ✎ 编辑主页信息
      </button>
    </div>
  )
}
