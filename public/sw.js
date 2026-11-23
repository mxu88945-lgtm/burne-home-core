// 伯恩主屋 Service Worker：网络优先，断网时回退缓存；只处理本站资源和推送通知。
const CACHE = 'burne-home-cache-v076'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const fallback = new Request(url.origin + url.pathname)
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' })
      try { await (await caches.open(CACHE)).put(fallback, response.clone()) } catch (_) {}
      return response
    } catch (_) {
      return (await caches.match(fallback)) || Response.error()
    }
  })())
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) { data = { body: event.data?.text() || '' } }
  event.waitUntil(self.registration.showNotification(data.title || '伯恩', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: 'apple-touch-icon.png',
    badge: 'apple-touch-icon.png',
    data: { url: data.url || self.registration.scope },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || self.registration.scope
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if ('navigate' in client && client.url !== target) await client.navigate(target).catch(() => undefined)
      if ('focus' in client) return client.focus()
    }
    return self.clients.openWindow(target)
  })())
})
