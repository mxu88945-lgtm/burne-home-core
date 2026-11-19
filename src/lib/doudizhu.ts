/**
 * 斗地主 · 纯规则引擎（不碰 React、不碰模型）。
 *
 * 牌面点数 rank：3..10、J=11、Q=12、K=13、A=14、2=15、小王=16、大王=17。
 * 牌 id 0..53：0..51 是四种花色 × 13 个点数，52 小王，53 大王。
 * 一切出牌合法性、比大小、计分都在这里，确定性、可测试。
 */

export type Rank = number

export interface Card {
  id: number
  rank: Rank
  /** 0♠ 1♥ 2♣ 3♦；王为 -1 */
  suit: number
}

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple1'
  | 'triple2'
  | 'straight'
  | 'pairStraight'
  | 'plane'
  | 'plane1'
  | 'plane2'
  | 'four2'
  | 'four22'
  | 'bomb'
  | 'rocket'

export interface Combo {
  type: ComboType
  /** 比较用的主点数：单/对/三/炸弹=该点数；顺子/连对/飞机=最高那组的点数 */
  main: Rank
  /** 顺子张数、连对对数、飞机组数；其余为 1 */
  len: number
  /** 牌数 */
  size: number
}

export const COMBO_NAMES: Record<ComboType, string> = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  triple1: '三带一',
  triple2: '三带二',
  straight: '顺子',
  pairStraight: '连对',
  plane: '飞机',
  plane1: '飞机带翅膀',
  plane2: '飞机带翅膀',
  four2: '四带二',
  four22: '四带两对',
  bomb: '炸弹',
  rocket: '王炸',
}

const SUITS = ['♠', '♥', '♣', '♦']

export function rankLabel(rank: Rank): string {
  if (rank <= 10) return String(rank)
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' } as Record<number, string>)[rank] ?? '?'
}

export function suitLabel(card: Card): string {
  return card.suit >= 0 ? SUITS[card.suit] : ''
}

export function isRed(card: Card): boolean {
  return card.suit === 1 || card.suit === 3 || card.rank === 17
}

export function cardFromId(id: number): Card {
  if (id === 52) return { id, rank: 16, suit: -1 }
  if (id === 53) return { id, rank: 17, suit: -1 }
  return { id, rank: (id % 13) + 3, suit: Math.floor(id / 13) }
}

export function fullDeck(): Card[] {
  return Array.from({ length: 54 }, (_, i) => cardFromId(i))
}

/** 小而稳定的伪随机（mulberry32），测试可复现 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 从大到小排（手牌显示用：大王在左） */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit)
}

export function countRanks(ranks: Rank[]): Map<Rank, number> {
  const m = new Map<Rank, number>()
  for (const r of ranks) m.set(r, (m.get(r) ?? 0) + 1)
  return m
}

function isConsecutive(sorted: Rank[]): boolean {
  for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return false
  return true
}

/** 识别一手牌的牌型；不合法返回 null */
export function analyze(input: Array<Rank | Card>): Combo | null {
  const ranks = input.map((x) => (typeof x === 'number' ? x : x.rank))
  const n = ranks.length
  if (n === 0) return null
  const cnt = countRanks(ranks)
  const keys = [...cnt.keys()].sort((a, b) => a - b)
  const counts = keys.map((k) => cnt.get(k)!)
  const mk = (type: ComboType, main: Rank, len = 1): Combo => ({ type, main, len, size: n })

  if (n === 1) return mk('single', ranks[0])
  if (n === 2) {
    if (cnt.has(16) && cnt.has(17)) return mk('rocket', 17)
    return keys.length === 1 ? mk('pair', keys[0]) : null
  }
  if (n === 3) return keys.length === 1 ? mk('triple', keys[0]) : null
  if (n === 4) {
    if (keys.length === 1) return mk('bomb', keys[0])
    if (keys.length === 2) {
      const t = keys.find((k) => cnt.get(k) === 3)
      if (t != null) return mk('triple1', t)
    }
    return null
  }
  if (n === 5 && keys.length === 2) {
    const t = keys.find((k) => cnt.get(k) === 3)
    const p = keys.find((k) => cnt.get(k) === 2)
    if (t != null && p != null) return mk('triple2', t)
  }
  // 顺子：≥5 张单牌连续，最大到 A
  if (n >= 5 && counts.every((c) => c === 1) && keys[keys.length - 1] <= 14 && isConsecutive(keys)) {
    return mk('straight', keys[keys.length - 1], n)
  }
  // 连对：≥3 对连续，最大到 A
  if (n >= 6 && n % 2 === 0 && counts.every((c) => c === 2) && keys[keys.length - 1] <= 14 && isConsecutive(keys)) {
    return mk('pairStraight', keys[keys.length - 1], n / 2)
  }
  // 飞机（含带翅膀）：优先识别为组数最多的纯飞机，其次带单、带对
  const plane = analyzePlane(cnt, n)
  if (plane) return plane
  // 四带二 / 四带两对
  if (n === 6 || n === 8) {
    const quad = keys.filter((k) => cnt.get(k) === 4)
    for (const q of quad.sort((a, b) => b - a)) {
      const rest = new Map(cnt)
      rest.delete(q)
      const restCounts = [...rest.values()]
      if (n === 6) {
        // 带的两张不能是一对王（那是王炸）
        if (!(rest.has(16) && rest.has(17))) return mk('four2', q)
      } else if (restCounts.length === 2 && restCounts.every((c) => c === 2)) {
        return mk('four22', q)
      }
    }
  }
  return null
}

