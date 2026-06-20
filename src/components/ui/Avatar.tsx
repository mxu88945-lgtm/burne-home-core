/** 头像：有上传图片就显示图片（铺满裁切），否则显示 emoji。 */
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
  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-cover bg-center ${className}`}
      style={{ ...style, ...(img ? { backgroundImage: `url(${img})` } : null) }}
    >
      {!img && <span className={textCls}>{emoji}</span>}
    </div>
  )
}
