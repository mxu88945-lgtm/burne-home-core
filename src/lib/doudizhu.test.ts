import { describe, expect, it } from 'vitest'
import {
  analyze,
  canBeat,
  enumeratePlays,
  fullDeck,
  makeRng,
  newGame,
  placeBid,
  playCards,
  settle,
  allPassed,
  type Combo,
  type GameState,
  type Seat,
} from './doudizhu'
import { botBid, botChoose, hintFor } from './doudizhuBot'

const J = 11, Q = 12, K = 13, A = 14, TWO = 15, SJ = 16, BJ = 17
const t = (r: number[]) => analyze(r)?.type ?? null

describe('牌型识别', () => {
  it('基础牌型', () => {
    expect(t([5])).toBe('single')
    expect(t([5, 5])).toBe('pair')
    expect(t([5, 6])).toBe(null)
    expect(t([7, 7, 7])).toBe('triple')
    expect(t([7, 7, 7, 3])).toBe('triple1')
    expect(t([7, 7, 7, 3, 3])).toBe('triple2')
    expect(t([7, 7, 7, 3, 4])).toBe(null)
    expect(t([9, 9, 9, 9])).toBe('bomb')
    expect(t([SJ, BJ])).toBe('rocket')
  })

  it('顺子', () => {
    expect(analyze([3, 4, 5, 6, 7])).toMatchObject({ type: 'straight', main: 7, len: 5 })
    expect(analyze([10, J, Q, K, A])).toMatchObject({ type: 'straight', main: A })
    expect(t([J, Q, K, A, TWO])).toBe(null) // 2 不能进顺子
    expect(t([3, 4, 5, 6])).toBe(null)
    expect(t([3, 4, 5, 6, 8])).toBe(null)
    expect(t([3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A])).toBe('straight')
  })

  it('连对', () => {
    expect(analyze([3, 3, 4, 4, 5, 5])).toMatchObject({ type: 'pairStraight', main: 5, len: 3 })
    expect(t([3, 3, 4, 4])).toBe(null)
    expect(t([K, K, A, A, TWO, TWO])).toBe(null)
  })

  it('飞机和翅膀', () => {
    expect(analyze([3, 3, 3, 4, 4, 4])).toMatchObject({ type: 'plane', main: 4, len: 2 })
    expect(analyze([3, 3, 3, 4, 4, 4, 9, J])).toMatchObject({ type: 'plane1', main: 4, len: 2 })
    expect(analyze([3, 3, 3, 4, 4, 4, 9, 9, J, J])).toMatchObject({ type: 'plane2', main: 4, len: 2 })
    expect(t([3, 3, 3, 5, 5, 5])).toBe(null) // 不连续
    expect(t([K, K, K, A, A, A, TWO, TWO, TWO])).toBe(null) // 2 不能进飞机主体 → 也不是合法牌
    expect(t([3, 3, 3, 4, 4, 4, SJ, BJ])).toBe(null) // 不能带王炸
    // 三连飞机带三张
    expect(analyze([5, 5, 5, 6, 6, 6, 7, 7, 7, 3, 9, K])).toMatchObject({ type: 'plane1', main: 7, len: 3 })
  })

  it('四带二', () => {
    expect(t([8, 8, 8, 8, 3, 5])).toBe('four2')
    expect(t([8, 8, 8, 8, 3, 3, 5, 5])).toBe('four22')
  })
})

describe('比大小', () => {
  const c = (r: number[]) => analyze(r) as Combo
  it('同牌型比主点数', () => {
    expect(canBeat(c([6]), c([5]))).toBe(true)
    expect(canBeat(c([5]), c([5]))).toBe(false)
    expect(canBeat(c([TWO]), c([A]))).toBe(true)
    expect(canBeat(c([BJ]), c([SJ]))).toBe(true)
    expect(canBeat(c([4, 4, 4, 3]), c([3, 3, 3, 9]))).toBe(true)
  })
  it('不同牌型/长度不能压', () => {
    expect(canBeat(c([6, 6]), c([5]))).toBe(false)
    expect(canBeat(c([4, 5, 6, 7, 8, 9]), c([3, 4, 5, 6, 7]))).toBe(false)
    expect(canBeat(c([4, 5, 6, 7, 8]), c([3, 4, 5, 6, 7]))).toBe(true)
  })
  it('炸弹与王炸', () => {
    expect(canBeat(c([3, 3, 3, 3]), c([TWO, TWO]))).toBe(true)
    expect(canBeat(c([4, 4, 4, 4]), c([3, 3, 3, 3]))).toBe(true)
    expect(canBeat(c([3, 3, 3, 3]), c([4, 4, 4, 4]))).toBe(false)
    expect(canBeat(c([SJ, BJ]), c([TWO, TWO, TWO, TWO]))).toBe(true)
    expect(canBeat(c([A, A, A, A]), c([SJ, BJ]))).toBe(false)
    expect(canBeat(c([5]), null)).toBe(true)
  })
})

