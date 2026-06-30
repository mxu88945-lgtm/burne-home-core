# 伯恩主屋 · 后端 Worker

一个 Cloudflare Worker，同时提供：
- **多端同步主库**（KV 存储，多设备共享同一份记忆）—— 免费
- **聊天 AI 中转**（多渠道：Anthropic 官方 / OpenAI 兼容或自有网关）—— 按你的渠道用量计费

## 一、注册 Cloudflare（没账号看这里，免费不绑卡）

1. 打开 https://dash.cloudflare.com/sign-up ，用邮箱注册并在邮箱里点验证链接。
2. 登录后停在仪表盘即可（Workers 免费版无需绑卡、无需买域名，用 `*.workers.dev` 子域）。

## 二、装工具并部署（在你自己电脑上跑）

需要 Node.js（https://nodejs.org 装 LTS 版）。然后：

```bash
cd worker
npm install

# 1) 登录（会弹浏览器授权）
npx wrangler login

# 2) 创建同步用的 KV，把输出里的 id 粘到 wrangler.toml 的 kv_namespaces.id
npx wrangler kv namespace create MEMORY_KV

# 3)（可选）多端同步共享密钥，多设备填同一个
npx wrangler secret put SYNC_KEY

# 4) 配置聊天渠道的 key（按需，至少配一个）：
npx wrangler secret put OPENAI_API_KEY      # OpenAI 兼容 / 你的自有网关 key
npx wrangler secret put ANTHROPIC_API_KEY   # Anthropic 官方 key

# 5) 部署
npx wrangler deploy
```

部署成功会得到地址：`https://burne-home-core.<你的子域>.workers.dev`

## 三、填进 App

设置页里：
- **多端同步 → 主库 Worker 地址**：填上面的地址（聊天也用同一个）。
- 设了 `SYNC_KEY` 就在「共享密钥」填同一个；多设备用相同的「空间ID」+ 密钥即可共享。
- **聊天渠道**：选「Anthropic 官方」或「OpenAI 兼容」，或留「默认」用 Worker 配的。

## 多渠道配置（你自己的 API 通道）

`wrangler.toml` 的 `[vars]`（非密钥）控制默认渠道与各渠道的 base URL / 模型：

```toml
[vars]
DEFAULT_PROVIDER = "openai"        # 默认走哪条线
MODEL = "gpt-4o-mini"              # 通用兜底模型
# OPENAI_BASE_URL = "https://你的网关/v1"   # 指向你自己的 OpenAI 兼容网关
# OPENAI_MODEL = "..."
# ANTHROPIC_BASE_URL = "https://api.anthropic.com"
# ANTHROPIC_MODEL = "claude-sonnet-4-6"
```

key 始终用 `wrangler secret put` 设置，**不写进 wrangler.toml、不进仓库**。
改完 `[vars]` 重新 `npx wrangler deploy` 生效。

## 端点

| 方法 & 路径 | 作用 |
|---|---|
| `POST /test` | 连通性检查 |
| `GET  /spaces/:spaceId/memories` | 拉取该空间全部记忆 |
| `POST /spaces/:spaceId/sync` | 增量合并（last-write-wins，含墓碑）并返回权威集合 |
| `POST /chat` | 聊天中转（body 可带 `provider` / `model` 覆盖） |
| `POST /models` | 拉取模型列表中转（body 带 `provider` / `baseUrl` / `apiKey`，解决 https 页面直连 http 上游的混合内容拦截） |

鉴权：设了 `SYNC_KEY` 时，同步与聊天端点都需请求头 `X-Sync-Key` 匹配。

## 费用
- Workers + KV：个人用量在免费额度内。
- 聊天：按你所用渠道的 token 计费；不配任何聊天 key 就纯同步，零成本。
