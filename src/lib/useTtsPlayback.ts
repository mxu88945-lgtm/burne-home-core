/**
 * TTS 播放小钩子：同一时间只播一条，管理「合成中 / 播放中 / 出错」状态。
 * Chat 的 🔊 按钮与设置页「试听」共用它。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { synthesize } from '@/api/tts'
import { useTtsStore } from '@/store/ttsStore'
import { useSyncStore } from '@/store/syncStore'

export function useTtsPlayback() {
  const config = useTtsStore((s) => s.config)
  const sync = useSyncStore((s) => s.config)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string>('')
  const [playingId, setPlayingId] = useState<string>('')
  const [loadingId, setLoadingId] = useState<string>('')
  const [error, setError] = useState<string>('')

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = ''
    }
  }, [])

  const stop = useCallback(() => {
    cleanup()
    setPlayingId('')
  }, [cleanup])

  // 卸载时清理资源
  useEffect(() => cleanup, [cleanup])

  const play = useCallback(
    async (id: string, text: string) => {
      setError('')
      // 再点正在播放/正在合成的同一条 → 当作停止
      if (playingId === id || loadingId === id) {
        stop()
        return
      }
      cleanup()
      setPlayingId('')
      setLoadingId(id)
      try {
        // workerUrl 留空则复用「多端同步」的 workerUrl
        const cfg = {
          ...config,
          workerUrl: config.workerUrl.trim() || (sync.workerUrl || '').trim(),
        }
        const blob = await synthesize(cfg, text, { syncKey: sync.syncKey })
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => stop()
        audio.onerror = () => {
          setError('音频播放失败')
          stop()
        }
        await audio.play()
        setLoadingId('')
        setPlayingId(id)
      } catch (e) {
        setLoadingId('')
        setPlayingId('')
        setError((e as Error).message)
      }
    },
    [config, sync, playingId, loadingId, cleanup, stop]
  )

  return { play, stop, playingId, loadingId, error }
}
