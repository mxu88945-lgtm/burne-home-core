import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { useGuardStore } from '@/store/guardStore'
import { usePersonaStore } from '@/store/personaStore'
import { useProfileStore } from '@/store/profileStore'
import { useImgSrc } from '@/lib/useImgSrc'
import { GATE_BASE } from '@/lib/guard'

const inputCls = 'rounded-xl border border-line bg-white/40 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent'

/** 把头像缩成 96px 小图给锁屏页用（不上传原图）。 */
async function tinyAvatar(src: string): Promise<string> {
  if (!src) return ''
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 96
    const s = Math.min(img.width, img.height)
    c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96)
    return c.toDataURL('image/jpeg', 0.8)
  } catch {
    return ''
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-1">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white/40 px-2 py-1.5 text-[11px] text-ink">{value}</code>
        <button
          className="glass shrink-0 rounded-full px-3 py-1 text-xs text-ink"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            })
          }}
        >
          {done ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )
}

export default function GuardPage() {
  const g = useGuardStore()
  const { persona } = usePersonaStore()
  const { profile } = useProfileStore()
  const name = persona.name || profile.nameB || '他'
  const avatarSrc = useImgSrc(profile.avatarBImg)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [appLabel, setAppLabel] = useState('抖音')

  async function turnOn() {
    setBusy(true)
    setMsg('')
    const ok = await g.enableGate({ name, avatar: await tinyAvatar(avatarSrc) })
    setBusy(false)
    setMsg(ok ? '门开好了 ✓ 照下面设快捷指令' : '连不上服务器，稍后再试')
  }

  const app = encodeURIComponent(appLabel.trim() || '手机')
  const gateUrl = `${GATE_BASE}/gate?k=${g.key}&app=${app}`
  const lockUrl = `${GATE_BASE}/lock?k=${g.key}&app=${app}`
  const nightUrl = `${GATE_BASE}/night?k=${g.key}`

  return (
    <SubPage title="他管着你">
      <label className="glass flex items-center justify-between rounded-2xl p-4">
        <span className="text-sm text-ink">
          让{name}能锁你
          <span className="block text-[11px] text-muted">他想让你放下手机时会在聊天里锁屏，到点自动解开；偷偷解锁他会知道</span>
        </span>
        <input type="checkbox" checked={g.enabled} onChange={(e) => g.setEnabled(e.target.checked)} className="h-5 w-5 accent-accent" />
      </label>

      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">
            管到别的 App
            <span className="block text-[11px] text-muted">锁着、宵禁、次数用完时，打开抖音这类 App 会跳到他的锁屏页（要配 iPhone 快捷指令）</span>
          </span>
          {g.gateOn ? (
            <button className="glass shrink-0 rounded-full px-3 py-1.5 text-xs text-muted" onClick={() => { g.disableGate(); setMsg('') }}>关掉</button>
          ) : (
            <button className="btn-primary shrink-0 rounded-full px-4 py-1.5 text-sm" disabled={busy} onClick={() => void turnOn()}>{busy ? '开启中…' : '开启'}</button>
          )}
        </div>
        {msg && <p className="text-xs text-accent">{msg}</p>}
      </div>

      {g.gateOn && (
        <>
          <div className="glass space-y-3 rounded-2xl p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm text-ink">宵禁<span className="block text-[11px] text-muted">这段时间别的 App 打不开，手机开勿扰；他能临时改今晚的开始时间</span></span>
              <input type="checkbox" checked={g.curfew.on} onChange={(e) => g.setCurfew({ on: e.target.checked })} className="h-5 w-5 accent-accent" />
            </label>
            {g.curfew.on && (
              <div className="flex items-center gap-2 text-sm text-ink">
                <input type="time" className={inputCls} value={g.curfew.start} onChange={(e) => e.target.value && g.setCurfew({ start: e.target.value })} />
                <span className="text-muted">到</span>
                <input type="time" className={inputCls} value={g.curfew.end} onChange={(e) => e.target.value && g.setCurfew({ end: e.target.value })} />
              </div>
            )}
          </div>

          <div className="glass space-y-3 rounded-2xl p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm text-ink">每天限次<span className="block text-[11px] text-muted">每个 App 一天最多打开几次，超了就拦</span></span>
              <input type="checkbox" checked={g.limit.on} onChange={(e) => g.setLimit({ on: e.target.checked })} className="h-5 w-5 accent-accent" />
            </label>
            {g.limit.on && (
              <div className="flex items-center gap-3">
                <button onClick={() => g.setLimit({ max: g.limit.max - 1 })} className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink">−</button>
                <span className="w-16 text-center text-sm text-ink">{g.limit.max} 次</span>
                <button onClick={() => g.setLimit({ max: g.limit.max + 1 })} className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink">＋</button>
              </div>
            )}
          </div>

          <div className="glass space-y-3 rounded-2xl p-4 text-[13px] leading-relaxed text-ink">
            <div className="text-sm font-medium">设快捷指令（一次就好）</div>
            <label className="flex items-center gap-2 text-[12px] text-muted">
              这组拦的是
              <input className={`${inputCls} w-28`} value={appLabel} onChange={(e) => setAppLabel(e.target.value.slice(0, 12))} />
              （他看到的名字，多个 App 可以写「娱乐」）
            </label>
            <ol className="list-decimal space-y-1 pl-5">
              <li>打开「快捷指令」→ 底部「自动化」→ 右上 ＋ →「App」，选抖音等，勾「已打开」，选「立即运行」。</li>
              <li>新建空白自动化，加操作「获取 URL 的内容」，填下面第一个链接。</li>
              <li>加「如果」：「URL 的内容」「包含」<b>lock</b>。</li>
              <li>在「如果」里面加「打开 URL」，填第二个链接。</li>
            </ol>
            <CopyRow label="① 问他放不放行" value={gateUrl} />
            <CopyRow label="② 锁屏页" value={lockUrl} />
            <div className="pt-2 text-sm font-medium">门：打开 App 时先问门</div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>打开「快捷指令」→「自动化」。</li>
              <li>点「创建个人自动化」→「App」。</li>
              <li>选择要拦的 App，勾选「打开时」→「下一步」。</li>
              <li>添加操作「获取 URL 的内容」，填入下面的门地址。</li>
              <li>添加操作「如果」，条件设为「URL 的内容」包含 <b>lock</b>。</li>
              <li>在「如果」里面添加「打开 URL」，填入下面的锁屏地址。</li>
              <li>关闭「运行前询问」→「完成」。</li>
            </ol>
            <CopyRow label="门地址" value={gateUrl} />
            <CopyRow label="锁屏地址" value={lockUrl} />

            <div className="pt-2 text-sm font-medium">夜：到点开启勿扰</div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>打开「快捷指令」→「自动化」→「创建个人自动化」。</li>
              <li>选择「时间」→设为每天 {g.curfew.start}→「下一步」。</li>
              <li>添加操作「获取 URL 的内容」，填入下面的夜地址。</li>
              <li>添加操作「如果」，条件设为「URL 的内容」包含 <b>dnd</b>。</li>
              <li>在「如果」里面添加「设定专注模式」为「勿扰模式」和「设定亮度」为 20%。</li>
              <li>关闭「运行前询问」→「完成」。</li>
            </ol>
            <CopyRow label="夜地址" value={nightUrl} />

            <div className="pt-2 text-sm font-medium">早：到点关闭勿扰</div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>再创建一个「时间」自动化。</li>
              <li>设为每天 {g.curfew.end}→「下一步」。</li>
              <li>添加操作「设定专注模式」为「勿扰模式」关闭。</li>
              <li>关闭「运行前询问」→「完成」。</li>
            </ol>
            <p className="text-[11px] text-muted">链接里带着你的专属钥匙，别发给别人。锁屏页上「偷偷解锁」放你 10 分钟，他会知道。</p>
          </div>
        </>
      )}
    </SubPage>
  )
}
