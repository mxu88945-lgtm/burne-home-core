/**
 * 斗地主：惟惟 × 伯恩（主人）× 顾祁砚（客人）。
 * 规则、比牌、机器人全部在 lib/doudizhu*.ts（确定性代码）；模型只负责偶尔一句闲话。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar'
import { useProfileStore } from '@/store/profileStore'
import { usePersonaStore } from '@/store/personaStore'
import { useMemoryStore } from '@/store/memoryStore'
import {
  allPassed,
  analyze,
  beatingPlays,
  canBeat,
  COMBO_NAMES,
  describeCombo,
  isRed,
  makeRng,
  multiplier,
  newGame,
  placeBid,
  playCards,
  rankLabel,
  settle,
  sortCards,
  suitLabel,
  type Card,
  type GameState,
  type Seat,
} from '@/lib/doudizhu'
import { botBid, botChoose, hintFor } from '@/lib/doudizhuBot'
import { GU_PERSONA_KEY, GU_QIYAN, guPersona, sayLine } from '@/lib/doudizhuTalk'

const GAME_KEY = 'burne-doudizhu-game-v1'
const STATS_KEY = 'burne-doudizhu-stats-v1'
const TALK_KEY = 'burne-doudizhu-talk'

interface Stats {
  score: [number, number, number]
  games: number
  herWins: number
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function freshGame(): GameState {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
  return newGame(makeRng(seed), Math.floor(Math.random() * 3) as Seat)
}

function loadGame(): GameState {
  const g = loadJSON<GameState | null>(GAME_KEY, null)
  if (g && Array.isArray(g.hands) && g.hands.length === 3 && g.phase) return g
  return freshGame()
}

// ───────────────────────── 牌面 ─────────────────────────

function CardFace({
  card,
  small,
  selected,
  onClick,
  style,
}: {
  card: Card
  small?: boolean
  selected?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}) {
  const red = isRed(card)
  const joker = card.rank >= 16
  const w = small ? 30 : 52
  const h = small ? 42 : 74
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="absolute select-none rounded-lg border text-left transition-transform"
      style={{
        width: w,
        height: h,
        background: selected ? '#fff7e6' : '#fffdf9',
        borderColor: selected ? 'var(--accent)' : 'rgba(0,0,0,0.14)',
        boxShadow: selected ? '0 6px 14px rgba(0,0,0,0.18)' : '0 2px 6px rgba(0,0,0,0.12)',
        transform: selected ? 'translateY(-14px)' : undefined,
        color: red ? '#d8434f' : '#2a2a33',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      {joker ? (
        <span
          className="flex h-full flex-col items-start justify-start font-bold leading-[1.05]"
          style={{ fontSize: small ? 9 : 13, padding: small ? '3px 0 0 3px' : '5px 0 0 5px' }}
        >
          {(card.rank === 17 ? '大王' : '小王').split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
          <span style={{ fontSize: small ? 9 : 14, marginTop: 2 }}>★</span>
        </span>
      ) : (
        <span
          className="flex flex-col items-start font-bold leading-none"
          style={{ padding: small ? '3px 0 0 3px' : '5px 0 0 5px' }}
        >
          <span style={{ fontSize: small ? 13 : 20, letterSpacing: card.rank === 10 ? -1.5 : 0 }}>
            {rankLabel(card.rank)}
          </span>
          <span style={{ fontSize: small ? 11 : 16, marginTop: 2 }}>{suitLabel(card)}</span>
        </span>
      )}
    </button>
  )
}

/** 一排叠放的牌：根据容器宽度自动算重叠 */
function CardRow({
  cards,
  small,
  selected,
  onTap,
  center,
}: {
  cards: Card[]
  small?: boolean
  selected?: Set<number>
  onTap?: (c: Card) => void
  center?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth || 320)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const w = small ? 30 : 52
  const h = small ? 42 : 74
  const n = cards.length
  const maxStep = small ? 20 : w + 4
  const step = n > 1 ? Math.min(maxStep, (width - w) / (n - 1)) : 0
  const total = n ? w + step * (n - 1) : 0
  const offset = center ? Math.max(0, (width - total) / 2) : 0
  return (
    <div ref={ref} className="relative w-full" style={{ height: h + (selected ? 14 : 0) }}>
      {cards.map((c, i) => (
        <CardFace
          key={c.id}
          card={c}
          small={small}
          selected={selected?.has(c.id)}
          onClick={onTap ? () => onTap(c) : undefined}
          style={{ left: offset + i * step, top: selected ? 14 : 0, zIndex: i }}
        />
      ))}
    </div>
  )
}