function analyzePlane(cnt: Map<Rank, number>, n: number): Combo | null {
  // 可做飞机主体的点数：≥3 张、≤A
  const tripleRanks = [...cnt.keys()].filter((k) => (cnt.get(k) ?? 0) >= 3 && k <= 14).sort((a, b) => a - b)
  if (tripleRanks.length < 2) return null
  const tries: Array<{ k: number; type: ComboType }> = []
  for (let k = tripleRanks.length; k >= 2; k--) {
    if (3 * k === n) tries.push({ k, type: 'plane' })
    if (4 * k === n) tries.push({ k, type: 'plane1' })
    if (5 * k === n) tries.push({ k, type: 'plane2' })
  }
  for (const { k, type } of tries) {
    // 从最高的起点往下找，取最大的可行主体
    for (let top = 14; top - k + 1 >= 3; top--) {
      let ok = true
      for (let r = top - k + 1; r <= top; r++) if ((cnt.get(r) ?? 0) < 3) ok = false
      if (!ok) continue
      const rest = new Map(cnt)
      for (let r = top - k + 1; r <= top; r++) {
        const left = rest.get(r)! - 3
        if (left) rest.set(r, left)
        else rest.delete(r)
      }
      const restTotal = [...rest.values()].reduce((s, c) => s + c, 0)
      if (type === 'plane' && restTotal === 0) return { type, main: top, len: k, size: n }
      if (type === 'plane1' && restTotal === k && !(rest.has(16) && rest.has(17))) {
        return { type, main: top, len: k, size: n }
      }
      if (type === 'plane2') {
        const pairs = [...rest.values()].reduce((s, c) => s + (c % 2 === 0 ? c / 2 : -999), 0)
        if (pairs === k) return { type, main: top, len: k, size: n }
      }
    }
  }
  return null
}

/** a 能否压过 b（b 为 null 表示自由出牌，任何合法牌型都行） */
export function canBeat(a: Combo, b: Combo | null): boolean {
  if (!b) return true
  if (a.type === 'rocket') return true
  if (b.type === 'rocket') return false
  if (a.type === 'bomb' && b.type !== 'bomb') return true
  if (a.type === 'bomb' && b.type === 'bomb') return a.main > b.main
  return a.type === b.type && a.len === b.len && a.size === b.size && a.main > b.main
}

// ───────────────────────── 从手牌里找出所有能出的牌 ─────────────────────────

/** 一个候选出法，用点数列表表示（具体哪张花色由 pickCards 决定） */
export type RankPlay = Rank[]

function rep(r: Rank, k: number): Rank[] {
  return Array(k).fill(r)
}

