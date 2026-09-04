import { describe, expect, it, vi } from 'vitest'
import { affordableTokenLimitFromError, fetchWithinAffordableTokenBudget } from './tokenBudget'

describe('affordable token retry', () => {
  it('extracts the affordable ceiling reported by the provider', () => {
    expect(affordableTokenLimitFromError(
      'This request requires more credits, or fewer max_tokens. You requested up to 2,048 tokens, but can only afford 1,670.',
      2048,
    )).toBe(1670)
  })

  it('retries once with the affordable ceiling', async () => {
    const budgets: number[] = []
    const request = vi.fn(async (maxTokens: number) => {
      budgets.push(maxTokens)
      return budgets.length === 1
        ? new Response('credit error', { status: 402 })
        : new Response('ok')
    })
    const response = await fetchWithinAffordableTokenBudget(
      2048,
      request,
      async () => 'This request requires more credits, or fewer max_tokens. You requested up to 2048 tokens, but can only afford 1670.',
    )

    expect(response.ok).toBe(true)
    expect(budgets).toEqual([2048, 1670])
  })
})
