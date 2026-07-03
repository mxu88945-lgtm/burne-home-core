import { useRef, useState } from 'react'
import { useProfileStore } from '@/store/profileStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useChatPrefsStore } from '@/store/chatPrefsStore'
import { usePersonaStore } from '@/store/personaStore'
import { usePetStore, PET_CHOICES } from '@/store/petStore'
import { useMusicStore } from '@/store/musicStore'
import { fileToDataUrl } from '@/lib/image'
import { useImgSrc } from '@/lib/useImgSrc'
import Avatar from '@/components/ui/Avatar'
import PetCritter, { type PetVariant } from '@/components/ui/PetCritter'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

/** 图片上传按钮：点了选图 → 压缩 → 回调 dataURL */
function UploadButton({
  label,
  maxSize,
  onPicked,
  onError,
}: {
  label: string
  maxSize: number
  onPicked: (dataUrl: string) => void
  onError: (msg: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // 允许重复选同一张
          if (!file) return
          setBusy(true)
          onError('')
          try {
            onPicked(await fileToDataUrl(file, maxSize))
          } catch (err) {
            onError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="glass rounded-lg px-3 py-1.5 text-xs text-ink disabled:opacity-60"
      >
        {busy ? '处理中…' : label}
      </button>
    </>
  )
}

export default function AppearanceManager() {
  const { profile, setProfile } = useProfileStore()
  const { appearance, update } = useAppearanceStore()
  const chatStyle = useChatPrefsStore((s) => s.chatStyle)
  const setChatStyle = useChatPrefsStore((s) => s.setChatStyle)
  const persona = usePersonaStore((s) => s.persona)
  const setPersona = usePersonaStore((s) => s.setPersona)
  const pet = usePetStore()
  const musicEnabled = useMusicStore((s) => s.enabled)
  const setMusicEnabled = useMusicStore((s) => s.setEnabled)
  const [err, setErr] = useState('')
  const chatBgSrc = useImgSrc(appearance.chatBg)
  const dramaBgSrc = useImgSrc(appearance.dramaBg)

  return (
    <div className="space-y-3">
      {err && <div className="text-[11px] text-red-500">出错：{err}</div>}

      {/* 头像 */}
      {(
        [
          { key: 'A', name: '用户头像', emoji: profile.avatarA, img: profile.avatarAImg },
          { key: 'B', name: 'AI / TA 头像', emoji: profile.avatarB, img: profile.avatarBImg },
        ] as const
      ).map((row) => (
        <div key={row.key} className="glass rounded-2xl p-4 space-y-2">
          <div className="label">{row.name}</div>
          <div className="flex items-center gap-3">
            <Avatar
              img={row.img}
              emoji={row.emoji}
              className="h-14 w-14 rounded-full text-2xl"
              textCls="text-2xl"
              style={{ backgroundColor: 'var(--card-strong)', border: '2px solid var(--card-border)' }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton
                label="上传图片"
                maxSize={256}
                onPicked={(d) =>
                  setProfile(row.key === 'A' ? { avatarAImg: d } : { avatarBImg: d })
                }
                onError={setErr}
              />
              {row.img && (
                <button
                  type="button"
                  onClick={() =>
                    setProfile(row.key === 'A' ? { avatarAImg: undefined } : { avatarBImg: undefined })
                  }
                  className="text-[11px] text-muted hover:text-accent"
                >
                  移除图片
                </button>
              )}
            </div>
          </div>
          {/* 没传图时可填 emoji */}
          {!row.img && (
            <input
              className={inputCls}
              maxLength={4}
              placeholder="或填一个 emoji，如 🌙"
              value={row.emoji}
              onChange={(e) =>
                setProfile(row.key === 'A' ? { avatarA: e.target.value } : { avatarB: e.target.value })
              }
            />
          )}
          {/* 名字（聊天里的显示名） */}
          <label className="block">
            <span className="text-[11px] text-muted">
              {row.key === 'A' ? '我的名字' : 'AI 名字'}
            </span>
            <input
              className={inputCls + ' mt-1'}
              placeholder={row.key === 'A' ? '如 B / 惟惟' : '如 Elliott'}
              value={row.key === 'A' ? profile.nameA : persona.name}
              onChange={(e) =>
                row.key === 'A'
                  ? setProfile({ nameA: e.target.value })
                  : setPersona({ name: e.target.value })
              }
            />
          </label>
        </div>
      ))}

      {/* 对话样式 */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="label">对话样式</div>
        <div className="flex gap-2">
          {([
            { id: 'bubble', label: '气泡式' },
            { id: 'flat', label: '平铺式' },
          ] as const).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setChatStyle(o.id)}
              className={[
                'flex-1 rounded-xl py-2 text-sm transition',
                chatStyle === o.id ? 'btn-primary' : 'glass text-muted',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          平铺式：头像名字在文字上方、无气泡、文字铺满更宽（像看文档）。
        </p>
      </div>

      {/* 聊天背景 */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="label">聊天背景</div>
        <div className="flex items-center gap-3">
          <div
            className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
            style={{
              backgroundImage: chatBgSrc ? `url(${chatBgSrc})` : undefined,
              backgroundColor: chatBgSrc ? undefined : 'var(--card-strong)',
              border: '1px solid var(--card-border)',
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              label="上传背景"
              maxSize={1280}
              onPicked={(d) => update({ chatBg: d, chatBgDim: 0, chatBgOpacity: 1, chatBgBlur: 0 })}
              onError={setErr}
            />
            {appearance.chatBg && (
              <button
                type="button"
                onClick={() => update({ chatBg: '' })}
                className="text-[11px] text-muted hover:text-accent"
              >
                移除背景
              </button>
            )}
          </div>
        </div>
        {!appearance.chatBg && (
          <p className="text-[11px] text-muted">
            上传背景后，这里会出现 显影 / 压暗 / 模糊 / 铺法 可以调。
          </p>
        )}
        {appearance.chatBg && (
          <div className="space-y-3">
            <label className="block text-[12px] text-muted">
              <div className="mb-1 flex justify-between">
                <span>背景显影</span>
                <span>{Math.round(appearance.chatBgOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={appearance.chatBgOpacity}
                onChange={(e) => update({ chatBgOpacity: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
            <label className="block text-[12px] text-muted">
              <div className="mb-1 flex justify-between">
                <span>压暗</span>
                <span>{Math.round(appearance.chatBgDim * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.7}
                step={0.05}
                value={appearance.chatBgDim}
                onChange={(e) => update({ chatBgDim: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
            <label className="block text-[12px] text-muted">
              <div className="mb-1 flex justify-between">
                <span>模糊</span>
                <span>{appearance.chatBgBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={appearance.chatBgBlur}
                onChange={(e) => update({ chatBgBlur: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
            <div className="text-[12px] text-muted">
              <div className="mb-1">铺法</div>
              <div className="flex gap-2">
                {([
                  { id: 'cover', label: '铺满' },
                  { id: 'contain', label: '完整' },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => update({ chatBgFit: o.id })}
                    className={[
                      'flex-1 rounded-xl py-2 text-sm transition',
                      appearance.chatBgFit === o.id ? 'btn-primary' : 'glass text-muted',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 桌宠 / 小挂件（浮在所有页面） */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="label">桌宠 · 小挂件</div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={pet.enabled}
              onChange={(e) => pet.setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </label>
        </div>
        {pet.enabled && (
          <>
            <p className="text-[11px] text-muted">浮在所有页面上：会自己慢慢爬来爬去、可拖着换位置、点一下有反应、有新消息会冒小气泡。挑个造型：</p>
            <div className="flex flex-wrap gap-2">
              {PET_CHOICES.map((e) => (
                <button
                  key={e}
                  onClick={() => pet.setEmoji(e)}
                  aria-label={e}
                  className={`grid h-12 w-12 place-items-center rounded-xl transition ${
                    pet.emoji === e ? 'bg-accent/20 ring-2 ring-accent' : 'bg-white/40'
                  }`}
                >
                  <PetCritter variant={e as PetVariant} className="h-9 w-9" />
                </button>
              ))}
            </div>
            <button
              onClick={() => pet.setPos(0.86, 0.7)}
              className="glass rounded-full px-3 py-1 text-[12px] text-ink"
            >
              重置位置
            </button>
          </>
        )}
      </div>

      {/* 悬浮音乐播放器（浮在所有页面） */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="label">音乐播放器</div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          右下角一张小唱片，点开可播放/暂停/切歌、管理歌单；音乐自己上传，只存在本机、不上传。播放时唱片会转圈圈～
        </p>
      </div>

      {/* 戏剧背景（剧场列表 + 戏剧房间） */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="label">戏剧背景</div>
        <div className="flex items-center gap-3">
          <div
            className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
            style={{
              backgroundImage: dramaBgSrc ? `url(${dramaBgSrc})` : undefined,
              backgroundColor: dramaBgSrc ? undefined : 'var(--card-strong)',
              border: '1px solid var(--card-border)',
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              label="上传背景"
              maxSize={1280}
              onPicked={(d) => update({ dramaBg: d })}
              onError={setErr}
            />
            {appearance.dramaBg && (
              <button
                type="button"
                onClick={() => update({ dramaBg: '' })}
                className="text-[11px] text-muted hover:text-accent"
              >
                移除背景
              </button>
            )}
          </div>
        </div>
        {!appearance.dramaBg && (
          <p className="text-[11px] text-muted">作用于剧场列表 + 戏剧房间。上传后这里会出现 模糊 / 毛玻璃 可以调。</p>
        )}
        {appearance.dramaBg && (
          <div className="space-y-3">
            <label className="block text-[12px] text-muted">
              <div className="mb-1 flex justify-between">
                <span>模糊</span>
                <span>{appearance.dramaBgBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={appearance.dramaBgBlur}
                onChange={(e) => update({ dramaBgBlur: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
            <label className="block text-[12px] text-muted">
              <div className="mb-1 flex justify-between">
                <span>毛玻璃（白纱 · 越大文字越清楚）</span>
                <span>{Math.round(appearance.dramaBgFrost * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.7}
                step={0.05}
                value={appearance.dramaBgFrost}
                onChange={(e) => update({ dramaBgFrost: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        图片会自动压缩、只保存在本设备浏览器，不会上传或进入仓库。背景作用于聊天页和戏剧页。
      </p>
    </div>
  )
}