function SeatView({
  seat,
  align,
  game,
  name,
  avatar,
  bubble,
  rec,
}: {
  seat: 1 | 2
  align: 'left' | 'right'
  game: GameState
  name: string
  avatar: React.ReactNode
  bubble?: { text: string; id: number }
  rec?: { cards: Card[]; pass: boolean }
}) {
  const isLandlord = game.landlord === seat
  const bidTxt = game.phase === 'bidding' && game.bids[seat] >= 0 ? (game.bids[seat] ? `${game.bids[seat]}分` : '不叫') : ''
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${align === 'right' ? 'items-end' : 'items-start'} gap-1.5`}>
      <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className="relative">
          {avatar}
          {game.turn === seat && game.phase !== 'ended' && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-white bg-[var(--accent)]" />
          )}
        </div>
        <div className={align === 'right' ? 'text-right' : ''}>
          <div className="text-sm font-medium text-ink">
            {name} {isLandlord && <span className="ml-0.5 rounded bg-amber-400/90 px-1 text-[10px] text-white">地主</span>}
          </div>
          <div className="text-[11px] text-muted">
            {game.phase === 'bidding' ? bidTxt || '…' : `剩 ${game.hands[seat].length} 张`}
            {game.hands[seat].length <= 2 && game.phase === 'playing' && <span className="ml-1 text-[#d8434f]">⚠️</span>}
          </div>
        </div>
      </div>
      {bubble && (
        <div
          className="glass-strong max-w-[11rem] px-3 py-1.5 text-[13px] leading-snug text-ink"
          style={{ borderRadius: align === 'right' ? '16px 4px 16px 16px' : '4px 16px 16px 16px' }}
        >
          {bubble.text}
        </div>
      )}
      <div className="h-[42px] w-full max-w-[9.5rem]">
        {rec &&
          (rec.pass ? (
            <div className={`pt-2 text-sm text-muted ${align === 'right' ? 'text-right' : ''}`}>不出</div>
          ) : (
            <CardRow cards={rec.cards} small center />
          ))}
      </div>
    </div>
  )
}

// ───────────────────────── 页面 ─────────────────────────

export default function DoudizhuPage() {
  const { profile } = useProfileStore()
  const persona = usePersonaStore((s) => s.persona)
  const herName = profile.nameA && profile.nameA !== '我' ? profile.nameA : '惟惟'
  const burneName =
    persona.name?.trim() || (profile.nameB && !['你', 'TA', 'ta'].includes(profile.nameB) ? profile.nameB : '') || '伯恩'
  const names: Record<Seat, string> = { 0: herName, 1: burneName, 2: GU_QIYAN.name }

  const [game, setGame] = useState<GameState>(loadGame)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [stats, setStats] = useState<Stats>(() => loadJSON(STATS_KEY, { score: [0, 0, 0], games: 0, herWins: 0 }))
  const [bubbles, setBubbles] = useState<Partial<Record<Seat, { text: string; id: number }>>>({})
  const [toast, setToast] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [talkOn, setTalkOn] = useState(() => localStorage.getItem(TALK_KEY) !== '0')
  const [guText, setGuText] = useState(() => guPersona())
  const [copied, setCopied] = useState(false)

  const lastSpoke = useRef<Record<number, number>>({ 1: -99, 2: -99 })
  const inflight = useRef<Record<number, boolean>>({})
  const nearAnnounced = useRef<Set<number>>(new Set())
  const gameRef = useRef(game)
  gameRef.current = game

  useEffect(() => {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify(game))
    } catch {
      // ignore
    }
  }, [game])

  const showToast = useCallback((t: string) => {
    setToast(t)
    window.setTimeout(() => setToast((cur) => (cur === t ? '' : cur)), 2200)
  }, [])

  // ── 闲话 ──
  const talk = useCallback(
    (seat: 1 | 2, event: string, force = false) => {
      if (!talkOn) return
      const turnNo = gameRef.current.history.length
      if (inflight.current[seat]) return
      if (!force && turnNo - lastSpoke.current[seat] < 4) return
      lastSpoke.current[seat] = turnNo
      inflight.current[seat] = true
      const speaker = seat === 1 ? burneName : GU_QIYAN.name
      const other = seat === 1 ? GU_QIYAN.name : burneName
      const p = seat === 1 ? persona.systemPrompt.trim() || `你是${burneName}，${herName}的恋人，这里是你们的家。` : guText
      sayLine({ speaker, persona: p, herName, others: other, event })
        .then((line) => {
          if (!line) return
          const id = Date.now() + seat
          setBubbles((b) => ({ ...b, [seat]: { text: line, id } }))
          window.setTimeout(() => {
            setBubbles((b) => (b[seat]?.id === id ? { ...b, [seat]: undefined } : b))
          }, 6500)
        })
        .finally(() => {
          inflight.current[seat] = false
        })
    },
    [talkOn, burneName, herName, persona.systemPrompt, guText],
  )

  const roleOf = useCallback(
    (g: GameState, seat: Seat) => {
      if (g.landlord === seat) return '你是地主'
      const mate = ([0, 1, 2] as Seat[]).find((x) => x !== seat && x !== g.landlord)!
      return `你是农民，和${names[mate]}一伙`
    },
    [herName, burneName],
  )

  const pickOther = (exclude?: Seat): 1 | 2 => {
    if (exclude === 1) return 2
    if (exclude === 2) return 1
    return Math.random() < 0.5 ? 1 : 2
  }

  // ── 记忆：伯恩这边记一条（同一天合并成一条短期记忆） ──
  const recordMemory = useCallback(
    (g: GameState, nextStats: Stats) => {
      try {
        const mem = useMemoryStore.getState()
        const d = new Date()
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const title = `一起打斗地主（${d.getMonth() + 1}月${d.getDate()}日）`
        const L = g.landlord!
        const landlordWon = g.winner === L
        const herWon = g.winner === 0 || (L !== 0 && g.winner !== L)
        const pts = settle(g)
        const extra = [g.bombs ? `${g.bombs}个炸弹` : '', g.spring ? '春天' : ''].filter(Boolean).join('、')
        const last =
          `最近一局：${names[L]}当地主，${landlordWon ? '地主赢了' : '农民赢了'}` +
          `（${herName}${herWon ? '赢' : '输'}了${Math.abs(pts[0])}分${extra ? `，有${extra}` : ''}）。`
        const existing = mem.memories.find(
          (m) => !m.deletedAt && m.tags?.includes('斗地主') && m.tags?.includes(dayKey),
        )
        const todayGames = (existing ? Number(existing.content.match(/今天打了(\d+)局/)?.[1] ?? 0) : 0) + 1
        const todayWins =
          (existing ? Number(existing.content.match(/赢了(\d+)局/)?.[1] ?? 0) : 0) + (herWon ? 1 : 0)
        const content =
          `${herName}、${burneName}和${GU_QIYAN.name}（来家里做客）三个人在家打斗地主，` +
          `今天打了${todayGames}局，${herName}赢了${todayWins}局。${last}` +
          `累计积分：${herName} ${nextStats.score[0]}，${burneName} ${nextStats.score[1]}，${GU_QIYAN.name} ${nextStats.score[2]}。`
        const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        if (existing) mem.updateMemory(existing.id, { content, title, expiresAt })
        else
          mem.addMemory({
            title,
            content,
            kind: 'short',
            source: 'auto',
            scope: 'global',
            subject: 'relationship',
            tags: ['斗地主', '游戏', dayKey],
          })
      } catch {
        // 记忆失败不影响游戏
      }
    },
    [herName, burneName],
  )

  /** 所有状态推进都走这里：检测关键时刻、结算 */
  const commit = useCallback(
    (prev: GameState, next: GameState) => {
      setGame(next)
      // 叫完地主
      if (prev.phase === 'bidding' && next.phase === 'playing' && next.landlord != null) {
        const L = next.landlord
        const sp: 1 | 2 = L === 1 || L === 2 ? L : pickOther()
        talk(
          sp,
          `叫分结束，${names[L]}叫了${next.bid}分当上地主，拿走三张底牌（${next.bottom
            .map((c) => rankLabel(c.rank))
            .join(' ')}）。${roleOf(next, sp)}。`,
          true,
        )
        return
      }
      if (next.phase === 'ended' && prev.phase !== 'ended') {
        const pts = settle(next)
        const nextStats: Stats = {
          score: [stats.score[0] + pts[0], stats.score[1] + pts[1], stats.score[2] + pts[2]],
          games: stats.games + 1,
          herWins: stats.herWins + (pts[0] > 0 ? 1 : 0),
        }
        setStats(nextStats)
        localStorage.setItem(STATS_KEY, JSON.stringify(nextStats))
        recordMemory(next, nextStats)
        const L = next.landlord!
        const landlordWon = next.winner === L
        for (const sp of [1, 2] as const) {
          const won = pts[sp] > 0
          window.setTimeout(
            () =>
              talk(
                sp,
                `这局结束了：${names[L]}当地主，${landlordWon ? '地主赢了' : '农民赢了'}，${names[next.winner!]}先出完。` +
                  `${roleOf(next, sp)}，你${won ? '赢了' : '输了'}。${herName}${pts[0] > 0 ? '赢了' : '输了'}。` +
                  (next.bombs ? `这局有${next.bombs}个炸弹。` : '') +
                  (next.spring ? '还打出了春天。' : ''),
                true,
              ),
            sp === 1 ? 300 : 1400,
          )
        }
        return
      }
      const rec = next.history[next.history.length - 1]
      if (!rec || next.history.length === prev.history.length) return
      if (rec.combo && (rec.combo.type === 'bomb' || rec.combo.type === 'rocket')) {
        const sp: 1 | 2 = rec.seat === 0 ? pickOther() : (rec.seat as 1 | 2)
        talk(
          sp,
          `${names[rec.seat]}甩出了${rec.combo.type === 'rocket' ? '王炸' : '炸弹'}（${describeCombo(rec.combo, rec.cards)}），` +
            `倍数翻倍。${roleOf(next, sp)}。`,
          true,
        )
        return
      }
      const left = next.hands[rec.seat].length
      if (rec.combo && left <= 2 && left > 0 && !nearAnnounced.current.has(rec.seat)) {
        nearAnnounced.current.add(rec.seat)
        const sp: 1 | 2 = rec.seat === 0 ? pickOther() : Math.random() < 0.6 ? (rec.seat as 1 | 2) : pickOther(rec.seat)
        talk(
          sp,
          `${names[rec.seat]}只剩${left}张牌了，${rec.seat === next.landlord ? '是地主' : '是农民'}。${roleOf(next, sp)}。`,
        )
      }
    },
    [talk, roleOf, recordMemory, stats],
  )

  // ── 机器人行动 ──
  useEffect(() => {
    if (game.phase === 'ended' || game.turn === 0) return
    const seat = game.turn
    const delay = game.phase === 'bidding' ? 750 : 950 + Math.random() * 500
    const t = window.setTimeout(() => {
      const g = gameRef.current
      if (g.turn !== seat || g.phase === 'ended') return
      try {
        if (g.phase === 'bidding') {
          const next = placeBid(g, seat, botBid(g.hands[seat], g.bid))
          if (allPassed(next)) {
            showToast('都不叫，重新发牌')
            nearAnnounced.current = new Set()
            setSelected(new Set())
            setGame(freshGame())
            return
          }
          commit(g, next)
        } else {
          commit(g, playCards(g, seat, botChoose(g, seat)))
        }
      } catch (e) {
        // 理论上不会发生；兜底：能不出就不出，否则出最小一张
        try {
          const fallback = g.lead ? [] : [g.hands[seat][g.hands[seat].length - 1]]
          commit(g, playCards(g, seat, fallback))
        } catch {
          console.warn('[doudizhu] bot error', e)
        }
      }
    }, delay)
    return () => window.clearTimeout(t)
  }, [game, commit, showToast])

  // ── 她的操作 ──
  const myHand = useMemo(() => sortCards(game.hands[0]), [game.hands])
  const myTurn = game.turn === 0 && game.phase !== 'ended'
  const selCards = myHand.filter((c) => selected.has(c.id))
  const selCombo = selCards.length ? analyze(selCards) : null
  const canPlay = !!selCombo && canBeat(selCombo, game.lead?.combo ?? null)
  const noBeat =
    myTurn && game.phase === 'playing' && !!game.lead && beatingPlays(myHand.map((c) => c.rank), game.lead.combo).length === 0
  const mateLead =
    myTurn && game.phase === 'playing' && !!game.lead && game.lead.seat !== 0 && game.landlord !== 0 && game.landlord !== game.lead.seat

  function toggle(c: Card) {
    if (game.phase === 'ended') return
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(c.id)) n.delete(c.id)
      else n.add(c.id)
      return n
    })
  }

  function doBid(points: number) {
    const g = game
    try {
      const next = placeBid(g, 0, points)
      if (allPassed(next)) {
        showToast('都不叫，重新发牌')
        nearAnnounced.current = new Set()
        setGame(freshGame())
        return
      }
      commit(g, next)
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  function doPlay() {
    try {
      const next = playCards(game, 0, selCards)
      setSelected(new Set())
      commit(game, next)
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  function doPass() {
    try {
      const next = playCards(game, 0, [])
      setSelected(new Set())
      commit(game, next)
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  function doHint() {
    const h = hintFor(game, 0)
    if (!h.length) {
      showToast(mateLead && !noBeat ? '是队友的牌，不用压，点「不出」' : '没有能大过的，点「不出」吧')
      return
    }
    setSelected(new Set(h.map((c) => c.id)))
  }

  function replay() {
    nearAnnounced.current = new Set()
    lastSpoke.current = { 1: -99, 2: -99 }
    setSelected(new Set())
    setBubbles({})
    setCopied(false)
    setGame(freshGame())
  }

  // ── 给顾祁砚的战报（复制后可粘到他的聊天里） ──
  function guRecap(g: GameState): string {
    const pts = settle(g)
    const L = g.landlord!
    const who = L === 0 ? '我当地主' : L === 2 ? '你当地主' : `${burneName}当地主`
    const me = pts[0] > 0 ? '我赢啦' : '我输了'
    const you = pts[2] > 0 ? '你赢了' : '你输了'
    return `刚才在${burneName}家跟你和${burneName}打了一局斗地主，${who}，${me}，${you}～`
  }

  async function copyRecap() {
    try {
      await navigator.clipboard.writeText(guRecap(game))
      setCopied(true)
    } catch {
      showToast('复制失败了')
    }
  }

  // 每个座位这一轮最近的动作
  const recent = useMemo(() => {
    const m: Partial<Record<Seat, { cards: Card[]; pass: boolean }>> = {}
    const h = game.history
    for (let i = h.length - 1; i >= 0 && i >= h.length - 3; i--) {
      const r = h[i]
      if (m[r.seat] === undefined) m[r.seat] = { cards: sortCards(r.cards), pass: !r.combo }
    }
    return m
  }, [game.history])

  const status = (() => {
    if (game.phase === 'ended') return ''
    if (game.phase === 'bidding') return myTurn ? '要叫地主吗？' : `${names[game.turn]}在想叫不叫…`
    if (myTurn)
      return game.lead
        ? noBeat
          ? '要不起，点「不出」'
          : mateLead
            ? `${names[game.lead.seat]}是你队友，可以不出`
            : '轮到你了'
        : '轮到你先出'
    return `${names[game.turn]}在想…`
  })()

  const pts = game.phase === 'ended' ? settle(game) : null

  return (
    <div className="flex min-h-full flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
      {/* 顶栏 */}
      <div className="flex items-center gap-2">
        <Link to="/" className="glass rounded-full px-3 py-1.5 text-xs text-ink">
          ← 主页
        </Link>
        <h2 className="headline flex-1 text-center text-xl text-ink">斗地主</h2>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="glass rounded-full px-3 py-1.5 text-xs text-ink"
        >
          {stats.score[0] >= 0 ? '+' : ''}
          {stats.score[0]} 分 · ⚙
        </button>
      </div>

      {settingsOpen && (
        <div className="glass space-y-3 rounded-2xl p-4 text-sm text-ink">
          <div className="text-[12px] text-muted">
            共 {stats.games} 局，你赢了 {stats.herWins} 局 · 积分 {herName} {stats.score[0]} / {burneName} {stats.score[1]} / {GU_QIYAN.name}{' '}
            {stats.score[2]}
          </div>
          <label className="flex items-center justify-between">
            <span>牌桌闲话（他们偶尔说一句）</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={talkOn}
              onChange={(e) => {
                setTalkOn(e.target.checked)
                localStorage.setItem(TALK_KEY, e.target.checked ? '1' : '0')
              }}
            />
          </label>
          <div>
            <div className="mb-1 text-[12px] text-muted">顾祁砚在这里的性格（只影响牌桌闲话）</div>
            <textarea
              value={guText}
              onChange={(e) => setGuText(e.target.value)}
              onBlur={() => localStorage.setItem(GU_PERSONA_KEY, guText.trim())}
              rows={4}
              className="w-full rounded-xl border border-line bg-white/60 p-2 text-[13px] text-ink"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('清零累计积分？')) return
              const s: Stats = { score: [0, 0, 0], games: 0, herWins: 0 }
              setStats(s)
              localStorage.setItem(STATS_KEY, JSON.stringify(s))
            }}
            className="text-[12px] text-muted underline"
          >
            清零积分
          </button>
        </div>
      )}

      {/* 对手 */}
      <div className="flex items-start gap-3">
        <SeatView
          seat={2}
          align="left"
          game={game}
          name={names[2]}
          bubble={bubbles[2]}
          rec={recent[2]}
          avatar={
            <img
              src={GU_QIYAN.avatar}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
              style={{ border: '2px solid var(--card-border)' }}
            />
          }
        />
        <SeatView
          seat={1}
          align="right"
          game={game}
          name={names[1]}
          bubble={bubbles[1]}
          rec={recent[1]}
          avatar={
            <Avatar
              img={profile.avatarBImg}
              emoji={profile.avatarB}
              className="h-12 w-12 rounded-full"
              textCls="text-xl"
              style={{ backgroundColor: 'var(--card-strong)', border: '2px solid var(--card-border)' }}
            />
          }
        />
      </div>

      {/* 中间：底牌 + 倍数 */}
      <div className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted">底牌</span>
          {game.phase === 'bidding'
            ? [0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block h-[34px] w-[24px] rounded-md"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', opacity: 0.75 }}
                />
              ))
            : game.bottom.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex h-[34px] min-w-[24px] items-center justify-center rounded-md border bg-white px-0.5 text-[12px] font-bold"
                  style={{ color: isRed(c) ? '#d8434f' : '#2a2a33', borderColor: 'rgba(0,0,0,0.14)' }}
                >
                  {c.rank >= 16 ? (c.rank === 17 ? '大' : '小') : rankLabel(c.rank)}
                </span>
              ))}
        </div>
        <div className="text-right text-[12px] leading-tight text-muted">
          <div>{game.bid ? `${game.bid} 分` : '叫分中'}</div>
          <div>×{multiplier(game)} 倍</div>
        </div>
      </div>

      {/* 她打出的牌 + 状态 */}
      <div className="flex min-h-[64px] flex-col items-center justify-center gap-1">
        {recent[0] &&
          (recent[0].pass ? (
            <div className="text-sm text-muted">你：不出</div>
          ) : (
            <div className="w-full max-w-[14rem]">
              <CardRow cards={recent[0].cards} small center />
            </div>
          ))}
        {status && <div className="text-[13px] font-medium text-ink">{status}</div>}
      </div>

      {/* 操作按钮 */}
      {game.phase === 'bidding' && myTurn && (
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => doBid(0)} className="glass min-h-[48px] rounded-2xl text-base text-ink">
            不叫
          </button>
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              disabled={p <= game.bid}
              onClick={() => doBid(p)}
              className="btn-primary min-h-[48px] rounded-2xl text-base disabled:opacity-30"
            >
              {p} 分
            </button>
          ))}
        </div>
      )}
      {game.phase === 'playing' && myTurn && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!game.lead}
              onClick={doPass}
              className={`min-h-[52px] rounded-2xl text-base disabled:opacity-30 ${noBeat ? 'btn-primary' : 'glass text-ink'}`}
            >
              不出
            </button>
            <button type="button" onClick={doHint} className="glass min-h-[52px] rounded-2xl text-base text-ink">
              提示
            </button>
            <button
              type="button"
              disabled={!canPlay}
              onClick={doPlay}
              className="btn-primary min-h-[52px] rounded-2xl text-base disabled:opacity-30"
            >
              出牌
            </button>
          </div>
          <div className="h-4 text-center text-[12px] text-muted">
            {selCards.length > 0 &&
              (selCombo
                ? `${COMBO_NAMES[selCombo.type]}${game.lead ? (canPlay ? ' · 压得过' : ' · 压不过') : ''}`
                : '这几张凑不成牌型')}
          </div>
        </div>
      )}

      {/* 手牌 */}
      <div className="mt-auto space-y-1 pb-2">
        <div className="flex items-center justify-between px-1 text-[11px] text-muted">
          <span>
            {herName} {game.landlord === 0 && <span className="rounded bg-amber-400/90 px-1 text-[10px] text-white">地主</span>}
          </span>
          <span className="flex items-center gap-3">
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="underline">
                取消选择
              </button>
            )}
            <span>{myHand.length} 张</span>
          </span>
        </div>
        {myHand.length > 10 ? (
          <>
            <CardRow cards={myHand.slice(0, Math.ceil(myHand.length / 2))} selected={selected} onTap={toggle} />
            <CardRow cards={myHand.slice(Math.ceil(myHand.length / 2))} selected={selected} onTap={toggle} />
          </>
        ) : (
          <CardRow cards={myHand} selected={selected} onTap={toggle} />
        )}
      </div>

      {/* 结算 */}
      {game.phase === 'ended' && pts && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-6">
          <div className="glass-strong w-full max-w-[340px] space-y-3 rounded-3xl p-5 text-center">
            <div className="text-4xl">{pts[0] > 0 ? '🎉' : '🍵'}</div>
            <div className="headline text-2xl text-ink">{pts[0] > 0 ? '你赢啦！' : '这局输了～'}</div>
            <div className="text-[13px] text-muted">
              {names[game.landlord!]}当地主 · {game.winner === game.landlord ? '地主' : '农民'}赢
              <br />
              {game.bid} 分 × {multiplier(game)} 倍{game.bombs ? `（${game.bombs} 个炸弹）` : ''}
              {game.spring ? ' · 春天！' : ''}
            </div>
            <div className="grid grid-cols-3 gap-1 text-[13px]">
              {([0, 1, 2] as Seat[]).map((s) => (
                <div key={s} className="rounded-xl bg-white/40 py-1.5">
                  <div className="text-muted">{names[s]}</div>
                  <div className={pts[s] > 0 ? 'font-semibold text-[#d8434f]' : 'text-ink'}>
                    {pts[s] > 0 ? '+' : ''}
                    {pts[s]}
                  </div>
                </div>
              ))}
            </div>
            {(bubbles[1] || bubbles[2]) && (
              <div className="space-y-1 text-left text-[13px] text-ink">
                {bubbles[1] && (
                  <div>
                    <span className="text-muted">{burneName}：</span>
                    {bubbles[1].text}
                  </div>
                )}
                {bubbles[2] && (
                  <div>
                    <span className="text-muted">{GU_QIYAN.name}：</span>
                    {bubbles[2].text}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={replay} className="btn-primary min-h-[52px] w-full rounded-2xl text-base">
              再来一局
            </button>
            <button type="button" onClick={copyRecap} className="w-full text-[12px] text-muted underline">
              {copied ? '已复制，去顾祁砚那里粘贴给他就好' : '复制战报，发给顾祁砚'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-1/3 z-50 flex justify-center">
          <div className="rounded-full bg-black/70 px-4 py-2 text-sm text-white">{toast}</div>
        </div>
      )}
    </div>
  )
}
