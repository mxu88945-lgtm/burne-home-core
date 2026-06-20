/**
 * PDF 文字提取（前端，pdfjs）。仅对「文本版」PDF 有效；扫描版（图片）提取不到文字。
 * 本文件按需动态加载（见 Chat 的 pickFile），避免拖累主包体积。
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** 提取 PDF 全文（最多 50 页，防止超大文件卡死） */
export async function extractPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages = Math.min(pdf.numPages, 50)
  let out = ''
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
    out += line + '\n\n'
  }
  return out.trim()
}
