import Placeholder from '@/components/ui/Placeholder'

export default function Search() {
  return (
    <Placeholder
      title="🔍 搜索回忆"
      subtitle="全文搜索 + 跨窗口回忆：在新窗口里召回旧窗口的记忆。"
      round="第二轮"
      todos={[
        '关键词搜索：标题 / 正文 / 标签',
        '过滤器：类型、是否核心、标签',
        '跨窗口回忆：按 windowId 聚合召回',
        '结果高亮与跳转编辑',
      ]}
    />
  )
}
