import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import Pet from '@/components/ui/Pet'
import MusicPlayer from '@/components/ui/MusicPlayer'
import { useChatStore } from '@/store/chatStore'
import { usePhoneStore } from '@/store/phoneStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { idbSet } from '@/lib/idb'

export default function AppLayout() {
  const { pathname } = useLocation()

  // 一次性迁移：主聊天/小手机消息里的 dataURL 图片 → IndexedDB。
  // localStorage 每站仅 ~5MB，图片挤在里面写满会静默丢对话（事故见 HANDOFF H0），这是根治的后半程。
  useEffect(() => {
    const KEY = 'burne-home-core:img-mig2'
    if (localStorage.getItem(KEY)) return
    void (async () => {
      try {
        const cs = useChatStore.getState()
        let cChanged = false
        const cSess: typeof cs.sessions = []
        for (const s of cs.sessions) {
          const messages = await Promise.all(
            s.messages.map(async (m) => {
              if (m.image && m.image.startsWith('data:')) {
                cChanged = true
                await idbSet(`cimg:${m.id}`, m.image)
                return { ...m, image: `idb:cimg:${m.id}` }
              }
              return m
            }),
          )
          cSess.push({ ...s, messages })
        }
        if (cChanged) cs.replaceSessions(cSess)

        const ps = usePhoneStore.getState()
        let pChanged = false
        const pSess: typeof ps.sessions = []
        for (const s of ps.sessions) {
          const messages = await Promise.all(
            s.messages.map(async (m) => {
              if (m.image && m.image.startsWith('data:')) {
                pChanged = true
                await idbSet(`pimg:${m.id}`, m.image)
                return { ...m, image: `idb:pimg:${m.id}` }
              }
              return m
            }),
          )
          pSess.push({ ...s, messages })
        }
        if (pChanged) ps.replaceSessions(pSess)

        localStorage.setItem(KEY, '1')
      } catch (e) {
        console.warn('[img-mig2] 迁移失败，下次再试', e)
      }
    })()
  }, [])

  // 一次性迁移：三张全屏背景图（聊天/戏剧/小手机）→ IndexedDB。
  // 每张压缩后仍 200~500KB，三张就能吃掉配额一大截。先确认写进 IDB 再瘦 localStorage，不丢图。
  useEffect(() => {
    const KEY = 'burne-home-core:img-mig3'
    if (localStorage.getItem(KEY)) return
    void (async () => {
      try {
        const ap = useAppearanceStore.getState().appearance
        for (const field of ['chatBg', 'dramaBg'] as const) {
          const v = ap[field]
          if (v.startsWith('data:')) {
            const k = `bg:mig-${field}`
            await idbSet(k, v)
            useAppearanceStore.getState().update({ [field]: `idb:${k}` })
          }
        }
        const ph = usePhoneStore.getState()
        if (ph.persona.bgImg?.startsWith('data:')) {
          const k = 'bg:mig-phone'
          await idbSet(k, ph.persona.bgImg)
          ph.setPersona({ bgImg: `idb:${k}` })
        }
        localStorage.setItem(KEY, '1')
      } catch (e) {
        console.warn('[img-mig3] 迁移失败，下次再试', e)
      }
    })()
  }, [])
  const isHome = pathname === '/'
  // 聊天页 / 小手机自管头部与内边距（沉浸式）；首页用全局顶栏；其余页自带返回头
  const isChat = pathname === '/chat' || pathname === '/phone'

  return (
    // 滚动锁：固定壳 + 可视视口尺寸/位移，键盘弹出时整体贴住键盘上方
    <div
      className="app-bg flex flex-col overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--app-height, 100dvh)',
        transform: 'translateY(var(--app-offset, 0px))',
      }}
    >
      <div className="relative mx-auto flex h-full w-full max-w-[440px] flex-col border-line sm:border-x">
        {isHome && <AppHeader />}
        <Pet />
        <MusicPlayer />
        <main
          className={
            isChat
              ? 'min-h-0 flex-1 overflow-y-auto'
              : isHome
                ? 'min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1'
                : 'min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
