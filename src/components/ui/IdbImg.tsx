/**
 * 支持 `idb:` 引用的图片：消息图片本体存 IndexedDB（key `dmimg:*`），
 * localStorage 里只留引用字符串——不占那可怜的 5MB 配额（丢对话事故的元凶）。
 * 普通 dataURL / http 地址原样显示。
 */

import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { idbGet } from '@/lib/idb'

export default function IdbImg({ src, ...rest }: { src: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const isRef = src.startsWith('idb:')
  const [url, setUrl] = useState(isRef ? '' : src)

  useEffect(() => {
    let alive = true
    if (src.startsWith('idb:')) {
      setUrl('')
      // Safari 冷启动时，贴纸面板可能比 IndexedDB 恢复得更快；空结果稍后重试，
      // 避免图片贴纸第一次打开时只剩一格空白占位。
      void (async () => {
        for (let i = 0; i < 4; i++) {
          const d = await idbGet<string>(src.slice(4))
          if (!alive) return
          if (d) {
            setUrl(d)
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)))
        }
      })()
    } else {
      setUrl(src)
    }
    return () => {
      alive = false
    }
  }, [src])

  if (!url) return <div className={rest.className} aria-hidden />
  return <img src={url} {...rest} />
}
