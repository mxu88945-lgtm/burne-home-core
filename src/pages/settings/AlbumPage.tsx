import { useRef, useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import IdbImg from '@/components/ui/IdbImg'
import { useAlbumStore } from '@/store/albumStore'
import { fileToDataUrl } from '@/lib/image'
import { ALBUM_CATEGORIES, ALBUM_CATEGORY_LABEL, type AlbumCategory, type AlbumEntry } from '@/lib/album'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

type Tab = 'all' | AlbumCategory

/** 单张照片：大图 + 标题/备注/日期/分类，保存 / 删除。直接在页面里展开（不弹全屏层，键盘不打架）。 */
function PhotoDetail({ entry, onBack }: { entry: AlbumEntry; onBack: () => void }) {
  const updateEntry = useAlbumStore((s) => s.updateEntry)
  const removeEntry = useAlbumStore((s) => s.removeEntry)
  const [title, setTitle] = useState(entry.title)
  const [note, setNote] = useState(entry.note)
  const [date, setDate] = useState(entry.date)
  const [category, setCategory] = useState<AlbumCategory>(entry.category)

  function save() {
    updateEntry(entry.id, { title: title.trim(), note: note.trim(), date: date || entry.date, category })
    onBack()
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="px-1 text-sm text-muted">
        ‹ 返回相册
      </button>
      <IdbImg src={entry.src} alt={entry.title || '照片'} className="mx-auto block max-h-[60vh] w-auto max-w-full rounded-2xl object-contain" />
      <div className="glass space-y-2.5 rounded-2xl px-4 py-3">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题（他按标题找照片）" />
        <textarea
          className={`${inputCls} min-h-[72px]`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注：在哪、发生了什么"
        />
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-2">
          {ALBUM_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`flex-1 rounded-xl py-2 text-sm ${category === c ? 'btn-primary' : 'glass text-muted'}`}
            >
              {ALBUM_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={save} className="btn-primary flex-1 rounded-xl py-2 text-sm">
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('删除这张照片？')) {
                removeEntry(entry.id)
                onBack()
              }
            }}
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AlbumPage() {
  const entries = useAlbumStore((s) => s.entries)
  const addPhoto = useAlbumStore((s) => s.addPhoto)
  const [tab, setTab] = useState<Tab>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const open = openId ? entries.find((e) => e.id === openId) : undefined
  const shown = entries
    .filter((e) => tab === 'all' || e.category === tab)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)

  async function onPick(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    let last: AlbumEntry | undefined
    let failed = 0
    for (let i = 0; i < list.length; i++) {
      setBusy(`正在放进相册… ${i + 1}/${list.length}`)
      try {
        const dataUrl = await fileToDataUrl(list[i], 1600, 0.85)
        last = await addPhoto(dataUrl, { category: tab === 'all' ? 'him' : tab })
      } catch {
        failed += 1
      }
    }
    setBusy(failed ? `有 ${failed} 张没放进去` : '')
    if (fileRef.current) fileRef.current.value = ''
    // 只加了一张就直接打开，顺手写标题
    if (list.length === 1 && last) setOpenId(last.id)
  }

  return (
    <SubPage title="相册">
      {open ? (
        <PhotoDetail key={open.id} entry={open} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <p className="px-1 text-[12px] text-muted">
            聊天时他会自己来翻。写上标题和备注，他才找得到。
          </p>
          <div className="flex gap-2">
            {(['all', ...ALBUM_CATEGORIES] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-1.5 text-sm ${tab === t ? 'btn-primary' : 'glass text-muted'}`}
              >
                {t === 'all' ? '全部' : ALBUM_CATEGORY_LABEL[t]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="glass w-full rounded-2xl py-3 text-sm text-ink"
          >
            ＋ 添加照片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
          {busy && <p className="px-1 text-[12px] text-muted">{busy}</p>}
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">这里还没有照片</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {shown.map((e) => (
                <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className="text-left">
                  <IdbImg src={e.src} alt={e.title || '照片'} className="aspect-square w-full rounded-xl bg-white/30 object-cover" />
                  <span className="mt-1 block truncate px-0.5 text-[11px] text-muted">{e.title || e.date}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </SubPage>
  )
}