describe('发牌与流程', () => {
  it('54 张不重复，17/17/17 + 3 底牌', () => {
    expect(new Set(fullDeck().map((x) => x.id)).size).toBe(54)
    const g = newGame(makeRng(1))
    expect(g.hands.map((h) => h.length)).toEqual([17, 17, 17])
    expect(g.bottom).toHaveLength(3)
    const ids = [...g.hands.flat(), ...g.bottom].map((x) => x.id)
    expect(new Set(ids).size).toBe(54)
  })

  it('叫分：三分直接当地主并拿底牌', () => {
    let g = newGame(makeRng(2), 0)
    g = placeBid(g, 0, 1)
    g = placeBid(g, 1, 3)
    expect(g.phase).toBe('playing')
    expect(g.landlord).toBe(1)
    expect(g.hands[1]).toHaveLength(20)
    expect(g.turn).toBe(1)
  })

  it('都不叫 → 需要重发', () => {
    let g = newGame(makeRng(3), 0)
    g = placeBid(g, 0, 0)
    g = placeBid(g, 1, 0)
    g = placeBid(g, 2, 0)
    expect(allPassed(g)).toBe(true)
  })

  it('非法出牌与先手不能不出', () => {
    let g = newGame(makeRng(4), 0)
    g = placeBid(g, 0, 3)
    expect(() => playCards(g, 0, [])).toThrow()
    expect(() => playCards(g, 1, [g.hands[1][0]])).toThrow()
  })

  it('机器人自己打完整局（多种子），结算守恒', () => {
    for (let seed = 10; seed < 60; seed++) {
      const rng = makeRng(seed)
      let g: GameState = newGame(rng, (seed % 3) as Seat)
      let guard = 0
      while (g.phase === 'bidding') {
        const seat = g.turn
        g = placeBid(g, seat, botBid(g.hands[seat], g.bid) || (seat === 2 && g.bids.every((b, i) => i === 2 || b === 0) ? 1 : 0))
        if (allPassed(g)) g = newGame(rng, 0)
        if (++guard > 50) throw new Error('bidding loop')
      }
      while (g.phase === 'playing') {
        const seat = g.turn
        const cards = seat === 0 && seed % 2 ? hintFor(g, seat) : botChoose(g, seat)
        const safe = cards.length === 0 && !g.lead ? [g.hands[seat][g.hands[seat].length - 1]] : cards
        g = playCards(g, seat, safe)
        if (++guard > 400) throw new Error('play loop')
      }
      expect(g.winner).not.toBeNull()
      const pts = settle(g)
      expect(pts[0] + pts[1] + pts[2]).toBe(0)
      expect(g.hands[g.winner!]).toHaveLength(0)
    }
  })

  it('炸弹翻倍', () => {
    const g = newGame(makeRng(5), 0)
    const ended: GameState = { ...g, phase: 'ended', landlord: 0, winner: 0, bid: 2, bombs: 2, spring: false }
    expect(settle(ended)).toEqual([16, -8, -8])
    expect(settle({ ...ended, spring: true })).toEqual([32, -16, -16])
  })
})

describe('机器人', () => {
  it('队友出的牌不去压', () => {
    let g = newGame(makeRng(7), 0)
    g = placeBid(g, 0, 3) // 惟惟当地主，1 和 2 是队友
    g = { ...g, turn: 2, lead: { seat: 1, cards: [g.hands[1][16]], combo: analyze([g.hands[1][16]])! } }
    // 2 号的手牌只要不能一手出完，就应该不出
    expect(botChoose(g, 2)).toEqual([])
  })

  it('枚举出的每手牌都合法', () => {
    const g = newGame(makeRng(9))
    for (const p of enumeratePlays(g.hands[0].map((c) => c.rank))) expect(analyze(p)).not.toBeNull()
  })
})

describe('提示', () => {
  it('队友出的牌，提示一般建议不出；对手的牌能压就给出一手合法的', () => {
    let g = newGame(makeRng(11), 1)
    g = placeBid(g, 1, 3) // 伯恩当地主，惟惟和顾祁砚是队友
    const low = g.hands[2][g.hands[2].length - 1]
    const mate = { ...g, turn: 0 as Seat, lead: { seat: 2 as Seat, cards: [low], combo: analyze([low])! } }
    expect(hintFor(mate, 0)).toEqual([])
    const lowL = g.hands[1][g.hands[1].length - 1]
    const enemy = { ...g, turn: 0 as Seat, lead: { seat: 1 as Seat, cards: [lowL], combo: analyze([lowL])! } }
    const h = hintFor(enemy, 0)
    if (h.length) expect(canBeat(analyze(h)!, enemy.lead.combo)).toBe(true)
  })
})
