/**
 * 本地时间 + 天气 + 位置感知（照顾祁砚 scripts/weather-time.js 移植）。
 * - 天气：Open-Meteo（免 key）；地名：BigDataCloud 反查（免 key，8 秒上限，失败不影响天气）。
 * - 缓存只存温度/天气码/地名和约 1km 的粗坐标，从不把坐标发给模型。
 */

export interface WeatherCache {
  temp: number
  code: number
  high: number
  low: number
  at: number
  spot?: string
  place?: string
  street?: string
  tomorrow?: { high: number; low: number; code: number }
}

export const WX_CACHE_KEY = 'burne-home-core:weather'
export const WX_TTL = 30 * 60 * 1000
const WX_MAX_AGE = 3 * 60 * 60 * 1000

const PLACE_SIMPLIFY: Record<string, string> = { 區: "区", 縣: "县", 橋: "桥", 灣: "湾", 門: "门", 東: "东", 廣: "广", 陽: "阳", 雲: "云", 嶺: "岭", 龍: "龙", 華: "华", 興: "兴", 爾: "尔", 寧: "宁", 豐: "丰", 鄉: "乡", 鎮: "镇", 臺: "台", 漢: "汉", 濱: "滨", 莊: "庄", 頭: "头", 島: "岛", 圍: "围", 寶: "宝", 鳳: "凤", 長: "长", 開: "开", 關: "关", 嶼: "屿", 營: "营", 隴: "陇", 黃: "黄", 遼: "辽", 蘇: "苏", 貴: "贵", 雙: "双", 灘: "滩", 澤: "泽", 慶: "庆", 鄭: "郑", 樂: "乐", 歸: "归", 蘭: "兰", 綏: "绥", 齊: "齐", 錦: "锦", 撫: "抚", 鶴: "鹤", 嶽: "岳", 濟: "济", 魯: "鲁", 張: "张", 灤: "滦", 潯: "浔", 陳: "陈", 衛: "卫", 劉: "刘", 鄧: "邓", 曉: "晓", 學: "学", 場: "场", 園: "园", 號: "号", 業: "业", 達: "达", 廠: "厂", 嶗: "崂", 滬: "沪", 閩: "闽", 贛: "赣", 瀋: "沈", 濰: "潍", 檯: "台" };

export function simplifyPlace(text: string | undefined | null): string {
  return String(text || '').replace(/[\u3400-\u9fff]/g, (ch) => PLACE_SIMPLIFY[ch] || ch)
}

function joinPlace(parts: string[]): string {
  const out: string[] = []
  for (const part of parts) {
    const v = simplifyPlace(part).trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out.join('')
}

export function wxLabel(code: number): [string, string] {
  if (code === 0) return ['晴', '☀️']
  if (code <= 2) return ['多云', '⛅️']
  if (code === 3) return ['阴', '☁️']
  if (code === 45 || code === 48) return ['雾', '🌫️']
  if (code >= 51 && code <= 57) return ['毛毛雨', '🌦️']
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return [code >= 65 || code === 82 ? '大雨' : '雨', '🌧️']
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['雪', '❄️']
  if (code >= 95) return ['雷雨', '⛈️']
  return ['未知', '🌡️']
}

export function readWeatherCache(): WeatherCache | null {
  try {
    const v = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null') as WeatherCache | null
    return v && typeof v.temp === 'number' ? v : null
  } catch {
    return null
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<{ place: string; street: string } | null> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), 8000)
  try {
    const url =
      'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat.toFixed(4) +
      '&longitude=' + lng.toFixed(4) + '&localityLanguage=zh'
    const resp = await fetch(url, controller ? { signal: controller.signal } : undefined)
    if (!resp.ok) return null
    const data = (await resp.json()) as {
      principalSubdivision?: string
      city?: string
      locality?: string
      localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] }
    }
    const admin = (data.localityInfo?.administrative ?? []).filter((a) => a && a.name)
    const level = (n: number) => {
      const a = admin.filter((x) => Number(x.adminLevel) === n).pop()
      return a ? simplifyPlace(a.name).trim() : ''
    }
    const province = simplifyPlace(data.principalSubdivision).trim()
    const city = simplifyPlace(data.city).trim() || level(5)
    const locality = simplifyPlace(data.locality).trim()
    const district = level(6) || locality
    const deeper = admin.filter((x) => Number(x.adminLevel) >= 7).pop()
    let street = deeper ? simplifyPlace(deeper.name).trim() : ''
    if (!street && locality && locality !== district && locality !== city) street = locality
    if (street === district || street === city) street = ''
    const place = joinPlace([province, city, district])
    if (!place && !street) return null
    return { place, street }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWeather(): Promise<WeatherCache> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no-geo'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: WX_TTL })
  })
  const { latitude, longitude } = pos.coords
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' + latitude.toFixed(3) +
    '&longitude=' + longitude.toFixed(3) +
    '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=2'
  const placeP = reverseGeocode(latitude, longitude).catch(() => null)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error('wx ' + resp.status)
  const data = await resp.json()
  const geo = await placeP
  const next: WeatherCache = {
    temp: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    at: Date.now(),
    spot: latitude.toFixed(2) + ',' + longitude.toFixed(2),
  }
  if (geo) {
    if (geo.place) next.place = geo.place
    if (geo.street) next.street = geo.street
  } else {
    const prev = readWeatherCache()
    if (prev?.place && prev.spot === next.spot) {
      next.place = prev.place
      if (prev.street) next.street = prev.street
    }
  }
  if (data.daily.temperature_2m_max.length > 1) {
    next.tomorrow = {
      high: Math.round(data.daily.temperature_2m_max[1]),
      low: Math.round(data.daily.temperature_2m_min[1]),
      code: data.daily.weather_code ? data.daily.weather_code[1] : 0,
    }
  }
  try {
    localStorage.setItem(WX_CACHE_KEY, JSON.stringify(next))
  } catch {
    // 存不下就只用这一次
  }
  return next
}

