/**
 * 斗地主 · 规则机器人（伯恩、顾祁砚出牌用；惟惟的「提示」也用它）。
 * 纯函数、确定性：同样的局面永远给同样的选择。
 */
import {
  analyze,
  beatingPlays,
  estimateMoves,
  enumeratePlays,
  isTeammate,
  NEXT,
  pickCards,
  type Card,
  type Combo,
  type GameState,
  type RankPlay,
  type Seat,
} from './doudizhu'

function without(hand: number[], play: RankPlay): number[] {
  const rest = [...hand]
  for (const r of play) {
    const i = rest.indexOf(r)
    if (i >= 0) rest.splice(i, 1)
  }
  return rest
}

function isBombLike(c: Combo): boolean {
  return c.type === 'bomb' || c.type === 'rocket'
}

/** 越小越好：打完剩几手 → 主点数小 → 出得多 */
function score(hand: number[], play: RankPlay): number {
  const c = analyze(play)!
  const rest = without(hand, play)
  if (rest.length === 0) return -1000
  let s = estimateMoves(rest) * 100 + c.main * 2 - play.length * 3
  if (isBombLike(c)) s += 400 // 炸弹留着
  return s
}

/** 叫分：按大牌数量估个强度 */
export function botBid(hand: Card[], currentBid: number): number {
  const ranks = hand.map((c) => c.rank)
  let strength = 0
  for (const r of ranks) {
    if (r === 17) strength += 4
    else if (r === 16) strength += 3
    else if (r === 15) strength += 2
    else if (r === 14) strength += 0.5
  }
  const cnt = new Map<number, number>()
  for (const r of ranks) cnt.set(r, (cnt.get(r) ?? 0) + 1)
  for (const c of cnt.values()) if (c === 4) strength += 4
  let want = 0
  if (strength >= 10) want = 3
  else if (strength >= 7) want = 2
  else if (strength >= 5) want = 1
  return want > currentBid ? want : 0
}

/** 机器人选牌：返回要出的牌（空数组 = 不出） */
export function botChoose(s: GameState, seat: Seat): Card[] {
  const handCards = s.hands[seat]
  const hand = handCards.map((c) => c.rank)
  const lead = s.lead
  const enemies = ([0, 1, 2] as Seat[]).filter((x) => !isTeammate(s, seat, x))
  const minEnemyCards = Math.min(...enemies.map((e) => s.hands[e].length))
  const nextSeat = NEXT[seat]
  const nextIsTeammate = isTeammate(s, seat, nextSeat) && nextSeat !== seat

  // ── 自由出牌 ──
  if (!lead) {
    const all = enumeratePlays(hand)
    // 一手能出完就直接出
    const finish = all.find((p) => p.length === hand.length)
    if (finish) return pickCards(handCards, finish)!
    // 下家是队友且只剩一张：送他一张最小的单牌
    if (nextIsTeammate && s.hands[nextSeat].length === 1) {
      const low = Math.min(...hand)
      return pickCards(handCards, [low])!
    }
    let cand = all.filter((p) => !isBombLike(analyze(p)!))
    if (cand.length === 0) cand = all
    // 敌人只剩 1 张：尽量不出单；非要出单就出最大的
    if (minEnemyCards === 1) {
      const nonSingle = cand.filter((p) => p.length > 1)
      if (nonSingle.length) cand = nonSingle
      else return pickCards(handCards, [Math.max(...hand)])!
    }
    // 敌人只剩 2 张：尽量不出对子
    if (minEnemyCards === 2) {
      const noPair = cand.filter((p) => analyze(p)!.type !== 'pair')
      if (noPair.length) cand = noPair
    }
    cand.sort((a, b) => score(hand, a) - score(hand, b))
    return pickCards(handCards, cand[0])!
  }

  // ── 跟牌 ──
  const options = beatingPlays(hand, lead.combo)
  if (options.length === 0) return []
  const finish = options.find((p) => p.length === hand.length)
  if (finish) return pickCards(handCards, finish)!

  const leaderIsMate = isTeammate(s, seat, lead.seat)
  if (leaderIsMate) {
    // 队友的牌：不压（除非能直接出完，上面已处理）
    return []
  }

  const normal = options.filter((p) => !isBombLike(analyze(p)!))
  const bombs = options.filter((p) => isBombLike(analyze(p)!))
  const leaderCards = s.hands[lead.seat].length
  const before = estimateMoves(hand)

  if (normal.length) {
    normal.sort((a, b) => score(hand, a) - score(hand, b))
    const best = normal[0]
    const c = analyze(best)!
    const after = estimateMoves(without(hand, best))
    // 农民：地主牌还多、要拆 2/王去压小牌时，留给队友（只要队友还在后面）
    const isFarmer = seat !== s.landlord
    const mateAfterMe = isFarmer && isTeammate(s, seat, nextSeat) && nextSeat !== lead.seat
    if (
      isFarmer &&
      mateAfterMe &&
      c.main >= 15 &&
      lead.combo.main < 13 &&
      leaderCards > 6 &&
      after > before
    ) {
      return []
    }
    // 别为压一张小牌把好牌型拆得稀碎（敌人牌还多的时候）
    if (after - before > 1.5 && leaderCards > 8 && lead.combo.main < 11) return []
    return pickCards(handCards, best)!
  }

  // 只能用炸弹：敌人快走完、或者炸完自己能很快走完，才炸
  if (bombs.length) {
    const b = [...bombs].sort((x, y) => analyze(x)!.main - analyze(y)!.main)[0]
    const after = estimateMoves(without(hand, b))
    if (leaderCards <= 5 || after <= 2) return pickCards(handCards, b)!
  }
  return []
}

/** 给惟惟的提示：对手的牌能压就推荐最省的一手；队友的牌一般建议不出 */
export function hintFor(s: GameState, seat: Seat): Card[] {
  const handCards = s.hands[seat]
  const hand = handCards.map((c) => c.rank)
  if (!s.lead) return botChoose(s, seat)
  // 队友的牌：一般不压（能一手出完除外）
  if (s.lead.seat !== seat && isTeammate(s, seat, s.lead.seat)) return botChoose(s, seat)
  const options = beatingPlays(hand, s.lead.combo)
  if (!options.length) return []
  options.sort((a, b) => score(hand, a) - score(hand, b))
  return pickCards(handCards, options[0])!
}
