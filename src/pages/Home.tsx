import { Link } from 'react-router-dom'
import { useProfileStore, daysTogether } from '@/store/profileStore'

function Avatar({ emoji }: { emoji: string }) {
  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-full text-3xl"
      style={{
        background: 'var(--card-strong)',
        border: '2px solid var(--card-border)',
        boxShadow: '0 8px 22px var(--shadow)',
      }}
    >
      {emoji}
    </div>
  )
}

function QuickEntry({
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
      className="glass flex flex-col gap-1 rounded-2xl px-4 py-4 transition active:scale-[0.98]"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-ink">{title}</span>
      <span className="text-[11px] text-muted">{sub}</span>
    </Link>
  )
}

export default function Home() {
  const { profile, setProfile } = useProfileStore()
  const days = daysTogether(profile.anniversary)

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
    <div className="space-y-5">
      {/* 情侣主视觉 */}
      <section className="glass-strong rounded-3xl px-6 py-7 text-center">
        <div className="flex items-center justify-center gap-5">
          <Avatar emoji={profile.avatarA} />
          <span className="headline text-2xl text-accent-2">&</span>
          <Avatar emoji={profile.avatarB} />
        </div>
        <h2 className="headline mt-5 text-2xl text-ink">
          {profile.nameA} <span className="text-accent">♡</span> {profile.nameB}
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-relaxed text-muted">
          “{profile.signature}”
        </p>
      </section>

      {/* 在一起的天数 */}
      <section className="glass rounded-3xl px-6 py-6 text-center">
        <div className="text-5xl font-semibold text-accent">{days}</div>
        <div className="label mt-1">一起的 {days} 天</div>
        <div className="mt-1 text-[11px] text-muted">
          Since {profile.anniversary}
        </div>
      </section>

      {/* 快捷入口 */}
      <section className="grid grid-cols-2 gap-3">
        <QuickEntry
          to="/memories"
          icon="📔"
          title="我们的记忆"
          sub="摘要 · 核心 · 全部"
        />
        <QuickEntry
          to="/chat"
          icon="💬"
          title="今天聊聊"
          sub="说点什么吧"
        />
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
