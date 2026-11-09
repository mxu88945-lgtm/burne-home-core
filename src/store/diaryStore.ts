/**
 * 伯恩的私人日记（Zustand + localStorage）。每页 ≤400 字，最多保留 500 页。
 */
import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { newPeopleId } from '@/lib/people'
import {
  DIARY_MIN_ENTRY_CHARS,
  isDuplicateDiary,
  normalizeDiaryText,
  type DiaryEntry,
} from '@/lib/diary'

const MAX_PAGES = 500

interface DiaryState {
  entries: DiaryEntry[]
  /** 存一页；太短或和已有的重复返回 false */
  addEntry: (text: string, sourceMessageId?: string) => boolean
  removeEntry: (id: string) => void
}

export function loadDiary(): DiaryEntry[] {
  const list = readJSON<DiaryEntry[]>(STORAGE_KEYS.diary, [])
  return Array.isArray(list) ? list.filter((e) => e && typeof e.text === 'string' && e.id) : []
}

export const useDiaryStore = create<DiaryState>((set, get) => {
  const commit = (entries: DiaryEntry[]) => {
    writeJSON(STORAGE_KEYS.diary, entries)
    set({ entries })
  }
  return {
    entries: loadDiary(),
    addEntry: (text, sourceMessageId) => {
      const t = normalizeDiaryText(text)
      if (Array.from(t).length < DIARY_MIN_ENTRY_CHARS) return false
      if (isDuplicateDiary(t, get().entries)) return false
      const entry: DiaryEntry = {
        id: newPeopleId('dy'),
        text: t,
        createdAt: Date.now(),
        ...(sourceMessageId ? { sourceMessageId } : {}),
      }
      commit([...get().entries, entry].slice(-MAX_PAGES))
      return true
    },
    removeEntry: (id) => commit(get().entries.filter((e) => e.id !== id)),
  }
})
