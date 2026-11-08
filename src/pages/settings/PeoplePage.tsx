import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { usePeopleStore } from '@/store/peopleStore'
import { localDate, parseAliases, sortedEvents, type Person } from '@/lib/people'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

function PersonCard({ person }: { person: Person }) {
  const updatePerson = usePeopleStore((s) => s.updatePerson)
  const removePerson = usePeopleStore((s) => s.removePerson)
  const addEvent = usePeopleStore((s) => s.addEvent)
  const updateEvent = usePeopleStore((s) => s.updateEvent)
  const removeEvent = usePeopleStore((s) => s.removeEvent)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(person.name)
  const [aliases, setAliases] = useState(person.aliases.join('、'))
  const [background, setBackground] = useState(person.background)
  const [evDate, setEvDate] = useState(localDate())
  const [evText, setEvText] = useState('')
  const events = sortedEvents(person).reverse()

  function save() {
    const n = name.trim()
    if (!n) return
    updatePerson(person.id, { name: n, aliases: parseAliases(aliases), background: background.trim() })
    setOpen(false)
  }

  return (
    <div className="glass rounded-2xl px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => {
          if (!open) {
            setName(person.name)
            setAliases(person.aliases.join('、'))
            setBackground(person.background)
          }
          setOpen((o) => !o)
        }}
      >
        <span className="flex-1">
          <span className="block text-sm font-medium text-ink">
            {person.name}
            {person.aliases.length > 0 && (
              <span className="ml-1 text-[11px] font-normal text-muted">（{person.aliases.join('、')}）</span>
            )}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {person.background || '还没写背景'} · {person.events.length} 条事件
          </span>
        </span>
        <span className="text-muted">{open ? '˄' : '˅'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="名字" />
          <input
            className={inputCls}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="别名（用顿号或空格隔开）"
          />
          <textarea
            className={`${inputCls} min-h-[64px]`}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="和你的关系 / 背景，一句话"
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm text-white">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`删除「${person.name}」和 TA 的所有事件？`)) removePerson(person.id)
              }}
              className="rounded-xl border border-line px-3 py-2 text-sm text-red-500"
            >
              删除
            </button>
          </div>

          <div className="label pt-1">事件</div>
          <div className="flex gap-2">
            <input
              type="date"
              className={`${inputCls} w-[8.5rem] shrink-0`}
              value={evDate}
              onChange={(e) => setEvDate(e.target.value)}
            />
            <input
              className={inputCls}
              value={evText}
              onChange={(e) => setEvText(e.target.value)}
              placeholder="发生了什么，一行"
            />
            <button
              type="button"
              onClick={() => {
                if (!evText.trim()) return
                addEvent(person.id, evText, evDate || undefined)
                setEvText('')
              }}
              className="shrink-0 rounded-xl border border-line px-3 text-sm text-accent"
            >
              加
            </button>
          </div>
          {events.length === 0 && <p className="text-[11px] text-muted">还没有事件。聊天里提到 TA 的新事，伯恩会自动记在这里。</p>}
          {events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 text-[13px]">
              <span className="shrink-0 pt-0.5 text-[11px] text-muted">{ev.date.slice(5).replace('-', '/')}</span>
              <span
                className="flex-1 text-ink"
                onClick={() => {
                  const t = window.prompt('修改这条事件', ev.text)
                  if (t != null && t.trim()) updateEvent(person.id, ev.id, { text: t.trim() })
                }}
              >
                {ev.text}
              </span>
              <button type="button" className="shrink-0 text-muted" onClick={() => removeEvent(person.id, ev.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeoplePage() {
  const people = usePeopleStore((s) => s.people)
  const addPerson = usePeopleStore((s) => s.addPerson)
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')

  function add() {
    const n = newName.trim()
    if (!n) return
    if (people.some((p) => p.name === n || p.aliases.includes(n))) {
      setMsg(`「${n}」已经在了`)
      return
    }
    addPerson(n)
    setNewName('')
    setMsg('')
  }

  return (
    <SubPage title="记忆 · 人物">
      <p className="px-1 text-[11px] text-muted">
        你提到某个人时，伯恩会带上 TA 的背景、最近的事和你们说过的原话。点开可以改，也可以手动加事件。
      </p>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="新增人物的名字"
        />
        <button type="button" onClick={add} className="shrink-0 rounded-xl bg-accent px-4 text-sm text-white">
          添加
        </button>
      </div>
      {msg && <div className="text-[11px] text-accent">{msg}</div>}
      {people.map((p) => (
        <PersonCard key={p.id} person={p} />
      ))}
    </SubPage>
  )
}
