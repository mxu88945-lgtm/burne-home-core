/**
 * Supabase 多设备同步。
 *   - 邮箱密码登录；同一账号多设备共享。
 *   - 记忆整表存 public.bw_state（每用户一行，jsonb 数组）。
 *   - anonKey 是 publishable key，可放前端；真正的保护靠 RLS（行级权限）。
 *
 * 建表 SQL 见 docs/SUPABASE.md。
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { MemoryItem } from '@/types/memory'
import { mergeMemories } from '@/api/sync'

let client: SupabaseClient | null = null
let clientKey = ''

export function getClient(url?: string, anonKey?: string): SupabaseClient {
  if (!url || !anonKey) throw new Error('未配置 Supabase 地址或 anon key')
  const key = `${url}|${anonKey}`
  if (!client || clientKey !== key) {
    client = createClient(url, anonKey)
    clientKey = key
  }
  return client
}

export async function signIn(
  url: string,
  anonKey: string,
  email: string,
  password: string
): Promise<User | null> {
  const c = getClient(url, anonKey)
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data.user
}

export async function signUp(
  url: string,
  anonKey: string,
  email: string,
  password: string
): Promise<User | null> {
  const c = getClient(url, anonKey)
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data.user
}

export async function signOut(url: string, anonKey: string): Promise<void> {
  const c = getClient(url, anonKey)
  await c.auth.signOut()
}

export async function currentUser(url?: string, anonKey?: string): Promise<User | null> {
  if (!url || !anonKey) return null
  const c = getClient(url, anonKey)
  const { data } = await c.auth.getUser()
  return data.user
}

/** 一次完整同步：拉取远端 → 合并本地 → 写回。返回合并后的集合。 */
export async function supaSyncNow(
  url: string,
  anonKey: string,
  local: MemoryItem[]
): Promise<MemoryItem[]> {
  const c = getClient(url, anonKey)
  const { data: u } = await c.auth.getUser()
  if (!u.user) throw new Error('未登录')

  const { data, error } = await c
    .from('bw_state')
    .select('memories')
    .eq('user_id', u.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const remote = (data?.memories as MemoryItem[] | undefined) ?? []
  const merged = mergeMemories(local, remote)

  const { error: upErr } = await c.from('bw_state').upsert({
    user_id: u.user.id,
    memories: merged,
    updated_at: new Date().toISOString(),
  })
  if (upErr) throw new Error(upErr.message)

  return merged
}