/** 挑带牌：优先用孤张/小牌，不拆炸弹、尽量不拆王和 2 */
function pickKickers(cnt: Map<Rank, number>, exclude: Set<Rank>, k: number, pair: boolean): Rank[] | null {
  const cand = [...cnt.keys()]
    .filter((r) => !exclude.has(r) && (cnt.get(r) ?? 0) >= (pair ? 2 : 1))
    .filter((r) => (cnt.get(r) ?? 0) < 4)
    .sort((a, b) => {
      const ca = cnt.get(a)!, cb = cnt.get(b)!
      const wa = (pair ? (ca === 2 ? 0 : 1) : ca === 1 ? 0 : ca === 2 ? 1 : 2) + (a >= 15 ? 3 : 0)
      const wb = (pair ? (cb === 2 ? 0 : 1) : cb === 1 ? 0 : cb === 2 ? 1 : 2) + (b >= 15 ? 3 : 0)
      return wa - wb || a - b
    })
  const out: Rank[] = []
  // 带单时不允许把两张王一起带（会被当成王炸）
  for (const r of cand) {
    if (out.length >= (pair ? 2 * k : k)) break
    if (!pair && (r === 16 || r === 17) && out.some((x) => x === 16 || x === 17)) continue
    out.push(...rep(r, pair ? 2 : 1))
  }
  return out.length === (pair ? 2 * k : k) ? out : null
}

/** 列出手牌里所有（有代表性的）合法出法；按牌型分组，不含四带二 */
export function enumeratePlays(hand: Rank[]): RankPlay[] {
  const cnt = countRanks(hand)
  const keys = [...cnt.keys()].sort((a, b) => a - b)
  const plays: RankPlay[] = []
  for (const r of keys) plays.push([r])
  for (const r of keys) if (cnt.get(r)! >= 2) plays.push(rep(r, 2))
  for (const r of keys) {
    if (cnt.get(r)! >= 3) {
      plays.push(rep(r, 3))
      const ex = new Set([r])
      const k1 = pickKickers(cnt, ex, 1, false)
      if (k1) plays.push([...rep(r, 3), ...k1])
      const k2 = pickKickers(cnt, ex, 1, true)
      if (k2) plays.push([...rep(r, 3), ...k2])
    }
  }
  // 顺子
  for (let start = 3; start <= 10; start++) {
    for (let end = start + 4; end <= 14; end++) {
      let ok = true
      for (let r = start; r <= end; r++) if (!cnt.get(r)) ok = false
      if (!ok) break
      const p: Rank[] = []
      for (let r = start; r <= end; r++) p.push(r)
      plays.push(p)
    }
  }
  // 连对
  for (let start = 3; start <= 12; start++) {
    for (let end = start + 2; end <= 14; end++) {
      let ok = true
      for (let r = start; r <= end; r++) if ((cnt.get(r) ?? 0) < 2) ok = false
      if (!ok) break
      const p: Rank[] = []
      for (let r = start; r <= end; r++) p.push(r, r)
      plays.push(p)
    }
  }
  // 飞机
  for (let start = 3; start <= 13; start++) {
    for (let end = start + 1; end <= 14; end++) {
      let ok = true
      for (let r = start; r <= end; r++) if ((cnt.get(r) ?? 0) < 3) ok = false
      if (!ok) break
      const body: Rank[] = []
      const ex = new Set<Rank>()
      for (let r = start; r <= end; r++) {
        body.push(r, r, r)
        ex.add(r)
      }
      const k = end - start + 1
      plays.push(body)
      const w1 = pickKickers(cnt, ex, k, false)
      if (w1) plays.push([...body, ...w1])
      const w2 = pickKickers(cnt, ex, k, true)
      if (w2) plays.push([...body, ...w2])
    }
  }
  for (const r of keys) if (cnt.get(r) === 4) plays.push(rep(r, 4))
  if (cnt.has(16) && cnt.has(17)) plays.push([16, 17])
  // 只保留能被 analyze 正确识别的（防止带牌后牌型变味）
  return plays.filter((p) => analyze(p) != null)
}

/** 手牌里能压过 target 的所有出法 */
export function beatingPlays(hand: Rank[], target: Combo | null): RankPlay[] {
  return enumeratePlays(hand).filter((p) => canBeat(analyze(p)!, target))
}

