import { Link } from 'react-router-dom'

export default function AppHeader() {
  return (
    <header className="flex flex-none items-start justify-between px-6 pb-2 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <Link to="/">
        <h1 className="headline text-2xl leading-none text-ink">
          BW <span className="text-accent">♡</span>
        </h1>
        <p className="mt-1 text-[11px] tracking-wide text-muted">我们的长期记忆</p>
      </Link>
      <Link
        to="/settings"
        aria-label="设置"
        className="glass flex h-9 w-9 items-center justify-center rounded-full text-base"
      >
        ⚙️
      </Link>
    </header>
  )
}
