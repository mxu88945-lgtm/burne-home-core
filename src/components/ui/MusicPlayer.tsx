/**
 * 音乐播放器：首页的桌面小卡（歌名 / 当前歌词 / 进度 / 上一首·播放·下一首 / 歌单）。
 * 组件一直挂在 AppLayout 里（换页不断播），界面用 portal 画进首页的挂载点；离开首页只是看不到卡片，歌继续放。
 * 音频和歌词都是她自己上传：本体存 IndexedDB（`music:{id}` / `lyric:{id}`，只在本机），元数据在 musicStore。
 * 正在放的歌和当前歌词同步到 musicStore.now / lyrics，聊天时注入「一起听歌」。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseLyrics, lyricIndexAt, isTimed, fetchOnlineLyrics, type LyricLine } from '@/lib/lyrics'
import { useMusicStore, musicTrackId, type MusicTrack } from '@/store/musicStore'
import { idbGet, idbSet, idbDel } from '@/lib/idb'
import { PlayIcon, PauseIcon, SkipPrevIcon, SkipNextIcon, TrashIcon } from '@/components/ui/icons'

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function MusicPlayer() {
  const enabled = useMusicStore((s) => s.enabled)
  const tracks = useMusicStore((s) => s.tracks)
  const activeId = useMusicStore((s) => s.activeId)
  const addTracks = useMusicStore((s) => s.addTracks)
  const removeTrack = useMusicStore((s) => s.removeTrack)
  const setActive = useMusicStore((s) => s.setActive)
  const setHasLyrics = useMusicStore((s) => s.setHasLyrics)
  const slot = useMusicStore((s) => s.slot)
  const setNow = useMusicStore((s) => s.setNow)
  const setLyrics = useMusicStore((s) => s.setLyrics)
  const lyrics = useMusicStore((s) => s.lyrics)
  const lyricFileRef = useRef<HTMLInputElement>(null)
  const lyricForRef = useRef('')

  const [playing, setPlaying] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [err, setErr] = useState('')
  // 离开首页时的小浮窗：收起只剩唱片，记住她的选择
  const [mini, setMini] = useState(() => localStorage.getItem('bw-music-float') === 'mini')
  const toggleMini = () => {
    setMini((m) => {
      const next = !m
      try { localStorage.setItem('bw-music-float', next ? 'mini' : 'full') } catch { /* ignore */ }
      return next
    })
  }
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef('')
  const loadedIdRef = useRef('') // 当前 audio.src 对应的曲目 id
  const fileRef = useRef<HTMLInputElement>(null)
  // ended 回调里要拿最新歌单，不吃闭包旧值
  const stateRef = useRef({ tracks, activeId })
  stateRef.current = { tracks, activeId }

  const active = tracks.find((t) => t.id === activeId) ?? tracks[0]

  /** 单例 audio（挂载一次，路由切换不断播） */
  function ensureAudio(): HTMLAudioElement {
    let a = audioRef.current
    if (!a) {
      a = new Audio()
      let lastPub = 0
      const publish = () => {
        const { tracks: ts, activeId: cur } = stateRef.current
        const t = ts.find((x) => x.id === loadedIdRef.current) ?? ts.find((x) => x.id === cur)
        setNow(t ? { name: t.name, playing: !a!.paused, pos: a!.currentTime, dur: isFinite(a!.duration) ? a!.duration : 0 } : null)
      }
      a.addEventListener('timeupdate', () => {
        setPos(a!.currentTime)
        if (isFinite(a!.duration)) setDur(a!.duration)
        const n = Date.now()
        if (n - lastPub > 1000) {
          lastPub = n
          publish()
        }
      })
      a.addEventListener('play', () => {
        setPlaying(true)
        publish()
      })
      a.addEventListener('pause', () => {
        setPlaying(false)
        publish()
      })
      a.addEventListener('ended', () => void step(1, true))
      audioRef.current = a
    }
    return a
  }

  /** 把某曲目的 blob 装进 audio（已装过就跳过） */
  async function loadTrack(id: string): Promise<HTMLAudioElement | null> {
    const a = ensureAudio()
    if (loadedIdRef.current === id && a.src) return a
    const blob = await idbGet<Blob>(`music:${id}`)
    if (!blob) {
      setErr('这首歌的文件不见了（可能被清过缓存），删掉重新上传下～')
      return null
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(blob)
    a.src = urlRef.current
    loadedIdRef.current = id
    void loadLyrics(id)
    setPos(0)
    setDur(0)
    return a
  }

  async function loadLyrics(id: string) {
    const raw = await idbGet<string>(`lyric:${id}`).catch(() => null)
    setLyrics(raw ? parseLyrics(raw) : [])
    setLyricHint('')
    if (!raw) void autoLyrics(id)
  }

  /** 没歌词文件时上网找一次（lrclib）；同一首本次打开只找一次 */
  const triedRef = useRef(new Set<string>())
  const [lyricHint, setLyricHint] = useState('')
  async function autoLyrics(id: string) {
    if (triedRef.current.has(id)) return
    triedRef.current.add(id)
    const t = stateRef.current.tracks.find((x) => x.id === id)
    if (!t) return
    setLyricHint('正在找歌词…')
    try {
      const text = await fetchOnlineLyrics(t.name)
      if (!text || !parseLyrics(text).length) {
        if (loadedIdRef.current === id) setLyricHint('没找到歌词，可以点歌单里「+歌词」自己加')
        return
      }
      await idbSet(`lyric:${id}`, text)
      setHasLyrics(id, true)
      if (loadedIdRef.current === id) {
        setLyrics(parseLyrics(text))
        setLyricHint('')
      }
    } catch {
      if (loadedIdRef.current === id) setLyricHint('歌词没找到（网络不通）')
    }
  }

  async function attachLyrics(id: string, file: File) {
    try {
      const text = await file.text()
      if (!parseLyrics(text).length) {
        setErr('这个歌词文件是空的')
        return
      }
      await idbSet(`lyric:${id}`, text)
      setHasLyrics(id, true)
      if (loadedIdRef.current === id || stateRef.current.activeId === id) await loadLyrics(id)
    } catch (e) {
      setErr(`歌词保存失败：${(e as Error).message}`)
    }
  }

  async function playTrack(id: string) {
    setErr('')
    const a = await loadTrack(id)
    if (!a) return
    if (stateRef.current.activeId !== id) setActive(id)
    try {
      await a.play()
    } catch (e) {
      setErr(`播放失败：${(e as Error).message}`)
    }
  }

  async function toggle() {
    if (!active) return
    const a = ensureAudio()
    if (loadedIdRef.current === active.id && a.src) {
      if (a.paused) void a.play().catch((e) => setErr(`播放失败：${(e as Error).message}`))
      else a.pause()
      return
    }
    await playTrack(active.id)
  }

  /** 上一首/下一首（dir=±1）；fromEnded＝播完自动连播 */
  async function step(dir: 1 | -1, fromEnded = false) {
    const { tracks: ts, activeId: cur } = stateRef.current
    if (!ts.length) return
    const i = Math.max(0, ts.findIndex((t) => t.id === cur))
    const next = ts[(i + dir + ts.length) % ts.length]
    if (fromEnded && ts.length === 1) {
      // 只有一首：从头再放
      const a = ensureAudio()
      a.currentTime = 0
      void a.play().catch(() => {})
      return
    }
    await playTrack(next.id)
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setErr('')
    const metas: MusicTrack[] = []
    const base = (n: string) => n.replace(/\.[^.]+$/, '')
    const all = Array.from(files)
    const lrcs = all.filter((f) => /\.(lrc|txt)$/i.test(f.name))
    try {
      for (const f of all) {
        if (/\.(lrc|txt)$/i.test(f.name)) continue
        if (/^(image|video)\//.test(f.type)) continue
        const id = musicTrackId()
        await idbSet(`music:${id}`, f)
        const lrc = lrcs.find((l) => base(l.name) === base(f.name))
        if (lrc) await idbSet(`lyric:${id}`, await lrc.text())
        metas.push({ id, name: base(f.name), hasLyrics: !!lrc })
      }
      if (!metas.length && lrcs.length && active) {
        // 只选了歌词文件：给当前这首配上
        await attachLyrics(active.id, lrcs[0])
        return
      }
      addTracks(metas)
      setListOpen(true)
    } catch (e) {
      setErr(`保存失败：${(e as Error).message}`)
    }
  }

  function del(t: MusicTrack) {
    if (!window.confirm(`删除「${t.name}」？`)) return
    void idbDel(`music:${t.id}`)
    void idbDel(`lyric:${t.id}`)
    if (loadedIdRef.current === t.id) {
      const a = ensureAudio()
      a.pause()
      a.removeAttribute('src')
      loadedIdRef.current = ''
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = ''
      }
      setPos(0)
      setDur(0)
    }
    removeTrack(t.id)
  }

  // 切到别的歌（还没开始放）时也把歌词换上，卡片显示对得上
  useEffect(() => {
    if (active && loadedIdRef.current !== active.id) void loadLyrics(active.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  // 卸载时收拾资源
  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  if (!enabled) return null

  const li = lyricIndexAt(lyrics, pos)
  const timed = isTimed(lyrics)
  const curLine: LyricLine | undefined = timed ? lyrics[li] : undefined
  const nextLine: LyricLine | undefined = timed ? lyrics[li + 1] : undefined

  // 不在首页：有歌在放（或放到一半暂停）就自动出一个小浮窗，能切歌不用回首页
  if (!slot) {
    if (!active || (!playing && pos <= 0)) return null
    return createPortal(
      <div className="music-float" role="group" aria-label="音乐小浮窗">
        <button onClick={toggleMini} aria-label={mini ? '展开' : '收起'} className="shrink-0">
          <span className="music-disc" style={{ animationPlayState: playing ? 'running' : 'paused' }} aria-hidden />
        </button>
        {!mini && (
          <>
            <span className="music-float-text text-ink">{curLine?.text || active.name}</span>
            <button onClick={() => void step(-1)} aria-label="上一首" className="text-muted disabled:opacity-40" disabled={tracks.length < 2}>
              <SkipPrevIcon className="h-[15px] w-[15px]" />
            </button>
            <button onClick={() => void toggle()} aria-label={playing ? '暂停' : '播放'} className="text-ink">
              {playing ? <PauseIcon className="h-[16px] w-[16px]" /> : <PlayIcon className="h-[16px] w-[16px]" />}
            </button>
            <button onClick={() => void step(1)} aria-label="下一首" className="text-muted disabled:opacity-40" disabled={tracks.length < 2}>
              <SkipNextIcon className="h-[15px] w-[15px]" />
            </button>
          </>
        )}
      </div>,
      document.body,
    )
  }

  const disc = (
    <span
      className="music-disc shrink-0"
      style={{ animationPlayState: playing ? 'running' : 'paused' }}
      aria-hidden
    />
  )

  return createPortal(
    <section className="glass rounded-2xl px-4 py-3">
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
      <input
        ref={lyricFileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && lyricForRef.current) void attachLyrics(lyricForRef.current, f)
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-3">
        {disc}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-ink">{active ? active.name : '还没有音乐'}</div>
          <div className="truncate text-[11px] text-muted">
            {!active
              ? '上传喜欢的歌，TA 也能陪你一起听'
              : curLine
                ? curLine.text
                : timed
                  ? nextLine?.text ?? '♪'
                  : lyrics.length
                    ? '有歌词（纯文本）'
                    : `${fmt(pos)} / ${fmt(dur)}${lyricHint ? ' · ' + lyricHint : ''}`}
          </div>
        </div>
        <button onClick={() => void step(-1)} aria-label="上一首" className="text-muted disabled:opacity-40" disabled={tracks.length < 2}>
          <SkipPrevIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => (active ? void toggle() : fileRef.current?.click())}
          aria-label={playing ? '暂停' : '播放'}
          className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          {playing ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlayIcon className="h-[18px] w-[18px]" />}
        </button>
        <button onClick={() => void step(1)} aria-label="下一首" className="text-muted disabled:opacity-40" disabled={tracks.length < 2}>
          <SkipNextIcon className="h-[18px] w-[18px]" />
        </button>
        <button onClick={() => setListOpen((o) => !o)} aria-label="歌单" className={`px-0.5 text-[14px] ${listOpen ? 'text-accent' : 'text-muted'}`}>
          ♫
        </button>
      </div>

      {active && (
        <input
          type="range"
          min={0}
          max={Math.max(1, dur)}
          step={0.1}
          value={Math.min(pos, dur || 0)}
          onChange={(e) => {
            const a = ensureAudio()
            if (a.src) a.currentTime = Number(e.target.value)
          }}
          className="mt-2 h-1 w-full accent-accent"
          aria-label="进度"
        />
      )}

      {err && <p className="mt-1.5 text-[10px] leading-relaxed text-red-500">{err}</p>}

      {listOpen && (
        <div className="mt-2 space-y-1 border-t border-line/40 pt-2">
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {tracks.map((t) => (
              <div key={t.id} className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 ${t.id === active?.id ? 'bg-accent/10' : ''}`}>
                <button onClick={() => void playTrack(t.id)} className={`min-w-0 flex-1 truncate text-left text-[12px] ${t.id === active?.id ? 'text-accent' : 'text-ink'}`}>
                  {t.name}
                </button>
                <button
                  onClick={() => {
                    lyricForRef.current = t.id
                    lyricFileRef.current?.click()
                  }}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${t.hasLyrics ? 'text-accent' : 'text-muted'}`}
                >
                  {t.hasLyrics ? '换歌词' : '+歌词'}
                </button>
                <button onClick={() => del(t)} aria-label="删除" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-red-500">
                  <TrashIcon className="h-[13px] w-[13px]" />
                </button>
              </div>
            ))}
            {tracks.length === 0 && <p className="px-2 py-1 text-[11px] text-muted">上传几首喜欢的歌吧～只存在你本机 ♡</p>}
          </div>
          <button onClick={() => fileRef.current?.click()} className="glass w-full rounded-xl py-1.5 text-[12px] text-ink">
            ＋ 添加音乐（可连同同名 .lrc 歌词一起选）
          </button>
        </div>
      )}
    </section>,
    slot,
  )
}
