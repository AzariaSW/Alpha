import { useEffect, useRef, useState } from 'react'
import { MdContrast, MdRemove, MdAdd, MdVolumeUp, MdPause } from 'react-icons/md'
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

  useEffect(() => {
    if (outer.inShell) return undefined
    const root = document.documentElement
    root.classList.add('ax-page')
    root.classList.toggle('ax-page-hc', Boolean(prefs.contrast))
    root.classList.toggle('ax-page-high-contrast', Boolean(prefs.contrast))
    return () => root.classList.remove('ax-page', 'ax-page-hc', 'ax-page-high-contrast')
  }, [outer.inShell, prefs.contrast])

  if (outer.inShell) return children

  const set = (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    store.set('prefs', next)
  }
  const tr = (k, v) => translate(prefs.lang, k, v)
  const size = Math.max(0, Math.min(MAX_SIZE, Number(prefs.size) || 0))
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
          <div>
            <h1 className="ax-brand-name">Digital Bridge</h1>
            <p className="ax-brand-tagline">{tr('introText')}</p>
          </div>
          <button type="button" className="ax-btn ax-btn-small ax-intro" onClick={() => speak(`${tr('introTitle')}. ${tr('introText')} ${tr('introHelp')}`, prefs.lang)}>
            <MdVolumeUp aria-hidden="true" /> {tr('listenIntro')}
          </button>
        </header>
        <div className="ax-prefs" role="group" aria-label={tr('prefs')}>
          <div className="ax-row" role="group" aria-label={tr('textSize')}>
            <button type="button" className="ax-btn ax-btn-small" onClick={() => set({ size: Math.max(0, size - 1) })} disabled={size === 0}>
              <MdRemove aria-hidden="true" /><span className="ax-sr">{tr('smaller')}</span>
            </button>
            <span className="ax-size-value" aria-live="polite">{tr('textScale', { percent: 100 + size * 25 })}</span>
            <button type="button" className="ax-btn ax-btn-small" onClick={() => set({ size: Math.min(MAX_SIZE, size + 1) })} disabled={size === MAX_SIZE}>
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
            {tr('simpleMode')}
          </button>
        </div>
        <div className="ax-stage">{children}</div>
        <SupportDialog dialogRef={dialogRef} openCount={supportOpen} onClose={() => {}} />
       </div>
      </div>
    </AccessContext.Provider>
  )
}
