/**
 * 悬浮音乐播放器：收起＝角落一张会转的小唱片，点开＝小卡（歌名/进度/上一首/播放/下一首/歌单）。
 * 音频文件用户自己上传：本体存 IndexedDB（key `music:{id}`，只在本机、不上传），元数据在 musicStore。
 * 挂在 AppLayout（app 列 relative 作定位上下文），全站可用；外观页可整体关掉。
 */

import { useEffect, useRef, useState } from 'react'
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
  const collapsed = useMusicStore((s) => s.collapsed)
  const tracks = useMusicStore((s) => s.tracks)
  const activeId = useMusicStore((s) => s.activeId)
  const setCollapsed = useMusicStore((s) => s.setCollapsed)
  const addTracks = useMusicStore((s) => s.addTracks)
  const removeTrack = useMusicStore((s) => s.removeTrack)
  const setActive = useMusicStore((s) => s.setActive)

  const [playing, setPlaying] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [err, setErr] = useState('')
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
      a.addEventListener('timeupdate', () => {
        setPos(a!.currentTime)
        if (isFinite(a!.duration)) setDur(a!.duration)
      })
      a.addEventListener('play', () => setPlaying(true))
      a.addEventListener('pause', () => setPlaying(false))
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
    setPos(0)
    setDur(0)
    return a
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
    try {
      for (const f of Array.from(files)) {
        const id = musicTrackId()
        await idbSet(`music:${id}`, f)
        metas.push({ id, name: f.name.replace(/\.[^.]+$/, '') })
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

  // 卸载时收拾资源
  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  if (!enabled) return null

  const disc = (
    <span
      className="music-disc shrink-0"
      style={{ animationPlayState: playing ? 'running' : 'paused' }}
      aria-hidden
    />
  )

  return (
    <div className="absolute bottom-24 right-2.5 z-30">
      <input ref={fileRef} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="打开播放器"
          className="glass-strong flex h-11 w-11 items-center justify-center rounded-full shadow-lg"
        >
          {disc}
        </button>
      ) : (
        <div className="glass-strong w-64 rounded-2xl p-3 shadow-lg">
          <div className="flex items-center gap-2">
            {disc}
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{active ? active.name : '还没有音乐'}</span>
            <button onClick={() => setListOpen((o) => !o)} aria-label="歌单" className={`px-1 text-[13px] ${listOpen ? 'text-accent' : 'text-muted'}`}>
              ♫
            </button>
            <button onClick={() => { setCollapsed(true); setListOpen(false) }} aria-label="收起" className="px-1 text-[13px] text-muted">
              ▾
            </button>
          </div>

          {/* 进度条 */}
          <div className="mt-2 flex items-center gap-2">
            <span className="w-8 text-right text-[10px] tabular-nums text-muted">{fmt(pos)}</span>
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
              className="h-1 min-w-0 flex-1 accent-accent"
              aria-label="进度"
            />
            <span className="w-8 text-[10px] tabular-nums text-muted">{fmt(dur)}</span>
          </div>

          {/* 控制键 */}
          <div className="mt-1.5 flex items-center justify-center gap-6">
            <button onClick={() => void step(-1)} aria-label="上一首" className="text-muted hover:text-accent disabled:opacity-40" disabled={tracks.length < 2}>
              <SkipPrevIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => void toggle()}
              aria-label={playing ? '暂停' : '播放'}
              className="btn-primary flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
              disabled={!active}
            >
              {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            </button>
            <button onClick={() => void step(1)} aria-label="下一首" className="text-muted hover:text-accent disabled:opacity-40" disabled={tracks.length < 2}>
              <SkipNextIcon className="h-5 w-5" />
            </button>
          </div>

          {err && <p className="mt-1.5 text-[10px] leading-relaxed text-red-500">{err}</p>}

          {/* 歌单 */}
          {(listOpen || tracks.length === 0) && (
            <div className="mt-2 space-y-1 border-t border-line/40 pt-2">
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {tracks.map((t) => (
                  <div key={t.id} className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 ${t.id === active?.id ? 'bg-accent/10' : ''}`}>
                    <button onClick={() => void playTrack(t.id)} className={`min-w-0 flex-1 truncate text-left text-[12px] ${t.id === active?.id ? 'text-accent' : 'text-ink'}`}>
                      {t.name}
                    </button>
                    <button onClick={() => del(t)} aria-label="删除" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-red-500">
                      <TrashIcon className="h-[13px] w-[13px]" />
                    </button>
                  </div>
                ))}
                {tracks.length === 0 && <p className="px-2 py-1 text-[11px] text-muted">上传几首喜欢的歌吧～只存在你本机 ♡</p>}
              </div>
              <button onClick={() => fileRef.current?.click()} className="glass w-full rounded-xl py-1.5 text-[12px] text-ink">
                ＋ 添加音乐
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
