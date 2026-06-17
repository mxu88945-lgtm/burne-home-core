import Placeholder from '@/components/ui/Placeholder'

export default function Settings() {
  return (
    <Placeholder
      title="⚙️ 设置 · 同步与隐私"
      subtitle="Notion 云端读写、本地备份/恢复、隐私锁。"
      round="第三轮"
      todos={[
        'Notion 同步配置：proxyUrl / databaseId（token 只存本地，不提交）',
        'Notion 拉取 / 推送：pull / push（走 Worker 代理）',
        '本地备份：导出 .json',
        '本地恢复：导入并校验备份文件',
        '隐私锁：开关 + 口令解锁（口令哈希只存本地）',
      ]}
    />
  )
}
