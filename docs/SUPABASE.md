# Supabase 多设备同步 · 建表

在 Supabase 后台 **SQL Editor** 里跑下面这段，建一张新表 `bw_state`（不会动你现有 App 的表）。
每个登录用户一行，记忆以 jsonb 数组存储；行级权限（RLS）保证只能读写自己那行。

```sql
-- 1) 建表：每用户一行
create table if not exists public.bw_state (
  user_id    uuid primary key references auth.users on delete cascade default auth.uid(),
  memories   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) 开启行级权限
alter table public.bw_state enable row level security;

-- 3) 只能读写自己那行
create policy "bw_state select own" on public.bw_state
  for select using (auth.uid() = user_id);

create policy "bw_state insert own" on public.bw_state
  for insert with check (auth.uid() = user_id);

create policy "bw_state update own" on public.bw_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 在 App 里用

设置 → **账号 · 多设备同步**：
1. 填 **Supabase URL**（`https://xxx.supabase.co`）和 **anon / publishable key**（后台 Project Settings → API 里能找到）。
2. 用邮箱密码 **注册 / 登录**（多台设备登同一个账号即可共享）。
3. 点 **立即同步**：拉取云端 → 与本地按时间合并 → 写回。

> 安全：anon key 是公开可放前端的，真正保护靠上面的 RLS。AI 的 API Key **不上云**，只留在各设备本地。

## 邮箱验证（可选）

Supabase 默认可能要求邮箱验证。若不想验证，去 Authentication → Providers → Email 关掉 "Confirm email"；
或在 Authentication → Users 里手动确认。
