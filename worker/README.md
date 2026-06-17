# 伯恩主屋 · 后端 Worker

一个 Cloudflare Worker，同时提供：
- **多端同步主库**（KV 存储，多设备共享同一份记忆）—— 免费
- **聊天 AI 中转**（转发给 Anthropic，key 作为 secret）—— AI 按用量付费，可选

## 部署步骤（约 5 分钟，免费）

> 需要一个 Cloudflare 账号（免费，不用绑卡）。命令在你自己电脑上跑。

```bash
cd worker
npm install

# 1) 登录 Cloudflare
npx wrangler login

# 2) 创建同步用的 KV，把输出的 id 填进 wrangler.toml 的 kv_namespaces.id
npx wrangler kv namespace create MEMORY_KV

# 3)（可选）设置多端同步共享密钥 —— 多设备填同一个
npx wrangler secret put SYNC_KEY

# 4)（可选，启用聊天）设置 Anthropic API key
npx wrangler secret put ANTHROPIC_API_KEY

# 5) 部署
npx wrangler deploy
```

部署成功后会得到一个地址，形如：
`https://burne-home-core.<你的子域>.workers.dev`

把它填到 App 里：
- **设置 → 多端同步 → 主库 Worker 地址**（聊天也用同一个地址）
- 如果设了 `SYNC_KEY`，在「共享密钥」里填同一个值；多台设备填相同的 `空间ID` 和密钥即可共享。

## 端点

| 方法 & 路径 | 作用 |
|---|---|
| `POST /test` | 连通性检查 |
| `GET  /spaces/:spaceId/memories` | 拉取该空间的全部记忆 |
| `POST /spaces/:spaceId/sync` | 增量合并（last-write-wins，含墓碑）并返回权威集合 |
| `POST /chat` | 聊天中转（转发 Anthropic） |

鉴权：若设了 `SYNC_KEY`，同步与聊天端点都需请求头 `X-Sync-Key` 匹配。

## 费用
- Workers + KV：个人用量在免费额度内（10 万请求/天、KV 10 万读/天等）。
- 聊天：按 Anthropic token 用量计费。不设 `ANTHROPIC_API_KEY` 就不启用聊天，纯同步零成本。

## 切换聊天模型
改 `wrangler.toml` 里的 `MODEL`，重新 `wrangler deploy` 即可（想更聪明可换更强的 Claude 模型，想更省可保持当前）。
