/**
 * 只允许最新一轮异步请求更新界面。
 *
 * 请求本身未必能被中止（不同模型/Worker 的 fetch 路径不统一），但新消息到来时
 * 可以立刻让旧请求失效。旧请求即使更晚结束，也不能写入回复或清掉新请求状态。
 */
export class LatestRequestGate {
  private version = 0

  begin(): number {
    this.version += 1
    return this.version
  }

  invalidate(): void {
    this.version += 1
  }

  isCurrent(version: number): boolean {
    return version === this.version
  }
}
