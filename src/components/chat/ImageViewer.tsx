import { useEffect, useState, type RefObject } from 'react'
import IdbImg from '@/components/ui/IdbImg'

// 聊天里的图片：单独一块（不进文字气泡）。多张时像几张照片歪着叠在一起，点开再左右翻。
const TILTS = [-7, 5, 0]

export function ImageStack({
  refs,
  me,
  onOpen,
}: {
  refs: string[]
  me: boolean
  onOpen: (all: string[], index: number) => void
}) {
  const list = refs.filter(Boolean)
  if (!list.length) return null
  if (list.length === 1) {
    return (
      <div className={`bw-image-stack relative z-[1] my-2 ${me ? 'ml-auto' : ''}`}>
        <IdbImg
          src={list[0]}
          alt="图片"
          onClick={() => onOpen(list, 0)}
          className="block max-h-64 max-w-[min(240px,70vw)] cursor-pointer rounded-[18px] border-[3px] border-white/90 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
        />
      </div>
    )
  }
  // 最多叠 3 张，最上面那张放第一张
  const shown = list.slice(0, 3).reverse()
  return (
    <button
      type="button"
      onClick={() => onOpen(list, 0)}
      className={`bw-image-stack relative z-[1] my-3 block h-[200px] w-[190px] shrink-0 ${me ? 'ml-auto mr-2' : 'ml-2'}`}
      aria-label={`${list.length} 张图片`}
    >
      {shown.map((ref, i) => {
        const depth = shown.length - 1 - i // 0 = 最上面
        const tilt = TILTS[(TILTS.length - shown.length + i) % TILTS.length]
        return (
          <span
            key={ref}
            className="absolute inset-0 block overflow-hidden rounded-[18px] border-[3px] border-white/95 bg-white/70 shadow-[0_10px_26px_rgba(0,0,0,0.18)]"
            style={{
              transform: `translate(${depth * (me ? -14 : 14)}px, ${depth * 4}px) rotate(${me ? tilt : -tilt}deg)`,
              zIndex: i + 1,
            }}
          >
            <IdbImg src={ref} alt="图片" className="h-full w-full object-cover" />
          </span>
        )
      })}
      <span className="absolute bottom-2 right-2 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
        {list.length} 张
      </span>
    </button>
  )
}

async function saveImage(url: string) {
  try {
    const blob = await (await fetch(url)).blob()
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const file = new File([blob], `image-${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] })
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return
    window.open(url, '_blank')
  }
}

export function ImageViewer({
  urls,
  index,
  at,
  setAt,
  scrollRef,
  onClose,
}: {
  urls: string[]
  index: number
  at: number
  setAt: (n: number) => void
  scrollRef: RefObject<HTMLDivElement>
  onClose: () => void
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = index * el.clientWidth
  }, [index, scrollRef])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-black/25 backdrop-blur-2xl transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      style={{ WebkitBackdropFilter: 'blur(28px) saturate(1.2)' }}
      onClick={onClose}
    >
      {/* 顶部独立的一栏：左关闭，右保存/分享 */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/55 text-[#1f2328] shadow-sm backdrop-blur-md"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {urls.length > 1 && (
          <span className="rounded-full bg-white/45 px-3 py-1 text-[12px] text-[#1f2328]">
            {at + 1} / {urls.length}
          </span>
        )}
        <button
          type="button"
          aria-label="保存或分享"
          onClick={() => void saveImage(urls[at] ?? urls[0])}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/55 text-[#1f2328] shadow-sm backdrop-blur-md"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" />
            <path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
          </svg>
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-7 py-6">
            <img
              src={url}
              alt="大图"
              onClick={(e) => e.stopPropagation()}
              className={`max-h-full max-w-full rounded-[26px] object-contain shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform duration-300 ${shown ? 'scale-100' : 'scale-95'}`}
            />
          </div>
        ))}
      </div>
      <div
        className="shrink-0 text-center text-[11px] text-white/85"
        style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
      >
        {urls.length > 1 ? '左右滑动 · ' : ''}长按或点右上角保存 · 点空白关闭
      </div>
    </div>
  )
}
