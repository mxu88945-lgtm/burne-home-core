import ThemeSwitcher from './ThemeSwitcher'

export default function AppHeader() {
  return (
    <header className="flex items-center justify-between px-6 pb-2 pt-7">
      <div>
        <h1 className="headline text-2xl leading-none text-ink">
          主屋 <span className="text-accent">♡</span>
        </h1>
        <p className="mt-1 text-[11px] tracking-wide text-muted">
          我们的长期记忆
        </p>
      </div>
      <ThemeSwitcher />
    </header>
  )
}
