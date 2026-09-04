export function affordableTokenLimitFromError(message: string, requested: number): number | null {
  const match = message.match(
    /requested\s+up\s+to\s+([\d,]+)\s+tokens?[,;]?\s+but\s+can\s+only\s+afford\s+([\d,]+)/i,
  )
  if (!match) return null

  const reportedRequested = Number(match[1].replace(/,/g, ''))
  const affordable = Number(match[2].replace(/,/g, ''))
  if (!Number.isFinite(reportedRequested) || !Number.isFinite(affordable) || affordable < 1) {
    return null
  }

  const current = Math.max(1, Math.floor(requested))
  const next = Math.min(current - 1, Math.floor(affordable))
  return next >= 1 ? next : null
}

export async function fetchWithinAffordableTokenBudget(
  requested: number,
  request: (maxTokens: number) => Promise<Response>,
  readError: (response: Response) => Promise<string>,
): Promise<Response> {
  let response = await request(requested)
  if (response.ok) return response

  const message = await readError(response)
  const affordable = affordableTokenLimitFromError(message, requested)
  if (affordable === null) throw new Error(message)

  response = await request(affordable)
  if (!response.ok) throw new Error(await readError(response))
  return response
}
