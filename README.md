# 伯恩主屋版 · 长期记忆系统（前端）

一个本地优先的个人长期记忆应用前端。记忆分核心 / 普通 / 自动三类，支持跨窗口回忆、搜索、手动新增编辑、Notion 云端同步、本地备份恢复与隐私锁。

> 当前状态：**最小可运行骨架**。功能分轮逐步实现，不一次写全。

## 技术栈

- React 18 + TypeScript
- Vite 5
- React Router 6
- Zustand（状态管理，本地优先）
- Tailwind CSS（「主屋」温柔配色）

## 快速开始

```bash
npm install
cp .env.example .env.local   # 按需填入自己的值（.env.local 不会被提交）
npm run dev                  # http://localhost:5173
```

其他命令：

```bash
npm run build       # 类型检查 + 打包
npm run typecheck   # 仅类型检查
npm run preview     # 预览构建产物
```

## 目录结构

```
src/
├── api/            # 数据访问层（storage 已可用；notion / backup 为桩）
│   ├── storage.ts  # localStorage 封装
│   ├── notion.ts   # Notion 云端读写（第三轮）
│   └── backup.ts   # 本地备份 / 恢复（第二轮）
├── components/
│   ├── layout/     # AppLayout / Sidebar / TopBar
│   └── ui/         # 通用组件（Placeholder 等）
├── config/
│   └── env.ts      # 环境变量统一入口（不读敏感 token）
├── lib/
│   └── constants.ts# 常量与 localStorage key 命名空间
├── pages/          # Home / MemoryLibrary / Search / Settings / NotFound
├── router/         # 路由表
├── store/          # Zustand：memory / settings / privacy
└── types/
    └── memory.ts   # 核心数据结构（地基）
```

## 状态管理方案

- `memoryStore`：记忆条目的增删改查、标星、摘要聚合，持久化到 localStorage。
- `settingsStore`：Notion 同步配置（敏感字段只存本地）与同步状态。
- `privacyStore`：隐私锁开关与运行时解锁标记。

## 安全约定（务必遵守）

- **Notion token / GitHub token / 带密钥的 Worker 地址绝不提交仓库、绝不写死在代码。**
- 敏感值只放 `.env.local`（已被 `.gitignore` 忽略）；`.env.example` 只放占位符。
- 推荐 Notion 同步走自建 Worker 代理，让 token 完全不出现在前端产物里。
- 本地备份导出文件可能含个人记忆内容，已在 `.gitignore` 忽略（`backups/`、`*.memory-backup.json`）。

## 实现路线

- **第一轮（本次）**：项目结构、数据结构、页面模块、状态管理、API 目录、最小可运行版本。
- **第二轮**：记忆库页面 —— 摘要区、条目列表、搜索、新增、核心标星、本地保存。
- **第三轮**：Notion 同步配置区（token 只存本地）、本地备份/恢复、隐私锁。
```