/** 把点数出法落到具体的牌上（同点数里先出花色靠后的，顺序稳定） */
export function pickCards(hand: Card[], play: RankPlay): Card[] | null {
  const pool = [...hand].sort((a, b) => b.suit - a.suit)
  const out: Card[] = []
  for (const r of play) {
    const i = pool.findIndex((c) => c.rank === r)
    if (i < 0) return null
    out.push(pool[i])
    pool.splice(i, 1)
  }
  return out
}

/**
 * 粗估：把这手牌全部出完大概要几手（越少越好）。
 * 王炸/炸弹各一手，先抽长顺子，三张吃掉孤张或对子当带牌，剩下的对子、单张各一手。
 */
export function estimateMoves(hand: Rank[]): number {
  const cnt = countRanks(hand)
  let moves = 0
  if (cnt.has(16) && cnt.has(17)) {
    moves++
    cnt.delete(16)
    cnt.delete(17)
  }
  for (const [r, c] of [...cnt]) {
    if (c === 4) {
      moves++
      cnt.delete(r)
    }
  }
  // 顺子：只在能减少单张时抽
  for (let start = 3; start <= 10; start++) {
    let end = start - 1
    while (end + 1 <= 14 && (cnt.get(end + 1) ?? 0) >= 1) end++
    if (end - start + 1 >= 5) {
      let singles = 0
      for (let r = start; r <= end; r++) if (cnt.get(r) === 1) singles++
      if (singles >= 3) {
        moves++
        for (let r = start; r <= end; r++) {
          const left = cnt.get(r)! - 1
          if (left) cnt.set(r, left)
          else cnt.delete(r)
        }
      }
    }
  }
  let triples = 0, pairs = 0, singles = 0, lowSingles = 0
  for (const [r, c] of cnt) {
    if (c === 3) triples++
    else if (c === 2) pairs++
    else if (c === 1) {
      singles++
      if (r < 14) lowSingles++
    }
  }
  moves += triples + Math.max(0, singles + pairs - triples)
  // 小单张更难走，稍微加点权
  return moves + lowSingles * 0.2
}

// ───────────────────────── 一局的状态机 ─────────────────────────

export type Seat = 0 | 1 | 2
export const NEXT: Record<Seat, Seat> = { 0: 1, 1: 2, 2: 0 }

export interface PlayRecord {
  seat: Seat
  cards: Card[]
  combo: Combo | null // null = 不出
}

export interface GameState {
  phase: 'bidding' | 'playing' | 'ended'
  hands: [Card[], Card[], Card[]]
  bottom: Card[]
  /** 叫分：每人一次机会；-1 未表态，0 不叫，1..3 分 */
  bids: [number, number, number]
  bidStarter: Seat
  bid: number
  landlord: Seat | null
  turn: Seat
  /** 当前桌面上要压的那手牌（自由出牌时为 null） */
  lead: { seat: Seat; cards: Card[]; combo: Combo } | null
  passes: number
  bombs: number
  playsBySeat: [number, number, number]
  history: PlayRecord[]
  winner: Seat | null
  spring: boolean
}

export function newGame(rng: () => number, bidStarter: Seat = 0): GameState {
  const deck = shuffle(fullDeck(), rng)
  return {
    phase: 'bidding',
    hands: [sortCards(deck.slice(0, 17)), sortCards(deck.slice(17, 34)), sortCards(deck.slice(34, 51))],
    bottom: sortCards(deck.slice(51)),
    bids: [-1, -1, -1],
    bidStarter,
    bid: 0,
    landlord: null,
    turn: bidStarter,
    lead: null,
    passes: 0,
    bombs: 0,
    playsBySeat: [0, 0, 0],
    history: [],
    winner: null,
    spring: false,
  }
}

/** 叫分。points=0 表示不叫。返回新状态；若三人都不叫，phase 仍为 bidding 且 landlord=null、bids 全部 ≥0 → 需要重发 */
export function placeBid(s: GameState, seat: Seat, points: number): GameState {
  if (s.phase !== 'bidding' || s.turn !== seat) throw new Error('还没轮到叫分')
  if (points !== 0 && (points <= s.bid || points > 3)) throw new Error('叫分要比当前高')
  const bids = [...s.bids] as GameState['bids']
  bids[seat] = points
  let next: GameState = { ...s, bids, bid: Math.max(s.bid, points), turn: NEXT[seat] }
  const allDone = bids.every((b) => b >= 0)
  if (points === 3 || allDone) {
    if (next.bid === 0) return { ...next, turn: s.bidStarter } // 都不叫：由调用方重发
    // 叫分最高者当地主
    let landlord: Seat = 0
    let best = -1
    for (const seatI of [0, 1, 2] as Seat[]) if (bids[seatI] > best) { best = bids[seatI]; landlord = seatI }
    const hands = [...next.hands] as GameState['hands']
    hands[landlord] = sortCards([...hands[landlord], ...next.bottom])
    next = { ...next, hands, landlord, phase: 'playing', turn: landlord, lead: null, passes: 0 }
  }
  return next
}

