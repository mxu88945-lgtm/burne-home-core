# 伯恩主屋 · 长期记忆系统 —— 实现路线图

> 原则：**分轮实现，框架先行**。每一轮先搭可点可看的框架，确认无误后再填真实逻辑，避免一次写太多、排错排到头麻。
>
> 安全红线（贯穿全程）：**Notion token / AI key / 带密钥的 Worker 地址，绝不提交仓库、绝不写死在代码**。敏感值只存 `.env.local`（非密钥项）或浏览器 localStorage（token），真正的密钥放在 Worker 后端的 secret 里。

---

## 第一轮 ✅（已完成）

- 项目骨架：React + Vite + TS + React Router + Zustand + Tailwind
- 数据结构（`src/types/memory.ts`）、状态管理（`src/store/*`）、API 目录（`src/api/*`）
- 三主题系统（暖粉 / 月光 / 暖夜）+ 手机 App 风布局（顶栏 + 底部 5 Tab）
- 页面：恋爱主页 / 记忆库（摘要） / 聊天（UI 壳） / 回忆 / 设置
- 部署：GitHub Pages 自动化（push 即部署）

---

## 第二轮 🔜 记忆库真实功能

目标：让「记忆库」「回忆」两页真正能用，全部本地优先（localStorage 已就绪）。

### 步骤
1. **条目列表**：渲染 `memoryStore.memories`，按类型（核心/普通/自动）分组或筛选，按时间倒序。
2. **新增 / 编辑面板**：底部弹层表单（标题、正文、类型、标签）。复用 `memoryStore.addMemory / updateMemory`。
3. **核心标星**：列表项上的星标按钮 → `memoryStore.toggleStar`；核心记忆置顶。
4. **删除**：滑动或长按 → `memoryStore.removeMemory`，带二次确认。
5. **搜索页（回忆）**：
   - 关键词搜索：标题 / 正文 / 标签。
   - 过滤器：类型、是否核心、标签。
   - **跨窗口回忆**：按 `windowId` 聚合，召回「别的窗口/会话」里产生的记忆。
6. **空状态**：没有记忆时给温柔的引导插画 + 「写下第一条记忆」。

### 涉及文件
- `src/pages/MemoryLibrary.tsx`、`src/pages/Search.tsx`
- 新增 `src/components/memory/*`（MemoryCard / MemoryEditor / FilterBar）
- `src/store/memoryStore.ts`（已具备 CRUD，按需补 `replaceAll`、批量导入）

### 不在本轮
- 任何云端 / 网络逻辑（放第三轮）

---

## 第三轮 🔮 同步 · 备份 · 隐私 · 聊天后端

### A. Notion 云端同步

**架构**：前端不直接调 Notion API，统一**走自建 Worker 代理**，密钥留在 Worker 后端。

```
前端 (本仓库)  ──HTTPS──►  Cloudflare Worker 代理  ──►  Notion API
   │                          │
   │ 不含任何密钥              │ Notion token = Worker secret（wrangler secret put）
   │ 只带非敏感配置/可选本地token │
```

**代理契约**（前端按此调用，见 `src/api/notion.ts`）：

| 方法 & 路径 | 作用 | 请求 | 响应 |
|---|---|---|---|
| `POST {proxyUrl}/test` | 校验连通性 | 头部携带配置 | `{ ok: boolean }` |
| `GET  {proxyUrl}/memories` | 拉取 | — | `{ memories: MemoryItem[] }` |
| `POST {proxyUrl}/memories` | 推送/更新 | `{ memories: MemoryItem[] }` | `{ pushed: number }` |

请求头：
- `X-Notion-Database`：数据库 ID（非敏感，可选）。
- `X-Notion-Token`：**仅当本地存了 token 时**才发送；推荐让 Worker 自己持有 token，前端一个密钥都不带。

**接入步骤**：
1. 写 Worker（单独仓库/目录），用 `wrangler secret put NOTION_TOKEN` 存密钥。
2. Worker 实现上面三个端点，做 Notion 属性 ↔ `MemoryItem` 的字段映射。
3. 前端在「设置 → Notion 同步」填 `proxyUrl` / `databaseId`（存本地），点测试连接。
4. 完成 `src/api/notion.ts` 里标了 `TODO(round3)` 的字段映射与校验。
5. 冲突处理：用 `updatedAt` + `notionPageId` 做增量与去重（后写覆盖 / 合并策略二选一）。
6. 设置页接上拉取 / 推送按钮 + 同步状态展示（`settingsStore.syncStatus`）。

**环境变量**（`.env.local`，均非密钥）：
```
VITE_NOTION_PROXY_URL=https://your-worker.example.workers.dev
VITE_NOTION_DATABASE_ID=xxxxxxxx
```

### B. 本地备份 / 恢复
- 导出：`backup.downloadBackup` 已实现，导出 `*.memory-backup.json`（已被 .gitignore 忽略）。
- 恢复：`backup.parseBackup` 校验后 `memoryStore.replaceAll`。
- 第三轮补：定时备份提醒、合并式恢复（而非整体覆盖）。

### C. 隐私锁
1. 设置页开关已就绪（`privacyStore`）。
2. 第三轮接：设置本地口令（用 WebCrypto 做哈希，**只存哈希在本地**）。
3. `PrivacyGate` 覆盖层：启用且锁定时挡住全站，输入口令解锁。
4. 进阶：闲置自动上锁、记忆内容本地加密存储（口令派生密钥）。

### D. 聊天后端（AI 接入）
- 复用同一套「Worker 代理」模式：前端 → Worker → 模型 API，**AI key 作为 Worker secret**。
- 流式输出、把对话持久化到本地（或同步 Notion）。
- 默认选用最新、能力最强的 Claude 模型。

---

## 跨轮约定
- 每加一块功能：先 UI 壳 → 接 store → 接 API（经 Worker）→ 联调。
- 所有外部请求经 Worker 代理；前端打包产物里**不出现任何密钥**。
- `npm run build` 必须绿；push 到开发分支即自动部署到 GitHub Pages。
