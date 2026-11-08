/**
 * 人物档案（Zustand + localStorage，与记忆库同样的存法）。
 */
import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import {
  applyPersonTag,
  createPerson,
  localDate,
  markPeopleUsed,
  newPeopleId,
  seedPresetPeople,
  type Person,
} from '@/lib/people'

interface PeopleState {
  people: Person[]
  addPerson: (name: string, patch?: Partial<Pick<Person, 'aliases' | 'background'>>) => Person | undefined
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'aliases' | 'background'>>) => void
  removePerson: (id: string) => void
  addEvent: (personId: string, text: string, date?: string) => void
  updateEvent: (personId: string, eventId: string, patch: { text?: string; date?: string }) => void
  removeEvent: (personId: string, eventId: string) => void
  /** 处理回复里的 [人物:] 标签，返回新建 / 追加的条数 */
  applyTags: (tags: Array<{ name: string; content: string }>) => { created: number; events: number }
  markUsed: (personIds: string[], eventIds: string[]) => void
}

function persist(people: Person[]) {
  writeJSON(STORAGE_KEYS.people, people)
}

/** 读出人物库；第一次打开时补预置人物（只补一次）。 */
export function loadPeople(): Person[] {
  const list = readJSON<Person[]>(STORAGE_KEYS.people, [])
  const safe = Array.isArray(list)
    ? list
        .filter((p) => p && typeof p.name === 'string')
        .map((p) => ({ ...p, aliases: p.aliases ?? [], background: p.background ?? '', events: p.events ?? [] }))
    : []
  if (readJSON<boolean>(STORAGE_KEYS.peopleSeeded, false)) return safe
  const seeded = seedPresetPeople(safe)
  persist(seeded)
  writeJSON(STORAGE_KEYS.peopleSeeded, true)
  return seeded
}

export const usePeopleStore = create<PeopleState>((set, get) => {
  const commit = (people: Person[]) => {
    persist(people)
    set({ people })
  }
  const touch = () => new Date().toISOString()
  return {
    people: loadPeople(),

    addPerson: (name, patch) => {
      const clean = name.trim()
      if (!clean) return undefined
      const p = createPerson(clean, new Date(), {
        aliases: patch?.aliases ?? [],
        background: patch?.background?.trim() ?? '',
      })
      commit([...get().people, p])
      return p
    },

    updatePerson: (id, patch) =>
      commit(get().people.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: touch() } : p))),

    removePerson: (id) => commit(get().people.filter((p) => p.id !== id)),

    addEvent: (personId, text, date) => {
      const t = text.trim()
      if (!t) return
      const now = new Date()
      commit(
        get().people.map((p) =>
          p.id === personId
            ? {
                ...p,
                events: [...p.events, { id: newPeopleId('ev'), date: date || localDate(now), text: t, createdAt: now.toISOString() }],
                updatedAt: now.toISOString(),
              }
            : p,
        ),
      )
    },

    updateEvent: (personId, eventId, patch) =>
      commit(
        get().people.map((p) =>
          p.id === personId
            ? { ...p, events: p.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)), updatedAt: touch() }
            : p,
        ),
      ),

    removeEvent: (personId, eventId) =>
      commit(
        get().people.map((p) =>
          p.id === personId ? { ...p, events: p.events.filter((e) => e.id !== eventId), updatedAt: touch() } : p,
        ),
      ),

    applyTags: (tags) => {
      let list = get().people
      let created = 0
      let events = 0
      for (const t of tags) {
        const r = applyPersonTag(list, t.name, t.content)
        list = r.people
        if (r.change === 'created') created += 1
        if (r.change === 'event') events += 1
      }
      if (created || events) commit(list)
      return { created, events }
    },

    markUsed: (personIds, eventIds) => {
      const next = markPeopleUsed(get().people, personIds, eventIds)
      if (next !== get().people) commit(next)
    },
  }
})