export function allPassed(s: GameState): boolean {
  return s.phase === 'bidding' && s.bids.every((b) => b === 0)
}

export function isTeammate(s: GameState, a: Seat, b: Seat): boolean {
  if (a === b) return true
  return a !== s.landlord && b !== s.landlord
}

/** 出牌（cards 为空数组 = 不出）。非法时抛错，错误信息给人看。 */
export function playCards(s: GameState, seat: Seat, cards: Card[]): GameState {
  if (s.phase !== 'playing' || s.turn !== seat) throw new Error('还没轮到你')
  if (cards.length === 0) {
    if (!s.lead) throw new Error('现在该你先出，不能不出')
    const passes = s.passes + 1
    const history = [...s.history, { seat, cards: [], combo: null }]
    if (passes >= 2) {
      // 两家都不要：回到上一手出牌的人自由出
      return { ...s, history, passes: 0, lead: null, turn: s.lead.seat }
    }
    return { ...s, history, passes, turn: NEXT[seat] }
  }
  const hand = s.hands[seat]
  const ids = new Set(cards.map((c) => c.id))
  if (ids.size !== cards.length || cards.some((c) => !hand.some((h) => h.id === c.id))) {
    throw new Error('这些牌不在手里')
  }
  const combo = analyze(cards)
  if (!combo) throw new Error('这不是一手合法的牌')
  if (!canBeat(combo, s.lead?.combo ?? null)) throw new Error(s.lead ? '压不过上家' : '这手牌不合法')
  const hands = [...s.hands] as GameState['hands']
  hands[seat] = hand.filter((c) => !ids.has(c.id))
  const playsBySeat = [...s.playsBySeat] as GameState['playsBySeat']
  playsBySeat[seat]++
  const bombs = s.bombs + (combo.type === 'bomb' || combo.type === 'rocket' ? 1 : 0)
  const next: GameState = {
    ...s,
    hands,
    playsBySeat,
    bombs,
    lead: { seat, cards, combo },
    passes: 0,
    turn: NEXT[seat],
    history: [...s.history, { seat, cards, combo }],
  }
  if (hands[seat].length === 0) {
    const L = s.landlord!
    const landlordWins = seat === L
    const farmers = ([0, 1, 2] as Seat[]).filter((x) => x !== L)
    const spring = landlordWins
      ? farmers.every((f) => playsBySeat[f] === 0)
      : playsBySeat[L] === 1
    return { ...next, phase: 'ended', winner: seat, spring }
  }
  return next
}

/** 本局倍数：叫分 × 2^(炸弹+王炸) × 春天 2 */
export function multiplier(s: GameState): number {
  return 2 ** s.bombs * (s.spring ? 2 : 1)
}

/** 每个座位本局得分（地主 ±2 份，农民各 ∓1 份） */
export function settle(s: GameState): [number, number, number] {
  if (s.phase !== 'ended' || s.landlord == null || s.winner == null) return [0, 0, 0]
  const unit = Math.max(1, s.bid) * multiplier(s)
  const landlordWins = s.winner === s.landlord
  const out: [number, number, number] = [0, 0, 0]
  for (const seat of [0, 1, 2] as Seat[]) {
    if (seat === s.landlord) out[seat] = landlordWins ? 2 * unit : -2 * unit
    else out[seat] = landlordWins ? -unit : unit
  }
  return out
}

export function describeCombo(c: Combo | null, cards: Card[]): string {
  if (!c) return '不出'
  const ranks = [...cards].sort((a, b) => a.rank - b.rank).map((x) => rankLabel(x.rank))
  return `${COMBO_NAMES[c.type]} ${ranks.join(' ')}`
}
