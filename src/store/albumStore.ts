/**
 * 相册（Zustand）：条目信息（标题/备注/日期/分类/引用）存 localStorage，
 * 图片本体存 IndexedDB（`idb:album:<id>`），整包备份会顺着 idb: 引用一起导出。
 */
import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { idbDel } from '@/lib/idb'
import { saveImgRef } from '@/lib/imgRef'
import { localDate, newPeopleId } from '@/lib/people'
import { ALBUM_CATEGORIES, type AlbumCategory, type AlbumEntry } from '@/lib/album'

type Patch = Partial<Pick<AlbumEntry, 'title' | 'note' | 'date' | 'category'>>

interface AlbumState {
  entries: AlbumEntry[]
  /** 存一张已压缩好的图片（dataURL），返回新条目 */
  addPhoto: (dataUrl: string, patch?: Patch) => Promise<AlbumEntry>
  updateEntry: (id: string, patch: Patch) => void
  removeEntry: (id: string) => void
}

export function loadAlbum(): AlbumEntry[] {
  const list = readJSON<AlbumEntry[]>(STORAGE_KEYS.album, [])
  if (!Array.isArray(list)) return []
  return list
    .filter((e) => e && typeof e.id === 'string' && typeof e.src === 'string')
    .map((e) => ({
      ...e,
      title: e.title ?? '',
      note: e.note ?? '',
      date: e.date || localDate(new Date(e.createdAt || Date.now())),
      category: (ALBUM_CATEGORIES as string[]).includes(e.category) ? e.category : ('art' as AlbumCategory),
      createdAt: e.createdAt || Date.now(),
    }))
}

export const useAlbumStore = create<AlbumState>((set, get) => {
  const commit = (entries: AlbumEntry[]) => {
    writeJSON(STORAGE_KEYS.album, entries)
    set({ entries })
  }
  return {
    entries: loadAlbum(),

    addPhoto: async (dataUrl, patch) => {
      const id = newPeopleId('ph')
      const src = dataUrl.startsWith('data:') ? await saveImgRef('album', id, dataUrl) : dataUrl
      const now = Date.now()
      const entry: AlbumEntry = {
        id,
        title: patch?.title?.trim() ?? '',
        note: patch?.note?.trim() ?? '',
        date: patch?.date || localDate(),
        category: patch?.category ?? 'him',
        src,
        createdAt: now,
      }
      commit([...get().entries, entry])
      return entry
    },

    updateEntry: (id, patch) =>
      commit(get().entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e))),

    removeEntry: (id) => {
      const hit = get().entries.find((e) => e.id === id)
      commit(get().entries.filter((e) => e.id !== id))
      if (hit?.src.startsWith('idb:')) void idbDel(hit.src.slice(4)).catch(() => {})
    },
  }
})
