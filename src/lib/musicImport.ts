/**
 * 导入音乐文件（首页播放器的「＋添加音乐」和聊天里点歌小条共用）：
 * 音频本体存 IndexedDB `music:{id}`，同名 .lrc/.txt 当歌词一起存，元数据加进歌单。
 * 不限制文件类型（iOS 上 accept 会把「文件」里的音频藏起来），只跳过图片/视频和歌词文件本身。
 */
import { idbSet } from '@/lib/idb'
import { useMusicStore, musicTrackId, type MusicTrack } from '@/store/musicStore'

const base = (n: string) => n.replace(/\.[^.]+$/, '')

export async function importMusicFiles(files: FileList | File[] | null): Promise<{ tracks: MusicTrack[]; lyricFiles: File[] }> {
  const all = files ? Array.from(files) : []
  const lyricFiles = all.filter((f) => /\.(lrc|txt)$/i.test(f.name))
  const tracks: MusicTrack[] = []
  for (const f of all) {
    if (/\.(lrc|txt)$/i.test(f.name)) continue
    if (/^(image|video)\//.test(f.type)) continue
    const id = musicTrackId()
    await idbSet(`music:${id}`, f)
    const lrc = lyricFiles.find((l) => base(l.name) === base(f.name))
    if (lrc) await idbSet(`lyric:${id}`, await lrc.text())
    tracks.push({ id, name: base(f.name), hasLyrics: !!lrc })
  }
  if (tracks.length) useMusicStore.getState().addTracks(tracks)
  return { tracks, lyricFiles }
}
