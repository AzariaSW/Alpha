import { useState } from 'react'
import { MdDocumentScanner, MdEdit, MdSync } from 'react-icons/md'
import { useAccess } from '../context'
import { speak } from '../voice'

function extractFin(text) {
  const match = text.match(/\bF[\s.-]*I[\s.-]*N(?:\s*(?:NO\.?|NUMBER|#))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{3,31})/i)
  return match?.[1]?.replace(/[.,;:]+$/, '').toUpperCase() ?? ''
}

async function checkFin(payload) {
  const response = await fetch('/api/v1/learners/refugee-id/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || 'FIN check failed')
  return result
}

export default function RefugeeIdField({ value = {}, onChange, error, qid }) {
  const { tr, lang, prefs } = useAccess()
  const [mode, setMode] = useState(value.mode || 'scan')
  const [status, setStatus] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [checkBusy, setCheckBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const update = (patch, nextMode = mode) => {
    setMode(nextMode)
    setNotice('')
    onChange({ ...value, ...patch, mode: nextMode, match: null, checked: false })
  }

  const scan = async (file) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      setStatus(tr('idScanFailed'))
      return
    }
    setScanBusy(true)
    setStatus(tr('idScanWorking'))
    if (prefs?.voiceGuidance) speak(tr('idScanWorking'), lang)
    setNotice('')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      let text
      try {
        const result = await worker.recognize(file)
        text = result.data.text
      } finally {
        await worker.terminate()
      }
      const documentFin = extractFin(text)
      update({ documentFin, fin: '', match: null, checked: false }, 'scan')
      setStatus(documentFin ? tr('idScanDone') : tr('idScanFailed'))
      if (prefs?.voiceGuidance) speak(documentFin ? tr('idScanDone') : tr('idScanFailed'), lang)
    } catch {
      setStatus(tr('idScanFailed'))
      if (prefs?.voiceGuidance) speak(tr('idScanFailed'), lang)
    } finally {
      setScanBusy(false)
    }
  }

  const compare = async () => {
    setCheckBusy(true)
    setNotice('')
    if (prefs?.voiceGuidance) speak(tr('sending'), lang)
    try {
      const result = await checkFin({ documentFin: value.documentFin, fin: value.fin })
      if (result.textMatch) {
        onChange({ ...value, mode: 'scan', match: true, checked: true })
        setNotice(tr('idMatch'))
        if (prefs?.voiceGuidance) speak(tr('idMatch'), lang)
      } else {
        onChange({ ...value, mode: 'scan', match: false, checked: true })
        setNotice(tr('idMismatch'))
        if (prefs?.voiceGuidance) speak(tr('idMismatch'), lang)
      }
    } catch {
      setNotice(tr('idCheckFailed'))
      if (prefs?.voiceGuidance) speak(tr('idCheckFailed'), lang)
    } finally {
      setCheckBusy(false)
    }
  }

  const continueManual = async () => {
    setCheckBusy(true)
    setNotice('')
    if (prefs?.voiceGuidance) speak(tr('sending'), lang)
    try {
      await checkFin({ fin: value.fin })
      onChange({ ...value, mode: 'manual', checked: true, match: null })
      setNotice(tr('idManualOnly'))
      if (prefs?.voiceGuidance) speak(tr('idManualOnly'), lang)
    } catch {
      setNotice(tr('idCheckFailed'))
      if (prefs?.voiceGuidance) speak(tr('idCheckFailed'), lang)
    } finally {
      setCheckBusy(false)
    }
  }

  return (
    <div>
      <p className="ax-hint">{tr('idCheckHint')}</p>
      <div className="ax-row" role="group" aria-label={tr('idCheckTitle')}>
        <button type="button" className="ax-btn ax-btn-small" aria-pressed={mode === 'scan'} onClick={() => update({}, 'scan')}>
          <MdDocumentScanner aria-hidden="true" /> {tr('idUseScan')}
        </button>
        <button type="button" className="ax-btn ax-btn-small" aria-pressed={mode === 'manual'} onClick={() => update({}, 'manual')}>
          <MdEdit aria-hidden="true" /> {tr('idUseManual')}
        </button>
      </div>

      {mode === 'scan' ? (
        <section className="ax-scan-panel" aria-labelledby={`${qid}-scan-title`}>
          <h4 id={`${qid}-scan-title`}>{tr('idScanHeading')}</h4>
          <p className="ax-hint">{tr('idPrivacy')}</p>
          <label className="ax-file-picker">
            <MdDocumentScanner aria-hidden="true" /> {tr('idScanButton')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => scan(event.target.files?.[0])}
              aria-describedby={`${qid}-scan-status`}
            />
          </label>
          <p id={`${qid}-scan-status`} className="ax-scan-status" role="status" aria-live="polite">
            {scanBusy ? tr('idScanWorking') : status}
          </p>
          <label className="ax-label-small" htmlFor={`${qid}-document-fin`}>{tr('idDocumentFin')}</label>
          <input
            className="ax-input"
            id={`${qid}-document-fin`}
            value={value.documentFin ?? ''}
            autoComplete="off"
            onChange={(event) => update({ documentFin: event.target.value.toUpperCase() })}
          />
          <label className="ax-label-small" htmlFor={`${qid}-confirm-fin`}>{tr('idEnteredFin')}</label>
          <input
            className="ax-input"
            id={`${qid}-confirm-fin`}
            value={value.fin ?? ''}
            autoComplete="off"
            onChange={(event) => update({ fin: event.target.value.toUpperCase() })}
          />
          <button
            type="button"
            className="ax-btn ax-btn-primary"
            onClick={compare}
            disabled={checkBusy || scanBusy || !value.documentFin?.trim() || !value.fin?.trim()}
          >
            <MdSync aria-hidden="true" /> {checkBusy ? tr('sending') : tr('idCompare')}
          </button>
        </section>
      ) : (
        <section className="ax-scan-panel" aria-labelledby={`${qid}-manual-title`}>
          <h4 id={`${qid}-manual-title`}>{tr('idManualHeading')}</h4>
          <label className="ax-label-small" htmlFor={`${qid}-manual-fin`}>{tr('idEnteredFin')}</label>
          <input
            className="ax-input"
            id={`${qid}-manual-fin`}
            value={value.fin ?? ''}
            autoComplete="off"
            onChange={(event) => update({ fin: event.target.value.toUpperCase() }, 'manual')}
          />
          <p className="ax-hint">{tr('idPrivacy')}</p>
          <button type="button" className="ax-btn ax-btn-primary" onClick={continueManual} disabled={checkBusy || !value.fin?.trim()}>
            <MdSync aria-hidden="true" /> {checkBusy ? tr('sending') : tr('idSubmitManual')}
          </button>
        </section>
      )}
      {notice && (
        <p className={value.match === false ? 'ax-mismatch' : 'ax-match'} role={value.match === false ? 'alert' : 'status'} aria-live="polite">
          {notice}
        </p>
      )}
      {error && <p className="ax-error" role="alert">{error}</p>}
    </div>
  )
}
