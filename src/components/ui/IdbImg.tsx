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
      void idbGet<string>(src.slice(4)).then((d) => {
        if (alive && d) setUrl(d)
      })
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
