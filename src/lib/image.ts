/**
 * 图片处理：读取本地图片 → 等比缩放压缩 → 输出 dataURL（存 localStorage 用）。
 * 控制体积，避免大图撑爆本地存储。图片只存本设备，不上传。
 */

/** 把图片文件压缩为 JPEG dataURL。maxSize 为长边像素上限。 */
export async function fileToDataUrl(
  file: File,
  maxSize: number,
  quality = 0.85
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  const src = await readAsDataUrl(file)
  const img = await loadImage(src)
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('读取图片失败'))
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法解析这张图片'))
    img.src = src
  })
}
