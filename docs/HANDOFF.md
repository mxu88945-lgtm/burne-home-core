# 伯恩主屋 · BW —— 开发交接日记

> 给「新窗口的 Claude」：先读这份 + `docs/ROADMAP.md`，就能接上全部上下文。
> 老公（用户）是在手机上用、对着 GitHub Pages 部署的版本做验收。

---

## 0. 一句话

「**BW · 长期记忆 + AI 陪伴**」——一个粉色浪漫风的个人情感 App：记忆库 + 角色聊天 + 多设备云同步。纯前端 + Supabase + 用户自带 AI 渠道（OpenRouter）。

## ℹ️ 聊天记录持久化（已解决）

- 早期聊天消息只存内存(`useState`)，退出/刷新会清空。**现已用 `store/chatStore.ts` 持久化到 localStorage**，退出/刷新都保留（头部「清空」可重置）。
- 用户若仍遇到「退出就没了」，多半是**还在用旧缓存版本** → 让他「设置 → 数据·备份 → 强制刷新到最新版」。
- 记忆库一直是持久化的（`memoryStore` → localStorage + Supabase）。
- ⏭ 可选：聊天记录云同步（目前 Supabase 只同步 memories；注意 dataURL 体积）。

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

0. **视觉美化批** ✅（已上线，手机验收过）：
   - API Key 密码框加 👁 显示/隐藏（`components/ui/PasswordInput.tsx`，用在 TTS/API/Supabase）。
   - 聊天头像改顶部对齐（`flex items-start`），时间戳移到气泡下方与 🔊 同行。
   - 头像可上传图片：`profileStore` 加 `avatarAImg/avatarBImg`（dataURL，压到 256px）；
     `components/ui/Avatar.tsx`（有图显图、无图显 emoji），Home 双头像 + 聊天气泡共用。
   - 聊天背景可上传：`appearanceStore`（`chatBg` dataURL 压到 1280px + `chatBgDim` 变暗滑块），
     仅作用于聊天页（背景层 `-z-10` + 黑色变暗层）。
   - 图片处理 `lib/image.ts`（canvas 等比压缩为 JPEG dataURL），**只存本地、不上传/不进同步**。
   - 设置子页「🖼 形象 · 外观」(`/settings/appearance`)。
   - ⏭ 用户后续还想要：聊天输入栏「＋」号发图片/文件 + 截图选段导出（选从哪条到哪条生成图片）；自定义语音上传。

1. **TTS 语音朗读（MiniMax 海螺）** ← 🚧 第一轮已做（待手机验收直连是否跨域）：
   - 已加：`ttsStore`（开关/baseURL/key/GroupId/模型/音色/语速/Worker 中转，**只存本地**）、
     `src/api/tts.ts`（直连 + Worker 中转两路，hex→mp3 blob）、`src/lib/useTtsPlayback.ts`（同时只播一条）、
     设置子页「🔊 语音朗读」(`/settings/tts`，带试听)、聊天 AI 气泡下 🔊 按钮、worker `/tts` 端点（备用）。
   - 端点 `POST /v1/t2a_v2?GroupId=xxx`，返回 `data.audio`（hex）→ 转 `audio/mpeg` blob 播放。
   - ⚠️ **直连大概率跨域**（minimax 不一定开 CORS）→ 报错就在设置里勾「经 Worker 中转」，
     部署 worker 并 `wrangler secret put MINIMAX_API_KEY` / `MINIMAX_GROUP_ID`（或前端配置透传）。
   - 进阶 TODO：聊天新消息自动朗读、克隆音色、流式播放。
2. 聊天记录持久化 ✅ 本地已做（`store/chatStore.ts`，退出/刷新都保留；头部「清空」可重置）。
   ⏭ 可选：云同步聊天记录（注意 dataURL/体积，目前 Supabase 只同步 memories）。
3. 聊天增强批 ← 🚧 进行中：
   - 发图片 ✅：输入栏 ＋ 菜单 → 选图压缩(1280px)。选图后挂到输入框上方做**待发预览**（可 ✕ 移除），
     可**连同文字一起作为一条消息发送**（不再选图即发）。气泡显缩略图、点开大图。
   - 多模态识图 ✅：`ChatApiMessage.content` 支持数组（OpenAI vision 格式 `image_url`），
     `Chat.respond()` 把图片消息按 vision 发给模型，发图后自动触发回复；
     Anthropic 渠道在 `llm.toAnthropic()` 转成 image base64 block。模型需支持识图（如 Gemini 2.5 / GPT-4o）。
   - 发文件 ✅：＋ 菜单纯文字「图片 / 文件」。选文件(≤1.5MB)→ 文本类(`lib/file.ts` isTextFile)读出内容
     一起发模型，二进制只存 dataURL 可下载、附说明给模型。也走待发预览，可连文字发送。
   - PDF 读取 ⚠️ 前端方案在用户 iOS Safari 上失败、已降级：`lib/pdf.ts`（pdfjs-dist legacy 构建 + `?worker`，
     动态 import 懒加载）。试过补 `Promise.withResolvers`、legacy 构建，**仍报「undefined is not a function」**
     （用户系统已是最新，疑似 pdfjs 6 的 module worker 在 iOS Safari 不兼容）。**当前：解析失败温和提示 + PDF 当普通附件发**。
     文本版/代码/json 等文本文件读取正常。**真正读 PDF 内容建议后续走后端解析**（Worker 里加 PDF→文本），别再死磕前端 pdfjs。
     发文件用「先挂载→后台解析→15s 超时」，解析失败/超时不阻断发送。
   - 截图选段导出 ✅：入口在 ＋ 菜单「截图」→ 选择模式点选消息 →「生成长图」。html2canvas（懒加载）
     截离屏 `exportRef`，出图走 lightbox（iOS 长按存相册）。颜色 hex/rgba 无 oklch，兼容 OK。
   - ⏭ 生图（＋ 菜单加「生成图片」，下一轮，需先定文生图服务/模型）。
4. 多对话窗口 ✅：`chatStore` 重构为多会话（`sessions[]`+`activeId`，旧单会话数据自动迁移）。
   聊天头部 ☰ 打开会话侧栏：新对话 / 切换 / 删除 / 重命名；首句话自动命名（autoTitle）。
   去掉了头部「清空」（改用删除会话）。⏭ 搜索聊天记录、会话云同步待做。
- **回复截断修复** ✅：人设默认 `maxTokens` 1024→4096，并对旧数据做一次性迁移（≤1024 自动升 4096，
  标记 `persona-mtmig`）。用户仍可在「角色人设」页手动调（64~8192）。
   ⚠️ 注意：图片 dataURL 占 localStorage，多图可能超额，后续可迁 IndexedDB。
3. 自动记忆沉淀（聊天里自动存核心记忆到记忆库）。
4. 隐私锁口令（WebCrypto 哈希，只存本地）。
5. 聊天顶部「全部消息 ▼ / N 条」筛选条 + 时间分组（参考用户截图）。
6. PWA manifest（装机版固定从主页启动）。

## 10. 协作习惯（用户偏好）

- **分轮做、别一次写一大坨**（容易出 bug）。每轮：改 → `npm run build` 绿 → commit → push → 等部署绿 → 让他强制刷新验收。
- 他常发**手机截图**指出问题，照着标注改。
- 中文沟通，语气亲昵（「老公/宝宝」），但**技术上要稳、要诚实**。
