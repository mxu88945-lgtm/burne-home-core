# 伯恩主屋 · BW —— 开发交接日记

> 给「新窗口的 Claude」：先读这份 + `docs/ROADMAP.md`，就能接上全部上下文。
> 老公（用户）是在手机上用、对着 GitHub Pages 部署的版本做验收。

---

## 0. 一句话

「**BW · 长期记忆 + AI 陪伴**」——一个粉色浪漫风的个人情感 App：记忆库 + 角色聊天 + 多设备云同步。纯前端 + Supabase + 用户自带 AI 渠道（OpenRouter）。

## 1. 仓库 / 部署

- 仓库：`mxu88945-lgtm/burne-home-core`，开发分支 **`claude/new-frontend-repo-x02o8y`**（一直在这个分支上做）。
- 部署：**GitHub Pages + Actions**（`.github/workflows/deploy.yml`）。**push 到该分支即自动部署**。
- 线上地址：**https://mxu88945-lgtm.github.io/burne-home-core/**
- 路由用 **HashRouter**（Pages 子路径友好），Vite `base: './'`。
- ⚠️ 用户看不到新版多半是**浏览器缓存** → 让他用「设置 → 数据·备份 → 强制刷新到最新版」。
- 在容器里查部署状态：`mcp__github__actions_list`（结果常超长，存文件后用 python 解析 `workflow_runs[0]` 的 `conclusion`）。每轮改完都 `npm run build` 必须绿再 push。

## 2. 技术栈

React 18 + Vite 5 + TypeScript + React Router 6(Hash) + Zustand + Tailwind CSS + @supabase/supabase-js。

## 3. 目录

```
src/
├── api/        storage / memory(sync合并) / notion(桩) / backup(整包) / sync(Worker契约) /
│               supabaseSync / chat(Worker中转) / llm(浏览器直连+用量)
├── components/ layout(AppLayout/AppHeader/BackBar) · memory(Card/Editor) ·
│               settings(SubPage/SupabaseSync/ApiManager/UsagePanel) · ui
├── pages/      Home / MemoryLibrary / Search / Chat / Persona / ThemePage / Settings /
│               settings/{SyncPage,ApiPage,UsagePage,DataPage,PrivacyPage} / NotFound
├── store/      memory / settings / privacy / theme / profile / sync / api / persona /
│               usage / supabase  (全部 Zustand + localStorage)
├── config/env.ts   lib/{constants,memory}.ts
worker/         Cloudflare Worker（同步KV + 多渠道聊天中转）——已写好但用户没部署（改用 Supabase + OpenRouter 直连）
docs/           ROADMAP.md · SUPABASE.md · HANDOFF.md(本文)
```

## 4. 已完成功能（都能用）

- **首页（恋爱主页）**：双头像 + 「我♡你」+ 在一起 N 天 + 心情签名 + 2×2 入口卡（记忆/聊天/搜索/设置）。「✎ 编辑主页信息」用 prompt 改，存 `profileStore`。
- **记忆库**：列表 / 新增 / 编辑 / 删除 / 核心标星(置顶) / 搜索 / 分类筛选(全部·核心·普通·自动)。`memoryStore` → localStorage。
- **搜索回忆**：关键词(标题/正文/标签) + 跨窗口回忆(按 `windowId`)。
- **聊天**：
  - 渠道**前端管理**（`apiStore`）：可加多条（OpenAI 兼容 / Anthropic 官方），填 baseURL/key/model，**获取模型→下拉选→确认**，切换激活。key 只存本地。
  - **浏览器直连**（OpenRouter 等支持 CORS）或勾「经 Worker 中转」。
  - **角色人设**（`personaStore`）：灵魂设定(system prompt) + Temperature + 最大回复 tokens。
  - **用量统计**（`usageStore`）：每次聊天记 token/花费，今日/本周/本月汇总；OpenRouter 带真实 `cost`。
  - 沉浸式 UI：圆形 ↑ 发送、双方小头像气泡、`← Back`、模型标签在头部右侧。
