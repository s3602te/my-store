/**
 * 時間工具。本系統固定使用台北時間(UTC+8,沒有夏令時間)。
 * 資料庫存的時間都是 UTC 的「絕對時間點」;只有「營業日」與「營業時間」需要換算成台北時間。
 */

const TAIPEI_OFFSET_HOURS = 8
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

interface TaipeiParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 把一個時間點拆成「台北時間」的年月日時分 */
export function taipeiParts(date: Date): TaipeiParts {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/** 營業日(台北時間的日期),用來存進資料庫的 DATE 欄位(UTC 午夜) */
export function businessDateOf(date: Date): Date {
  const { year, month, day } = taipeiParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** 台北時間的日期字串 YYYY-MM-DD */
export function formatTaipeiDate(date: Date): string {
  const { year, month, day } = taipeiParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** "06:30" → 390(從午夜起算的分鐘數) */
export function hhmmToMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number)
  return hour * 60 + minute
}

/** 這個時間點在台北時間是當天的第幾分鐘 */
export function minutesOfDay(date: Date): number {
  const { hour, minute } = taipeiParts(date)
  return hour * 60 + minute
}

/** 「某個時間點所在的台北日期」的 HH:mm,換算成絕對時間點。例如 taipeiTimeOnSameDay(現在, "13:00") */
export function taipeiTimeOnSameDay(date: Date, hhmm: string): Date {
  const { year, month, day } = taipeiParts(date)
  const minutes = hhmmToMinutes(hhmm)
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60) - TAIPEI_OFFSET_HOURS, minutes % 60))
}

/** 是否在營業時間內(含開始、不含結束) */
export function isWithinHours(date: Date, openTime: string, closeTime: string): boolean {
  const now = minutesOfDay(date)
  return now >= hhmmToMinutes(openTime) && now < hhmmToMinutes(closeTime)
}

/** 台北時間的 HH:mm(給錯誤訊息顯示用) */
export function formatTaipeiHHmm(date: Date): string {
  const { hour, minute } = taipeiParts(date)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
