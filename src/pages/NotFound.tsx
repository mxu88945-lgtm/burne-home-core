import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="text-5xl">🌙</div>
      <h1 className="mt-4 text-xl font-semibold text-home-text">
        这里没有记忆
      </h1>
      <p className="mt-2 text-sm text-home-muted">页面走丢了。</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-xl bg-home-card px-5 py-2 text-sm text-home-text hover:bg-home-border"
      >
        回主屋
      </Link>
    </div>
  )
}
