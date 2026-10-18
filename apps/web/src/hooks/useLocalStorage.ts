import { useCallback, useEffect, useRef, useState } from 'react'

export interface Codec<T> {
  parse: (raw: string) => T
  stringify: (value: T) => string
}

export const jsonCodec: Codec<any> = { parse: JSON.parse, stringify: JSON.stringify }

/** 只接受陣列的 JSON,資料壞掉時退回初始值 */
export const arrayCodec: Codec<any[]> = {
  parse: (raw) => {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error('not an array')
    return value
  },
  stringify: JSON.stringify,
}

/** 原樣存取字串(沿用舊版 userEmail 不加引號的格式) */
export const rawCodec: Codec<string | null> = {
  parse: (raw) => raw,
  stringify: (value) => value ?? '',
}

/**
 * 與 localStorage 同步的 state。沿用舊版靜態網站的 key,所以瀏覽器裡既有的資料可以直接使用;
 * 也會監聽其他分頁的變更(例如後台改了商品,前台分頁會即時更新)。
 */
export function useLocalStorage<T>(key: string, initial: T, codec: Codec<T> = jsonCodec) {
  const initialRef = useRef(initial)
  const codecRef = useRef(codec)

  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initialRef.current : codecRef.current.parse(raw)
    } catch {
      return initialRef.current
    }
  }, [key])

  const [value, setValue] = useState<T>(read)

  useEffect(() => {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, codecRef.current.stringify(value))
    } catch {
      // 隱私模式或空間已滿時,就只保留在記憶體中
    }
  }, [key, value])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setValue(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, read])

  return [value, setValue] as const
}
