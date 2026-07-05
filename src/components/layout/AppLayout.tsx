import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import Pet from '@/components/ui/Pet'
import MusicPlayer from '@/components/ui/MusicPlayer'
import { useChatStore } from '@/store/chatStore'
import { usePhoneStore } from '@/store/phoneStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useProfileStore } from '@/store/profileStore'
import { useStickerStore } from '@/store/stickerStore'
import { useDramaStore } from '@/store/dramaStore'
import { useCharLibStore } from '@/store/charLibStore'
import { idbSet } from '@/lib/idb'

export default function AppLayout() {
  const { pathname } = useLocation()

  // 一次性迁移：主聊天/小手机消息里的 dataURL 图片 → IndexedDB。
  // localStorage 每站仅 ~5MB，图片挤在里面写满会静默丢对话（事故见 HANDOFF H0），这是根治的后半程。
  // mig4（贴纸/头像）串在 mig2 后面跑：两者都整体替换 phone sessions，并行会互相覆盖。
  useEffect(() => {
    void (async () => {
      await runMig2()
      await runMig4()
    })()
  }, [])

  async function runMig2() {
    const KEY = 'burne-home-core:img-mig2'
    if (localStorage.getItem(KEY)) return
    await (async () => {
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
  }

  // 一次性迁移：贴纸库图片、小手机消息里的贴纸图、所有头像图（我的资料/小手机/戏剧角色/角色库）→ IndexedDB。
  // 她的体检显示这些是剩下的大头（贴纸 738KB + 小手机 1.57MB 里一大半是消息内嵌的贴纸 dataURL）。
  async function runMig4() {
    const KEY = 'burne-home-core:img-mig4'
    if (localStorage.getItem(KEY)) return
    try {
      // 贴纸库
      const st = useStickerStore.getState()
      if (st.stickers.some((s) => s.img?.startsWith('data:'))) {
        const stickers = await Promise.all(
          st.stickers.map(async (s) => {
            if (!s.img?.startsWith('data:')) return s
            await idbSet(`simg:${s.id}`, s.img)
            return { ...s, img: `idb:simg:${s.id}` }
          }),
        )
        st.replaceAll(stickers)
      }

      // 小手机：消息里的贴纸图 + 头像
      const ph = usePhoneStore.getState()
      if (ph.sessions.some((s) => s.messages.some((m) => m.sticker?.img?.startsWith('data:')))) {
        const sessions = await Promise.all(
          ph.sessions.map(async (s) => ({
            ...s,
            messages: await Promise.all(
              s.messages.map(async (m) => {
                if (!m.sticker?.img?.startsWith('data:')) return m
                await idbSet(`simg:m-${m.id}`, m.sticker.img)
                return { ...m, sticker: { ...m.sticker, img: `idb:simg:m-${m.id}` } }
              }),
            ),
          })),
        )
        ph.replaceSessions(sessions)
      }
      if (ph.persona.avatarImg?.startsWith('data:')) {
        await idbSet('av:mig-phone', ph.persona.avatarImg)
        usePhoneStore.getState().setPersona({ avatarImg: 'idb:av:mig-phone' })
      }

      // 我的资料两个头像
      const pf = useProfileStore.getState()
      for (const k of ['avatarAImg', 'avatarBImg'] as const) {
        const v = pf.profile[k]
        if (v?.startsWith('data:')) {
          await idbSet(`av:mig-${k}`, v)
          useProfileStore.getState().setProfile({ [k]: `idb:av:mig-${k}` })
        }
      }

      // 戏剧各剧场成员头像
      const dr = useDramaStore.getState()
      if (dr.scenes.some((s) => s.chars.some((c) => c.avatarImg?.startsWith('data:')))) {
        const scenes = await Promise.all(
          dr.scenes.map(async (s) => ({
            ...s,
            chars: await Promise.all(
              s.chars.map(async (c) => {
                if (!c.avatarImg?.startsWith('data:')) return c
                await idbSet(`av:mig-d-${c.id}`, c.avatarImg)
                return { ...c, avatarImg: `idb:av:mig-d-${c.id}` }
              }),
            ),
          })),
        )
        dr.replaceScenes(scenes)
      }

      // 角色库头像
      const cl = useCharLibStore.getState()
      if (cl.chars.some((c) => c.avatarImg?.startsWith('data:'))) {
        const chars = await Promise.all(
          cl.chars.map(async (c) => {
            if (!c.avatarImg?.startsWith('data:')) return c
            await idbSet(`av:mig-l-${c.id}`, c.avatarImg)
            return { ...c, avatarImg: `idb:av:mig-l-${c.id}` }
          }),
        )
        cl.replaceChars(chars)
      }

      localStorage.setItem(KEY, '1')
    } catch (e) {
      console.warn('[img-mig4] 迁移失败，下次再试', e)
    }
  }

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
    // iOS PWA 默认用 100vh 吃满物理屏幕；键盘弹出时 main.tsx 才会临时改 --app-height。
    <div
      className="app-bg flex flex-col overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: 'var(--app-height, 100vh)',
        minHeight: '100vh',
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
