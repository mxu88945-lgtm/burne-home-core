import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="text-5xl">🌙</div>
      <h2 className="headline mt-4 text-xl text-ink">这里没有记忆</h2>
      <p className="mt-2 text-sm text-muted">页面走丢了。</p>
      <Link
        to="/"
        className="btn-primary mt-6 inline-block rounded-2xl px-6 py-2.5 text-sm"
      >
        回主屋
      </Link>
    </div>
  )
}
