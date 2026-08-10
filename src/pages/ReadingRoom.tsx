import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadingStore, paginate } from '@/store/readingStore'
import { useApiStore } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { usePersonaStore } from '@/store/personaStore'
import { useProfileStore } from '@/store/profileStore'
import { useMemoryStore } from '@/store/memoryStore'
import { recallMemories } from '@/lib/memoryRecall'
import { chatComplete } from '@/api/llm'
import type { ChatApiMessage } from '@/api/chat'
import { readAsText } from '@/lib/file'
import { SendIcon } from '@/components/ui/icons'

function uid() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random()}`
}
function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function ReadingRoom() {
  const {
    books,
    activeId,
    autoComment,
    content,
    loaded,
    loadActive,
    openBook,
    closeBook,
    addBook,
    deleteBook,
    setPage,
    setMessages,
    markCommented,
    apiChannelId,
    summaryEvery,
    autoSummary,
    addSummary,
  } = useReadingStore()

  const activeBook = books.find((b) => b.id === activeId) || null
  const pages = useMemo(() => (activeBook ? paginate(content) : []), [content, activeId])
  const total = pages.length
  const cur = Math.min(activeBook?.page ?? 0, Math.max(0, total - 1))
  const messages = activeBook?.messages ?? []
  const commented = activeBook?.commented ?? []
  const summaries = activeBook?.summaries ?? []
  const lastCovered = summaries.length ? summaries[summaries.length - 1].toPage : -1

  // 导入态
  const [importing, setImporting] = useState(false)
  const [title, setTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 讨论
  const [panelOpen, setPanelOpen] = useState(false)
  const [ask, setAsk] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const busyRef = useRef(false)
  const sumBusyRef = useRef(false)
  const readerRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const discListRef = useRef<HTMLDivElement>(null)

  const mainActive = useApiStore((s) => s.getActive())
  const channels = useApiStore((s) => s.channels)
  // 读书独立渠道：选了就用选的，否则跟随主聊天
  const activeChannel = (apiChannelId && channels.find((c) => c.id === apiChannelId)) || mainActive
  const { config } = useSyncStore()
  const persona = usePersonaStore((s) => s.persona)
  const nameA = useProfileStore((s) => s.profile.nameA) || '我'
  const taName = persona.name || '他'

  // 进房间时载入当前书正文
  useEffect(() => {
    loadActive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 翻页后回到这页顶部
  useEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0
  }, [cur])

  // 讨论：新消息 / 打开面板时滚到最新
  useEffect(() => {
    const el = discListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, panelOpen, sending])

  function recap() {
    if (!summaries.length) return ''
    const all = summaries.map((s) => s.text).join('\n\n')
    const trimmed = all.length > 1800 ? all.slice(-1800) : all
    return `\n\n[前情提要（你和${nameA}一起读到现在的剧情与你俩的讨论/预测，请记住并自然延续，别自相矛盾）]\n${trimmed}`
  }

  // 注入长期记忆，让一起读书时 TA 也「记得」你们的事（概述 + 标星 + 最近 15，省 token）
  function memInject(query: string) {
    const m = useMemoryStore.getState()
    const result = recallMemories({
      query,
      scope: 'reading',
      memories: m.memories,
      overview: m.overview,
      maxChars: 1800,
      maxItems: 10,
    })
    m.recordDiagnostic(result.diagnostic)
    return result.text
  }

  function buildSys(idx: number, query = '') {
    return (
      `${persona.systemPrompt}${memInject(query)}${recap()}\n\n` +
      `[一起看书 · 聊天风格（仅本场景，务必遵守）]\n` +
      `你正在和${nameA}一起读《${activeBook!.title}》，现在读到第 ${idx + 1}/${total} 页。\n` +
      `这里是像微信聊天一样的即时消息：请只用简短、口语化的短句，直接说出你对这页的看法 / 感受 / 吐槽。\n` +
      `严格禁止：动作描写、神态描写、环境旁白、括号里的小动作（如「我把书放下」「侧头看你」之类一律不要）。\n` +
      `只说话本身，几句话以内说完，别长篇大论。可以偶尔用一个小表情/emoji 点缀即可——别每句都带、别堆叠，适量克制。保留你的人格和语气。\n\n` +
      `[当前这页内容]\n${pages[idx]}`
    )
  }

  async function discuss() {
    const text = ask.trim()
    if (!text || sending) return
    const mine = { id: uid(), role: 'me' as const, text, at: now() }
    setMessages((prev) => [...prev, mine])
    setAsk('')
    if (!activeChannel) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'companion',
          text: '（还没配 API 哦～去「设置 → API · 模型」加一条渠道，我就能陪你一起读啦 ♡）',
          at: now(),
        },
      ])
      return
    }
    setSending(true)
    try {
      const history: ChatApiMessage[] = [...messages, mine]
        .slice(-8)
        .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }))
      const r = await chatComplete(activeChannel, history, buildSys(cur, text), {
        temperature: persona.temperature,
        maxTokens: Math.min(persona.maxTokens, 1500),
        workerUrl: config.workerUrl?.trim(),
        syncKey: config.syncKey,
      })
      setMessages((prev) => [...prev, { id: uid(), role: 'companion', text: r.text.trim(), at: now() }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'companion', text: `（出错了：${(e as Error).message}）`, at: now() },
      ])
    } finally {
      setSending(false)
    }
  }

  /** TA 主动读这页并冒观点（翻到新页时触发，每页只评一次） */
  async function commentOnPage(idx: number) {
    if (!activeChannel || !activeBook || busyRef.current) return
    if (commented.includes(idx)) return
    busyRef.current = true
    setSending(true)
    try {
      const nudge: ChatApiMessage = {
        role: 'user',
        content: `（我们一起翻到了第 ${idx + 1} 页，你看完这页，主动说一两句你的看法或感受，不用等我开口。）`,
      }
      const history: ChatApiMessage[] = [
        ...messages.slice(-4).map(
          (m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }) as ChatApiMessage,
        ),
        nudge,
      ]
      const r = await chatComplete(activeChannel, history, buildSys(idx), {
        temperature: persona.temperature,
        maxTokens: 800,
        workerUrl: config.workerUrl?.trim(),
        syncKey: config.syncKey,
      })
      const text = r.text.trim()
      if (text) {
        setMessages((prev) => [...prev, { id: uid(), role: 'companion', text, at: now() }])
        if (!panelOpen) setUnread(true)
      }
      markCommented(idx)
    } catch {
      /* 主动评论失败就静默，不打扰阅读 */
    } finally {
      busyRef.current = false
      setSending(false)
    }
  }

  /** 生成一段剧情摘要（覆盖 lastCovered+1 .. toPage） */
  async function generateSummary(toPage: number) {
    if (!activeChannel || !activeBook || sumBusyRef.current) return
    const from = lastCovered + 1
    if (toPage < from) return
    sumBusyRef.current = true
    setSummarizing(true)
    try {
      const segText = pages.slice(from, toPage + 1).join('\n\n').slice(0, 8000)
      const disc = messages
        .slice(-12)
        .map((m) => `${m.role === 'me' ? nameA : taName}：${m.text}`)
        .join('\n')
      const prev = summaries.length ? summaries[summaries.length - 1].text : ''
      const sys = '你是剧情记录助手，只输出简洁中文摘要正文，不要寒暄、不要客套。'
      const ask =
        `《${activeBook.title}》第 ${from + 1}~${toPage + 1} 页内容：\n${segText}\n\n` +
        (disc ? `我们（${nameA} 与 ${taName}）这段的讨论：\n${disc}\n\n` : '') +
        (prev ? `已有前情提要（接着写、别重复）：\n${prev}\n\n` : '') +
        `请输出这一段的「剧情摘要」：先 3~5 句讲清这几页发生了什么；再用一两句概括「${nameA} 和 ${taName} 各自的看法或预测」（没有讨论就略过）。控制在 180 字内。`
      const r = await chatComplete(activeChannel, [{ role: 'user', content: ask }], sys, {
        temperature: 0.5,
        maxTokens: 600,
        workerUrl: config.workerUrl?.trim(),
        syncKey: config.syncKey,
      })
      const text = r.text.trim()
      if (text) addSummary(text, toPage)
    } catch {
      /* 静默 */
    } finally {
      sumBusyRef.current = false
      setSummarizing(false)
    }
  }

  // 每读够 summaryEvery 页，自动生成一段剧情摘要
  useEffect(() => {
    if (!loaded || !autoSummary || !activeBook || !content || !activeChannel) return
    if (cur - lastCovered >= summaryEvery) {
      const t = setTimeout(() => generateSummary(lastCovered + summaryEvery), 1800)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, autoSummary, summaryEvery, lastCovered, activeChannel, loaded])

  // 翻到新页且开启「主动跟读」时，停留一会儿后让 TA 主动冒观点
  useEffect(() => {
    if (!loaded || !autoComment || !activeBook || !content || !activeChannel || total === 0) return
    if (commented.includes(cur)) return
    const t = setTimeout(() => commentOnPage(cur), 1400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, autoComment, total, activeChannel, loaded, activeId])

  function go(delta: number) {
    const next = Math.min(total - 1, Math.max(0, cur + delta))
    if (next !== cur) setPage(next)
  }
  function jumpPage() {
    const v = window.prompt(`跳到第几页？（1 - ${total}）`, String(cur + 1))
    if (v == null) return
    const n = parseInt(v, 10)
    if (!Number.isNaN(n)) setPage(Math.min(total - 1, Math.max(0, n - 1)))
  }

  async function onPickFile(file: File) {
    setErr('')
    try {
      const text = await readAsText(file)
      setDraftText(text)
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
    } catch {
      setErr('读取文件失败，换个 .txt 试试')
    }
  }
  async function startReading() {
    if (!draftText.trim()) {
      setErr('先粘贴或上传一些内容')
      return
    }
    await addBook(title, draftText)
    setTitle('')
    setDraftText('')
    setErr('')
    setImporting(false)
  }

  /* ---------- 载入中（正在打开某本书） ---------- */
  if (activeId && !loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">载入中…</div>
  }

  /* ---------- 书架 / 导入 ---------- */
  if (!activeBook) {
    const showImport = importing || books.length === 0
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="glass rounded-full px-3 py-1.5 text-xs text-ink">
            ← 主页
          </Link>
          {books.length > 0 && (
            <button
              type="button"
              onClick={() => setImporting((v) => !v)}
              className="btn-primary rounded-full px-3 py-1.5 text-xs"
            >
              {showImport ? '✕ 收起' : '＋ 导入新书'}
            </button>
          )}
        </div>
        <div className="px-1">
          <h2 className="headline text-2xl text-ink">书架 📚</h2>
          <p className="mt-1 text-sm text-muted">和 TA 一起读 · 点开继续，进度各自保存</p>
        </div>

        {err && <div className="text-[12px] text-red-500">{err}</div>}

        {/* 导入表单 */}
        {showImport && (
          <div className="glass space-y-3 rounded-3xl p-5">
            <label className="block">
              <span className="text-[11px] text-muted">书名（可不填）</span>
              <input
                className={inputCls + ' mt-1'}
                placeholder="如 小王子"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted">正文（粘贴文字）</span>
              <textarea
                className={inputCls + ' mt-1 min-h-[180px] leading-relaxed'}
                placeholder="把小说 / 文章的文字粘贴到这里…"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="glass rounded-xl px-4 py-2 text-sm text-ink"
              >
                上传 .txt
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onPickFile(f)
                }}
              />
              <button type="button" onClick={startReading} className="btn-primary rounded-xl px-5 py-2 text-sm">
                加入书架并阅读
              </button>
            </div>
            <p className="text-[11px] text-muted">书只存在你本机，不上传、不进仓库。</p>
          </div>
        )}

        {/* 书架列表 */}
        {books.length > 0 && (
          <div className="space-y-2">
            {books.map((b) => (
              <div
                key={b.id}
                onClick={() => openBook(b.id)}
                className="glass flex items-center gap-3 rounded-2xl p-4 transition active:scale-[0.99]"
              >
                <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-accent/15 text-lg">
                  📖
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{b.title}</div>
                  <div className="text-[11px] text-muted">
                    {b.page > 0 ? `读到第 ${b.page + 1} 页` : '还没开始'}
                    {b.messages.length > 0 ? ` · ${b.messages.length} 条讨论` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`从书架删除《${b.title}》？（正文和讨论都会清掉）`)) deleteBook(b.id)
                  }}
                  aria-label="删除"
                  className="text-[12px] text-muted hover:text-accent"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 怎么导入 */}
        <details className="glass rounded-2xl p-4 text-[12px] text-ink">
          <summary className="cursor-pointer text-sm font-medium">怎么弄到书的文字？📥</summary>
          <div className="mt-2 space-y-2 leading-relaxed text-muted">
            <p>
              <b className="text-ink">最简单：复制粘贴。</b> 在浏览器/看书 App 选中文字 → 复制 → 回这里长按输入框「粘贴」，一次贴一章也行。
            </p>
            <p>
              <b className="text-ink">下载 txt：</b> AO3 有 Download→TXT 按钮；下到 iPhone「文件」App 后，点「上传 .txt」选它。
            </p>
            <p>太长也没事：每次只把你正在读的「这一页」发给 TA，不会一下烧很多 token。</p>
          </div>
        </details>
      </div>
    )
  }

  /* ---------- 阅读态 ---------- */
  return (
    <div className="relative flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex flex-none items-center justify-between gap-2 pb-2">
        <button type="button" onClick={closeBook} className="text-[12px] text-muted hover:text-accent">
          ← 书架
        </button>
        <button type="button" onClick={jumpPage} className="min-w-0 text-center">
          <div className="headline truncate text-lg leading-none text-ink">{activeBook.title}</div>
          <div className="mt-0.5 text-[10px] text-muted">
            第 {cur + 1} / {total} 页 · 点这里跳页
          </div>
        </button>
        <Link to="/" className="text-[12px] text-muted hover:text-accent">
          主页
        </Link>
      </div>

      {/* 进度条 */}
      <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/40">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${total ? ((cur + 1) / total) * 100 : 0}%` }}
        />
      </div>

      {/* 阅读区（左右滑动翻页） */}
      <div
        ref={readerRef}
        style={{ touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          touchRef.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const s = touchRef.current
          touchRef.current = null
          if (!s) return
          const t = e.changedTouches[0]
          const dx = t.clientX - s.x
          const dy = t.clientY - s.y
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
            if (dx < 0) go(1)
            else go(-1)
          }
        }}
        onTouchCancel={() => {
          touchRef.current = null
        }}
        className="glass min-h-0 flex-1 overflow-y-auto rounded-3xl p-5"
      >
        <p className="headline whitespace-pre-wrap text-[15px] not-italic leading-loose text-ink [overflow-wrap:anywhere]">
          {pages[cur]}
        </p>
      </div>

      {/* 翻页 */}
      <div className="flex flex-none items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={cur <= 0}
          className="glass flex-1 rounded-xl py-2.5 text-sm text-ink disabled:opacity-40"
        >
          ‹ 上一页
        </button>
        <button
          type="button"
          onClick={() => {
            setUnread(false)
            setPanelOpen((o) => !o)
          }}
          aria-label="讨论"
          className="btn-primary relative rounded-xl px-4 py-2.5 text-sm"
        >
          💬
          {unread && !panelOpen && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white/70" />
          )}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={cur >= total - 1}
          className="glass flex-1 rounded-xl py-2.5 text-sm text-ink disabled:opacity-40"
        >
          下一页 ›
        </button>
      </div>

      {/* 讨论小窗 */}
      {panelOpen && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col">
          <div className="glass-strong flex min-h-0 flex-1 flex-col rounded-t-3xl p-3">
            <div className="flex flex-none items-center justify-between px-1 pb-2">
              <span className="headline text-base text-ink">和 {taName} 聊这页</span>
              <div className="flex items-center gap-3 text-[12px]">
                <button type="button" onClick={() => setReviewOpen(true)} className="text-accent">
                  📖 回顾{summaries.length ? `(${summaries.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => generateSummary(cur)}
                  disabled={summarizing}
                  className="text-accent disabled:opacity-50"
                >
                  {summarizing ? '总结中…' : '总结'}
                </button>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="text-muted hover:text-accent"
                >
                  收起 ▾
                </button>
              </div>
            </div>
            <div ref={discListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
              {messages.length === 0 && (
                <p className="px-1 pt-4 text-center text-[12px] text-muted">
                  问问 {taName} 对这页的看法，或说说你的感受～
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.role === 'me' ? 'text-right' : 'text-left'}>
                  <div
                    className={[
                      'inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]',
                      m.role === 'me' ? 'btn-primary rounded-br-md' : 'glass rounded-bl-md text-ink',
                    ].join(' ')}
                  >
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="text-left">
                  <span className="glass inline-block rounded-2xl px-3 py-2 text-sm text-muted">
                    {taName} 正在看这页…
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-none items-center gap-1 rounded-full bg-white/40 py-1.5 pl-3 pr-1.5">
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') discuss()
                }}
                placeholder={`和 ${taName} 说说这页…`}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={discuss}
                disabled={sending || !ask.trim()}
                aria-label="发送"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent hover:bg-white/40 disabled:opacity-40"
              >
                <SendIcon className="h-[17px] w-[17px]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 剧情回顾 */}
      {reviewOpen && (
        <div
          className="absolute inset-0 z-30 flex flex-col bg-black/40"
          onClick={() => setReviewOpen(false)}
        >
          <div
            className="glass-strong mt-auto flex max-h-[78%] flex-col rounded-t-3xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between pb-2">
              <span className="headline text-base text-ink">剧情回顾 📖</span>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="text-[12px] text-muted hover:text-accent"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {summaries.length === 0 ? (
                <p className="pt-6 text-center text-[12px] text-muted">
                  还没有剧情摘要～读够 {summaryEvery} 页会自动生成，或点「立即总结」。
                </p>
              ) : (
                summaries.map((s, i) => (
                  <div key={i} className="glass rounded-2xl p-3">
                    <div className="label mb-1">到第 {s.toPage + 1} 页</div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                      {s.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
