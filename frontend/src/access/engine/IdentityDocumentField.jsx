import { useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdImageSearch } from 'react-icons/md'
import { useAccess } from '../context'

function extractDocumentName(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(?:full\s*name|name|ሙሉ\s*ስም|ስም)\s*[:：-]?\s*(.*)$/i)
    if (match?.[1]) return match[1].trim().slice(0, 120)
    if (match && lines[index + 1] && !/^(?:phone|tel|date|sex|gender|ወሲብ|ስልክ)\b/i.test(lines[index + 1])) {
      return lines[index + 1].slice(0, 120)
    }
  }
  return ''
}

function extractDocumentPhone(text) {
  const match = text.match(/(?:\+?251[\s().-]?[79](?:[\s().-]?\d){8}|0[79](?:[\s().-]?\d){8})/)
  return match?.[0].replace(/[^\d+]/g, '') ?? ''
}

export default function IdentityDocumentField({ value = {}, onChange, qid }) {
  const { tr } = useAccess()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const previewRef = useRef('')

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  const scan = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      onChange({ ...value, scanned: false, reviewRequested: false, documentName: '', documentPhone: '' })
      setStatus(tr('docScanFailed'))
      return
    }

    onChange({ ...value, scanned: false, reviewRequested: false, documentName: '', documentPhone: '' })
    setBusy(true)
    setStatus(tr('docScanWorking'))
    const nextPreviewUrl = URL.createObjectURL(file)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng+amh')
      let text
      try {
        const result = await worker.recognize(file)
        text = result.data.text
      } finally {
        await worker.terminate()
      }
      onChange({
        ...value,
        scanned: true,
        reviewRequested: false,
        documentName: extractDocumentName(text),
        documentPhone: extractDocumentPhone(text),
      })
      setStatus(tr('docScanDone'))
    } catch {
      onChange({ ...value, scanned: false, documentName: '', documentPhone: '' })
      setStatus(tr('docScanFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ax-document-check">
      <p className="ax-hint">{tr('docPrivacy')}</p>
      <div className="ax-row">
        <label className="ax-file-picker">
          <MdCameraAlt aria-hidden="true" /> {tr('docTakePhoto')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            aria-describedby={`${qid}-scan-status`}
            onChange={(event) => {
              scan(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <label className="ax-file-picker">
          <MdImageSearch aria-hidden="true" /> {tr('docBrowseImage')}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            aria-describedby={`${qid}-scan-status`}
            onChange={(event) => {
              scan(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
      </div>
      {previewUrl && <img className="ax-document-preview" src={previewUrl} alt={tr('docPreview')} />}
      <p id={`${qid}-scan-status`} className="ax-scan-status" role="status" aria-live="polite">
        {busy ? tr('docScanWorking') : status}
      </p>
      {value.scanned && (
        <dl className="ax-document-values">
          <dt>{tr('docNameRead')}</dt>
          <dd>{value.documentName || tr('docFieldNotFound')}</dd>
          <dt>{tr('docPhoneRead')}</dt>
          <dd>{value.documentPhone || tr('docFieldNotFound')}</dd>
        </dl>
      )}
      <label className="ax-document-consent">
        <input
          type="checkbox"
          checked={Boolean(value.consent)}
          onChange={(event) => onChange({ ...value, consent: event.target.checked })}
          disabled={busy}
        />
        <span>{tr('docConsent')}</span>
      </label>
      <button
        type="button"
        className="ax-btn ax-btn-ghost"
        onClick={() => onChange({ ...value, scanned: false, reviewRequested: true })}
      >
        {tr('requestHumanReview')}
      </button>
    </div>
  )
}
