const ARCHIVE_RECALL_KEY = 'burne-home-core:archive-recall-enabled'

/** 用户已经明确要接入旧日档案，因此默认开启；没有导入数据时不会产生任何影响。 */
export function isArchiveRecallEnabled(): boolean {
  return localStorage.getItem(ARCHIVE_RECALL_KEY) !== '0'
}

export function setArchiveRecallEnabled(enabled: boolean): void {
  localStorage.setItem(ARCHIVE_RECALL_KEY, enabled ? '1' : '0')
}