function tomorrowNote(w: WeatherCache): string {
  if (!w.tomorrow) return ''
  const t = w.tomorrow
  let note = '明天天气：' + wxLabel(t.code)[0] + '，' + t.low + '～' + t.high + '°C。'
  const tips: string[] = []
  if (t.code >= 51 && t.code <= 82) tips.push('明天下雨，记得提醒她带伞')
  if (t.code >= 95) tips.push('明天有雷雨，提醒她注意安全')
  if ((t.code >= 71 && t.code <= 77) || t.code === 85 || t.code === 86) tips.push('明天下雪，提醒她注意保暖')
  if (t.high < w.high - 4) tips.push('明天降温' + (w.high - t.high) + '°C，提醒她加衣服')
  note += tips.length ? tips.join('；') + '。' : '天气不错，不用特别提醒。'
  return note
}

/** 距离上次说话多久（只看带 ts 的消息；刚发的这条不算） */
export function elapsedNote(messages: { role: string; ts?: number }[], nowMs = Date.now()): string {
  let end = messages.length
  const last = messages[end - 1]
  if (last && last.role === 'me' && typeof last.ts === 'number' && nowMs - last.ts < 5 * 60 * 1000) end -= 1
  let lastTs = 0
  for (let i = end - 1; i >= 0; i--) {
    const ts = messages[i]?.ts
    if (typeof ts === 'number' && ts > 0) {
      lastTs = ts
      break
    }
  }
  if (!lastTs) return ''
  const mins = Math.floor((nowMs - lastTs) / 60000)
  if (mins < 60) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return '距离你们上次说话已经过去了' + h + '小时' + (m ? m + '分钟' : '') + '。可以按你的人设自然反应（比如问她刚才去哪了），不用每条都提。'
}

/** 注入 system 的「天气与位置」段；关掉位置感知或缓存超过 3 小时就不注入 */
export function buildWeatherNote(aware: boolean, nowMs = Date.now()): string {
  if (!aware) return ''
  const w = readWeatherCache()
  if (!w || nowMs - w.at > WX_MAX_AGE) return ''
  const parts: string[] = []
  const place = simplifyPlace(w.place)
  if (place) parts.push('她现在在：' + place + '。')
  parts.push('她那边天气：' + wxLabel(w.code)[0] + '，' + w.temp + '°C，今天 ' + w.low + '～' + w.high + '°C。聊天时可以自然地顺着天气（很晚了催睡、下雨提醒带伞），不用每条都提。')
  const tn = tomorrowNote(w)
  if (tn) parts.push(tn)
  parts.push('以上是她那边的真实情况，你心里知道就好：自然地用来关心和闲聊，不要复述精确地址，不要提“定位”“系统”“提示”这类字眼，也不要编造别的地点或天气。')
  return '\n\n【天气与位置】\n' + parts.join('\n')
}