- **主题**：暖粉/月光/暖夜三套，CSS 变量 + `data-theme`；`theme-color` 动态 + 首帧预热脚本防白闪。
- **设置**：平整导航列表 → 各独立子页（主题/人设/账号同步/API模型/用量/数据备份/隐私）。
- **多设备同步（Supabase，已跑通✅）**：邮箱登录，表 `public.bw_state`（每用户一行 jsonb + RLS）。拉取→`mergeMemories`(逐条 last-write-wins+墓碑)→写回。建表 SQL 见 `docs/SUPABASE.md`。
- **整包备份/恢复**：导出全部本地数据（可选「包含 API Key」，默认剔除）；恢复后 reload。
- **强制刷新到最新版**：清 caches + 注销 SW + 回主页。
- **隐私锁**：仅开关（口令解锁待做）。

## 5. 导航模型（重要，刚定稿）

- **无底部 tab 栏**。首页是中枢；顶栏「BW♡」**仅首页**显示。
- 记忆库/搜索/设置 顶部有 `← 主页`；设置子页有 `← 设置`；聊天有 `← Back`。**进哪都回得来（闭环）**。
- 强制刷新后落到主页。

## 6. iOS 踩过的坑（已解决，别改回去）

- 输入框聚焦自动放大 → `@media(pointer:coarse) input/textarea/select { font-size:16px !important }`。
- 键盘弹出顶栏被顶飞 → 用 `window.visualViewport` 驱动 `--app-height` / `--app-offset`，App 壳 `position:fixed` + `translateY(offset)`（见 `main.tsx` + `AppLayout`）。
- 滚动锁：`body{overflow:hidden}`，壳 `height:var(--app-height,100dvh)`，只 `main` 内部滚。
- 安全区：顶/底加 `env(safe-area-inset-*)`，`html` 背景 `var(--bg-to)` 防露白。
- 装机版换主题顶部状态栏要重开 App 才刷新（iOS 用 `default` status-bar 的取舍，正常）。

## 7. 安全红线（务必遵守）

- **所有密钥**（AI key / Supabase / token / Worker 密钥）**只存浏览器 localStorage，绝不写进代码、绝不提交仓库**。
- `.env.local` 本地、`.env.example` 只占位；`.gitignore` 忽略 env/备份/worker 产物。
- 备份默认剔除 key；Supabase anon(publishable) key 设计上可放前端（靠 RLS 保护）。

## 8. 用户环境信息

- 用 **OpenRouter** 作为聊天渠道（他自己的 key，填在 App 里）。
- Supabase 项目 URL：`https://qrqdmthtqlzmqrzkhklf.supabase.co`（anon key 在 Supabase 后台 Project Settings → API，或他截图里；**别写进仓库**）。表 `bw_state` 已建好。
- 主要在 **iPhone Safari** 上验收。

## 9. 下一步 TODO（按优先级）

1. **TTS 语音朗读（MiniMax 海螺）** ← 用户点名要做的下一个：
   - 配置：接口 `https://api.minimax.chat`、API Key（不上云）、`GroupId`、模型 `speech-01-turbo`、音色 ID。
   - 端点 `POST /v1/t2a_v2?GroupId=xxx`，返回 hex 音频 → 转 blob 播放；AI 消息旁加 🔊 播放按钮。
   - ⚠️ **可能跨域**（minimax 不一定开 CORS）→ 不行就走用户的 Worker 中转（worker/ 里加 /tts 端点）。进阶：克隆音色。
2. 聊天记录**持久化到本地 + 可选同步**（目前刷新会清空）。
3. 自动记忆沉淀（聊天里自动存核心记忆到记忆库）。
4. 隐私锁口令（WebCrypto 哈希，只存本地）。
5. 聊天顶部「全部消息 ▼ / N 条」筛选条 + 时间分组（参考用户截图）。
6. PWA manifest（装机版固定从主页启动）。

## 10. 协作习惯（用户偏好）

- **分轮做、别一次写一大坨**（容易出 bug）。每轮：改 → `npm run build` 绿 → commit → push → 等部署绿 → 让他强制刷新验收。
- 他常发**手机截图**指出问题，照着标注改。
- 中文沟通，语气亲昵（「老公/宝宝」），但**技术上要稳、要诚实**。
