import { useRef, useState } from 'react'
import { useProfileStore } from '@/store/profileStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useChatPrefsStore } from '@/store/chatPrefsStore'
import { usePersonaStore } from '@/store/personaStore'
import { fileToDataUrl } from '@/lib/image'
import Avatar from '@/components/ui/Avatar'

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
  const [err, setErr] = useState('')

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
              backgroundImage: appearance.chatBg ? `url(${appearance.chatBg})` : undefined,
              background: appearance.chatBg ? undefined : 'var(--card-strong)',
              border: '1px solid var(--card-border)',
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              label="上传背景"
              maxSize={1280}
              onPicked={(d) => update({ chatBg: d })}
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

      <p className="text-[11px] text-muted leading-relaxed">
        图片会自动压缩、只保存在本设备浏览器，不会上传或进入仓库。背景目前只作用于聊天页。
      </p>
    </div>
  )
}
