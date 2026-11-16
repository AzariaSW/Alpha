import { useEffect, useRef, useState } from 'react'
import { MdContrast, MdRemove, MdAdd, MdVolumeUp, MdPause, MdTextFields, MdVisibility } from 'react-icons/md'
import './access.css'
import { AccessContext, useAccess } from './context'
import { translate } from './translation helper'
import { store, saveSupport } from './store'
import { supportRequestSchema } from './schemas'
import FormEngine from './engine/FormEngine'
import { speak, stopSpeaking } from './voice'

const SIZES = ['ax-s0', 'ax-s1', 'ax-s2', 'ax-s3', 'ax-s4']
const MAX_SIZE = SIZES.length - 1

function readPrefs() {
  const saved = store.get('prefs', {})
  const size = Math.max(0, Math.min(MAX_SIZE, Number(saved.size) || 0))
  return {
    simple: false,
    contrast: false,
    voiceGuidance: false,
    ...saved,
    size,
  }
}

function SupportDialog({ dialogRef, openCount, onClose }) {
  const { tr } = useAccess()
  return (
    <dialog ref={dialogRef} className="ax-dialog" onClose={onClose} aria-label={tr('supportTitle')}>
      {openCount > 0 && <FormEngine
        key={openCount}
        schema={supportRequestSchema}
        showSupportButton={false}
        onSubmit={async (a) => {
          saveSupport({ needs: a.support, note: a.note, replyVia: a.replyVia, phone: a.phone, requested: true })
        }}
        doneContent={() => (
          <>
            <p>{tr('supportDone')}</p>
            <button type="button" className="ax-btn ax-btn-primary" onClick={() => dialogRef.current?.close()}>{tr('close')}</button>
          </>
        )}
      />}
      <button type="button" className="ax-btn ax-btn-ghost ax-dialog-close" onClick={() => dialogRef.current?.close()}>{tr('close')}</button>
    </dialog>
  )
}

// Provides language, simple mode, text size and contrast, and the private-support dialog.
// Components wrap themselves in this; nested uses reuse the outer one.
export default function AccessShell({ children, className = '' }) {
  const outer = useAccess()
  const [prefs, setPrefs] = useState(() => ({ ...readPrefs(), lang: 'en' }))
  const [supportOpen, setSupportOpen] = useState(0)
  const dialogRef = useRef(null)
  const [sizeToast, setSizeToast] = useState('')
  const toastTimer = useRef(null)
  const contrast = !!prefs.contrast

  // Colour the whole page, not only the form, so high contrast has no white edges.
  useEffect(() => {
    if (outer.inShell) return
    const root = document.documentElement
    root.classList.add('ax-page')
    root.classList.toggle('ax-page-hc', contrast)
    return () => root.classList.remove('ax-page', 'ax-page-hc')
  }, [outer.inShell, contrast])

  useEffect(() => {
    if (outer.inShell) return undefined
    document.documentElement.classList.toggle('ax-page-high-contrast', Boolean(prefs.contrast))
    return () => document.documentElement.classList.remove('ax-page-high-contrast')
  }, [outer.inShell, prefs.contrast])

  if (outer.inShell) return children

  const set = (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    store.set('prefs', next)
  }
  const tr = (k, v) => translate(prefs.lang, k, v)
  const size = Math.max(0, Math.min(MAX_SIZE, Number(prefs.size) || 0))
  // The percentage is shown only for a moment when the size changes.
  const changeSize = (next) => {
    set({ size: next })
    setSizeToast(tr('textScale', { percent: 100 + next * 25 }))
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setSizeToast(''), 1500)
  }
  const openSupport = () => {
    setSupportOpen((n) => n + 1)
    dialogRef.current?.showModal()
  }
  const setPrefsPatch = (patch) => set(patch)
  const value = { inShell: true, lang: prefs.lang, simple: prefs.simple, tr, openSupport, prefs, setPrefs: setPrefsPatch }

  return (
    <AccessContext.Provider value={value}>
      <div lang={prefs.lang} className={`ax ${SIZES[size]}${prefs.contrast ? ' ax-hc' : ''}${prefs.simple ? ' ax-simple' : ''} ${className}`}>
       <div className="ax-inner">
        <header className="ax-brand">
          <div className="ax-brand-mark" aria-hidden="true">DB</div>
          <div className="ax-brand-text">
            <h1 className="ax-brand-name">Welcome to Digital Bridge</h1>
            <p className="ax-brand-tagline">{tr('introText')}</p>
            <button type="button" className="ax-btn ax-btn-small ax-intro" onClick={() => speak(`${tr('introTitle')}. ${tr('introText')} ${tr('introHelp')}`, prefs.lang)}>
              <MdVolumeUp aria-hidden="true" /> {tr('listenIntro')}
            </button>
          </div>
        </header>
        <div className="ax-prefs" role="group" aria-label={tr('prefs')}>
          <span className="ax-prefs-label">{tr('display')}</span>
          <div className="ax-row" role="group" aria-label={tr('textSize')}>
            <button type="button" className="ax-btn ax-btn-small" onClick={() => changeSize(Math.max(0, size - 1))} disabled={size === 0}>
              <MdRemove aria-hidden="true" /><span className="ax-sr">{tr('smaller')}</span>
            </button>
            <span className="ax-size-value"><MdTextFields aria-hidden="true" /> {tr('textSize')}</span>
            <span className="ax-sizenote" role="status" aria-live="polite">{sizeToast && <span className="ax-toast">{sizeToast}</span>}</span>
            <button type="button" className="ax-btn ax-btn-small" onClick={() => changeSize(Math.min(MAX_SIZE, size + 1))} disabled={size === MAX_SIZE}>
              <MdAdd aria-hidden="true" /><span className="ax-sr">{tr('larger')}</span>
            </button>
          </div>
          <button type="button" className="ax-btn ax-btn-small" aria-pressed={prefs.contrast} onClick={() => set({ contrast: !prefs.contrast })}>
            <MdContrast aria-hidden="true" /> {tr('contrast')}
          </button>
          <button type="button" className="ax-btn ax-btn-small" aria-pressed={prefs.voiceGuidance} onClick={() => {
            if (prefs.voiceGuidance) stopSpeaking()
            set({ voiceGuidance: !prefs.voiceGuidance })
          }}>
            {prefs.voiceGuidance ? <MdPause aria-hidden="true" /> : <MdVolumeUp aria-hidden="true" />} {prefs.voiceGuidance ? tr('stopVoiceGuidance') : tr('voiceGuidance')}
          </button>
          <button type="button" className="ax-btn ax-btn-small" aria-pressed={prefs.simple} onClick={() => set({ simple: !prefs.simple })}>
            <MdVisibility aria-hidden="true" /> {tr('simpleMode')}
          </button>
        </div>
        <div className="ax-stage">{children}</div>
        <SupportDialog dialogRef={dialogRef} openCount={supportOpen} onClose={() => {}} />
       </div>
      </div>
    </AccessContext.Provider>
  )
}
