import { useState, useEffect } from 'react'
import { fetchAPI } from '@panwatch/api'

const EVENT = 'panwatch:avatar-changed'
const LS_KEY = 'panwatch-avatar'

function readLocal(): string {
  try {
    return localStorage.getItem(LS_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * 保存头像(传空字符串=清空):
 * 1) 先写 localStorage 并广播 —— 立即生效,刷新不丢,不依赖后端新路由是否已部署;
 * 2) 后台同步到后端(多设备/换浏览器),失败不影响本地显示。
 */
export async function saveAvatar(value: string): Promise<void> {
  try {
    if (value) localStorage.setItem(LS_KEY, value)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* 忽略 localStorage 配额错误 */
  }
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: value }))
  try {
    await fetchAPI('/settings/ui_avatar', { method: 'PUT', body: JSON.stringify({ value }) })
  } catch {
    /* 后端同步失败不阻塞本地 */
  }
}

let calibrated = false

/**
 * 当前头像(data URL 或图片地址)。localStorage 优先(刷新即在),
 * 首次再用后端 GET /settings/avatar 校准(多设备同步;旧后端无该路由时忽略错误,保留本地)。
 */
export function useAvatar(): string {
  const [avatar, setAvatar] = useState<string>(readLocal)

  useEffect(() => {
    let alive = true
    if (!calibrated) {
      calibrated = true
      fetchAPI<{ value: string }>('/settings/avatar')
        .then(r => {
          const v = r?.value || ''
          if (!alive || v === readLocal()) return
          // 后端可达即视为权威:有值则采用,空值则清本地;两边都写
          try {
            if (v) localStorage.setItem(LS_KEY, v)
            else localStorage.removeItem(LS_KEY)
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: v }))
        })
        .catch(() => {
          /* 后端旧版无 /settings/avatar 路由或网络错误:保留本地值 */
        })
    }
    const onChange = (e: Event) => setAvatar((e as CustomEvent<string>).detail ?? '')
    window.addEventListener(EVENT, onChange)
    return () => {
      alive = false
      window.removeEventListener(EVENT, onChange)
    }
  }, [])

  return avatar
}

/**
 * 把上传的图片文件压缩为 size×size 的方形 JPEG data URL(居中裁剪),
 * 控制体积(约 10-20KB),避免大 base64 撑爆存储。
 */
export function fileToAvatarDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 不可用'))
          return
        }
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
