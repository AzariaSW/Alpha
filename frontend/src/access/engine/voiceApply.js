import { pick } from '../translation helper'
import { matchOptions, spokenToDigits } from '../voice'

// Turn a reviewed transcript into a field value. Returns { ok, value } or { ok: false, message }.
export function applyVoice(step, text, current, tr, lang, simple) {
  const said = text.trim()
  if (!said) return { ok: false, message: tr('voiceNoSpeech') }
  const labelOf = (o) => pick(o.label, lang, simple)

  if (step.type === 'tel') {
    const digits = spokenToDigits(said)
    if (digits.length < 5) return { ok: false, message: tr('voiceNoNumber') }
    return { ok: true, value: digits }
  }
  if (step.type === 'email') {
    const email = said
      .toLowerCase()
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+(underscore|dash|hyphen)\s+/g, (_, word) => word === 'underscore' ? '_' : '-')
      .replace(/\s+/g, '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: tr('voiceEmailHelp') }
    }
    return { ok: true, value: email }
  }
  if (step.type === 'date' || step.type === 'birth') {
    if (!/\b\d{4}\b/.test(said)) return { ok: false, message: tr('voiceDateHelp') }
    const date = new Date(said)
    if (Number.isNaN(date.getTime())) return { ok: false, message: tr('voiceDateHelp') }
    const value = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    return step.type === 'birth'
      ? { ok: true, value: { cal: 'gregorian', d: value.slice(8), m: value.slice(5, 7), y: value.slice(0, 4) } }
      : { ok: true, value }
  }
  if (step.type === 'identityDocument') {
    const next = { ...current }
    if (/i agree|i consent|i give permission/i.test(said)) next.consent = true
    if (/i do not agree|i do not consent/i.test(said)) next.consent = false
    if (/\b(human|staff|person)\s+review\b|\bcannot scan\b/i.test(said)) {
      next.reviewRequested = true
      next.scanned = false
      return { ok: true, value: next }
    }
    if (next.consent !== current?.consent) return { ok: true, value: next }
    return { ok: false, message: tr('docVoiceHelp') }
  }
  if (step.type === 'refugeeId') {
    const fin = said.replace(/^(?:my )?fin(?: is)?\s+/i, '').trim().toUpperCase()
    if (!fin) return { ok: false, message: tr('idFinRequired') }
    return { ok: true, value: { ...(current || {}), mode: 'manual', fin, match: null, checked: false } }
  }
  if (step.type === 'choice') {
    const m = matchOptions(said, step.options, labelOf)
    if (!m.length) return { ok: false, message: tr('voiceNoMatch') }
    if (m.length > 1 && m[0].score === m[1].score) return { ok: false, message: tr('voiceAmbiguous') }
    return { ok: true, value: m[0].option.value }
  }
  if (step.type === 'multi') {
    const m = matchOptions(said, step.options, labelOf)
    if (!m.length) return { ok: false, message: tr('voiceNoMatch') }
    const merged = new Set([...(current || []), ...m.map((x) => x.option.value)])
    return { ok: true, value: step.options.map((o) => o.value).filter((v) => merged.has(v)) }
  }
  if (step.type === 'textarea' && current) return { ok: true, value: `${current} ${said}` }
  return { ok: true, value: said }
}
