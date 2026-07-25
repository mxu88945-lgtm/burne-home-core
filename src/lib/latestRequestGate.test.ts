import { describe, expect, it } from 'vitest'
import { LatestRequestGate } from '@/lib/latestRequestGate'

describe('LatestRequestGate', () => {
  it('invalidates an in-flight reply as soon as the user sends a newer message', () => {
    const gate = new LatestRequestGate()
    const firstReply = gate.begin()

    expect(gate.isCurrent(firstReply)).toBe(true)

    gate.invalidate()

    expect(gate.isCurrent(firstReply)).toBe(false)
  })

  it('does not let an older reply completion supersede the newest request', () => {
    const gate = new LatestRequestGate()
    const firstReply = gate.begin()
    gate.invalidate()
    const newestReply = gate.begin()

    expect(gate.isCurrent(firstReply)).toBe(false)
    expect(gate.isCurrent(newestReply)).toBe(true)
  })
})
