import { useAppearanceStore } from '@/store/appearanceStore'
import { useImgSrc } from '@/lib/useImgSrc'

/**
 * 戏剧自定义背景层（剧场列表 + 戏剧房间共用）。
 * 铺满视口、在内容之下(-z-10)：一层可模糊的图 + 一层毛玻璃白纱。
 * 只在设了 dramaBg 时渲染；图片只存本机（本体在 IndexedDB，`idb:` 引用）。
 */
export default function DramaBg() {
  const { dramaBg: dramaBgRef, dramaBgBlur, dramaBgFrost } = useAppearanceStore((s) => s.appearance)
  const dramaBg = useImgSrc(dramaBgRef)
  if (!dramaBg) return null
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: `url(${dramaBg})`,
          filter: dramaBgBlur ? `blur(${dramaBgBlur}px)` : undefined,
        }}
      />
      {dramaBgFrost > 0 && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ background: `rgba(255,255,255,${dramaBgFrost})` }}
        />
      )}
    </>
  )
}
