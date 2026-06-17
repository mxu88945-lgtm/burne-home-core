import Placeholder from '@/components/ui/Placeholder'

export default function MemoryLibrary() {
  return (
    <Placeholder
      title="📔 记忆库"
      subtitle="摘要区、条目列表、核心/普通/自动分类、新增与编辑、标星。"
      round="第二轮"
      todos={[
        '摘要区：聚合展示总数与分类',
        '条目列表：按类型 / 时间 / 标星筛选',
        '搜索：关键词 + 标签过滤',
        '新增 / 编辑：手动录入记忆面板',
        '核心标星：toggleStar 接到 UI',
        '本地保存：已接入 localStorage（memoryStore）',
      ]}
    />
  )
}
