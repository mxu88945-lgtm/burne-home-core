import { useEffect, useState } from 'react'
import { fetchWeather, readWeatherCache, wxLabel, WX_TTL, type WeatherCache } from '@/lib/weather'
import { useChatPrefsStore } from '@/store/chatPrefsStore'

const pad = (n: number) => String(n).padStart(2, '0')
const WK = ['日', '一', '二', '三', '四', '五', '六']

/** 首页顶部：本地时间 + 天气（点天气刷新）。照顾祁砚首页小卡移植。 */
export default function WeatherClock() {
  const [now, setNow] = useState(() => new Date())
  const [wx, setWx] = useState<WeatherCache | null>(() => readWeatherCache())
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState('')
  const aware = useChatPrefsStore((s) => s.locationAware)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const refresh = async (force: boolean) => {
    if (busy) return
    const cached = readWeatherCache()
    if (!force) {
      // 从没连过、缓存还新鲜、或关了位置感知：都不在后台定位
      if (!cached || Date.now() - cached.at < WX_TTL || !aware) return
    }
    setBusy(true)
    setTip('')
    try {
      setWx(await fetchWeather())
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code
      if (code === 1) setTip('定位被拒绝了：iPhone 设置 → 隐私与安全性 → 定位服务 → Safari 网站 打开')
      else if ((e as Error)?.message === 'no-geo') setTip('这个浏览器不支持定位')
      else setTip('天气获取失败，点一下重试')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh(false)
    const t = setInterval(() => void refresh(false), WX_TTL)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aware])

  const label = wx ? wxLabel(wx.code) : null
  return (
    <section className="glass-strong rounded-3xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-left">
          <div className="text-[30px] font-semibold leading-none tabular-nums text-ink">
            {pad(now.getHours())}:{pad(now.getMinutes())}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {now.getMonth() + 1}月{now.getDate()}日 星期{WK[now.getDay()]}
            {wx?.place ? ` · ${wx.place.replace(/^.*?(省|自治区)/, '')}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          aria-label="天气，点击刷新"
          className="flex items-center gap-2 rounded-2xl px-3 py-2 transition active:scale-[0.97]"
          style={{ background: 'var(--card-strong)' }}
        >
          <span className="text-[28px] leading-none">{busy ? '⏳' : label ? label[1] : '📍'}</span>
          <span className="text-left">
            {wx && <span className="block text-[18px] font-semibold leading-tight tabular-nums text-ink">{wx.temp}°</span>}
            <span className="block text-[11px] text-muted">
              {busy ? '获取中' : wx && label ? `${label[0]} ${wx.low}°/${wx.high}°` : '连接天气'}
            </span>
          </span>
        </button>
      </div>
      {tip && <p className="mt-2 text-[11px] text-muted">{tip}</p>}
    </section>
  )
}
