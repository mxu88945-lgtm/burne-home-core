/**
 * 把可能是 `idb:` 引用的图片地址解析成可渲染的 src。
 * 背景图/大图本体存 IndexedDB，localStorage 里只留引用字符串（5MB 事故根治，见 HANDOFF H0）。
 * 普通 dataURL / http 地址原样返回；idb: 引用先返回 ''（未加载），取到后触发重渲。
 */

import { useEffect, useState } from 'react'
import { resolveImgRef } from '@/lib/imgRef'

export function useImgSrc(src?: string): string {
  const isRef = !!src && src.startsWith('idb:')
  const [out, setOut] = useState(isRef ? '' : src || '')
  useEffect(() => {
    if (!src || !src.startsWith('idb:')) {
      setOut(src || '')
      return
    }
    let on = true
    // 刚上传时后台写入可能还没落盘 → 空结果时小退避重试几次
    void (async () => {
      for (let i = 0; i < 4; i++) {
        const d = await resolveImgRef(src)
        if (!on) return
        if (d) {
          setOut(d)
          return
        }
        await new Promise((r) => setTimeout(r, 250 * (i + 1)))
      }
    })()
    return () => {
      on = false
    }
  }, [src])
  return out
}
