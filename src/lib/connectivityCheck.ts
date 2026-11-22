export const CONNECTIVITY_TARGETS = [
  { key: 'gate', label: 'gate', url: 'https://gate.zhouweiweihome.top' },
  { key: 'push', label: 'push', url: 'https://push.zhouweiweihome.top' },
  { key: 'tools', label: 'tools', url: 'https://tools.zhouweiweihome.top' },
] as const

export type ConnectivityResult = typeof CONNECTIVITY_TARGETS[number] & { ok: boolean; latencyMs: number | null; error?: string }

export async function checkConnectivity(): Promise<ConnectivityResult[]> {
  return Promise.all(CONNECTIVITY_TARGETS.map(async (target) => {
    const started = performance.now()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(target.url, { method: 'GET', cache: 'no-store', mode: 'cors', signal: controller.signal })
      return { ...target, ok: response.ok, latencyMs: Math.round(performance.now() - started), ...(response.ok ? {} : { error: `HTTP ${response.status}` }) }
    } catch (error) {
      return { ...target, ok: false, latencyMs: null, error: error instanceof DOMException && error.name === 'AbortError' ? '请求超时' : '无法连接' }
    } finally { window.clearTimeout(timer) }
  }))
}
