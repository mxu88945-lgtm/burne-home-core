/** 头像：有上传图片就显示图片（铺满裁切），否则显示 emoji。
 *  图片可能是 `idb:` 引用（本体在 IndexedDB，不占 localStorage 5MB）——在这里统一解析。
 *  ⚠️ 调用方 style 里的 `background` 简写会转成 backgroundColor：React 在简写/单属性（backgroundImage）
 *  之间切换时会把样式清空（异步解析必然经历这个切换），别改回混用。 */
import { useImgSrc } from '@/lib/useImgSrc'

export default function Avatar({
  img,
  emoji,
  className = '',
  textCls = '',
  style,
}: {
  img?: string
  emoji: string
  className?: string
  textCls?: string
  style?: React.CSSProperties
}) {
  const src = useImgSrc(img)
  const { background, backgroundColor, ...rest } = style || {}
  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-cover bg-center ${className}`}
      style={{
        ...rest,
        backgroundColor: backgroundColor ?? (typeof background === 'string' ? background : undefined),
        ...(src
          ? {
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : null),
      }}
    >
      {!src && <span className={textCls}>{emoji}</span>}
    </div>
  )
}
