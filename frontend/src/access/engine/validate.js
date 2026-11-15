import { pick } from '../translation helper.js'

export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
  || (v && typeof v === 'object' && 'cal' in v && !v.d && !v.m && !v.y)

export const normalizeBirthDate = (value) => isEmpty(value) ? undefined : value

function calendarToday(calendar) {
  if (calendar === 'gregorian') {
    const [year, month, day] = new Date().toISOString().slice(0, 10).split('-').map(Number)
    return { year, month, day }
  }
  const parts = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date())
  return Object.fromEntries(parts
    .filter(({ type }) => ['year', 'month', 'day'].includes(type))
    .map(({ type, value }) => [type, Number(value)]))
}

function validLegacyDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && value <= new Date().toISOString().slice(0, 10)
}

function validBirthEntry(value) {
  if (typeof value === 'string') return validLegacyDate(value)
  if (!value || typeof value !== 'object' || !['gregorian', 'ethiopian'].includes(value.cal)) return false

  const { cal, d, m, y } = value
  if (![d, m, y].every((part) => typeof part === 'string' && /^\d*$/.test(part))
    || d.length > 2 || m.length > 2 || y.length > 4) return false
  if (!d && !m && !y) return true
  if (!/^\d{4}$/.test(y)) return false

  const today = calendarToday(cal)
  const year = Number(y)
  if (year < 1 || year > today.year) return false
  if (!d && !m) return true
  if (!d || !m) return false

  const month = Number(m)
  const day = Number(d)
  if (cal === 'gregorian') {
    return validLegacyDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
  }
  const maxDay = month === 13 ? (year % 4 === 3 ? 6 : 5) : 30
  if (month < 1 || month > 13 || day < 1 || day > maxDay) return false
  return year < today.year
    || (year === today.year && (month < today.month || (month === today.month && day <= today.day)))
}

// Returns a plain-language message, or '' when the answer is fine.
export function validateStep(step, value, answers, tr, lang, simple) {
  if (step.type === 'info') return ''
  if (isEmpty(value)) {
    if (!step.required) return ''
    if (step.requiredMsg) return pick(step.requiredMsg, lang, simple)
    if (step.type === 'choice') return tr('err.requiredChoice')
    if (step.type === 'multi') return tr('err.requiredMulti')
    return tr('err.required')
  }
  if (step.type === 'tel') {
    const digits = String(value).replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) return tr('err.phone')
  }
  if (step.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) {
    return tr('err.email')
  }
  if (step.type === 'date' || step.type === 'birth') {
    if (!(step.type === 'birth' ? validBirthEntry(value) : validLegacyDate(value))) {
      return tr('err.date')
    }
  }
  if (typeof value === 'string' && step.maxLength && value.length > step.maxLength) {
    return tr('err.tooLong', { n: step.maxLength })
  }
  if (step.mustBe && value !== step.mustBe) return pick(step.mustBeMsg, lang, simple)
  if (step.validate) return pick(step.validate(value, answers), lang, simple)
  return ''
}
