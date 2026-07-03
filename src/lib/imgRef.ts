/**
 * 消息图片的 IndexedDB 引用：图片本体存 IDB（GB 级空间），消息里只留 `idb:` 引用字符串——
 * 不占 localStorage 那可怜的 5MB（写满会静默丢对话，出过事故，见 HANDOFF H0）。
 * 显示用 components/ui/IdbImg；喂模型 vision 前用 resolveImgRef 换回 dataURL。
 */

import { idbGet, idbSet } from '@/lib/idb'

/** 存图进 IDB，同步返回 `idb:` 引用（写入在后台进行） */
export function putImgRef(prefix: string, id: string, dataUrl: string): string {
  const key = `${prefix}:${id}`
  void idbSet(key, dataUrl)
  return `idb:${key}`
}

/** `idb:` 引用 → dataURL；普通地址原样返回；取不到返回 '' */
export async function resolveImgRef(src: string): Promise<string> {
  if (!src.startsWith('idb:')) return src
  return (await idbGet<string>(src.slice(4))) || ''
}
