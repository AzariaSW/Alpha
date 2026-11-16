import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MdArrowBack, MdArrowForward, MdEdit, MdLock, MdVolumeUp, MdCheck, MdHelp, MdPerson } from 'react-icons/md'
import { useAccess } from '../context'
import { pick } from '../translation helper'
import { store, saveDraft, dropResume } from '../store'
import { speak, stopSpeaking, useListen } from '../voice'
import { validateStep, isEmpty } from './validate'
import { applyVoice } from './voiceApply'
import StepField from './StepField'
import VoiceInput from './VoiceInput'
import SaveLater from './SaveLater'

/*
 * One question per screen, no timers, autosave on every change, review before sending.
 * schema = { id, title, steps: [{ id, type, label, hint, required, options, showIf, icon,
 *            private, validate, mustBe }] }   type: text | tel | textarea | choice | multi | info
 */
export default function FormEngine({
  schema,
  formId = schema.id,
  initialAnswers,
  resume,
  startAtReview = false,
  onSubmit,
  doneContent,
  submitLabel,
  showSupportButton = true,
  showSaveLaterButton = true,
  persistLocally = true,
  autoStartVoiceControl = false,
  onProgress,
  onActivity,
  onDiscardDraft,
}) {
  const { lang, simple, tr, openSupport, prefs, setPrefs } = useAccess()
  const uid = useId()
  const rootRef = useRef(null)
  const firstRun = useRef(true)
  const commandRef = useRef(null)
  const voiceOnlyRef = useRef(autoStartVoiceControl)
  const speechTurnRef = useRef(0)
  const [voiceOnly, setVoiceOnly] = useState(autoStartVoiceControl)
  const {
    supported: voiceSupported,
    listening: voiceListening,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
  } = useListen(lang)

  const [state, setState] = useState(() => {
    const saved = resume ?? (persistLocally ? store.get(`draft:${formId}`) : null)
    return {
      answers: { ...initialAnswers, ...saved?.answers },
      stepId: saved?.stepId ?? null,
      review: startAtReview,
      returnToReview: startAtReview,
      resumeToken: saved?.resumeToken ?? null,
    }
  })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('filling') // filling | submitting | done
  const [submitError, setSubmitError] = useState(false)
  const [progressError, setProgressError] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [result, setResult] = useState(null)
  const activityTimer = useRef(null)

  const { answers, review } = state
  const doneTitle = result?.status === 'review_required'
    ? tr('reviewRequiredTitle')
    : pick(schema.doneTitle, lang, simple) || tr('doneTitle')
  const visible = schema.steps.filter((s) => !s.showIf || s.showIf(answers))
  const step = visible.find((s) => s.id === state.stepId) ?? visible[0]
  const idx = visible.indexOf(step)
  const qid = `${uid}-${step.id}`
  const asked = visible.filter((s) => s.type !== 'info')
  const progressIndex = Math.max(1, Math.min(
    asked.length,
    visible.slice(0, idx + 1).filter((s) => s.type !== 'info').length + (step.type === 'info' ? 1 : 0),
  ))

  useEffect(() => {
    if (!onActivity || !state.resumeToken || status !== 'filling' || !answers.fullName) return undefined
    clearTimeout(activityTimer.current)
    activityTimer.current = setTimeout(() => {
      onActivity(state.resumeToken)
        .then(() => setProgressError(false))
        .catch(() => setProgressError(true))
    }, 800)
    return () => clearTimeout(activityTimer.current)
  }, [answers, onActivity, state.resumeToken, state.stepId, status])

  const commit = (next) => {
    setState(next)
    if (persistLocally) {
      saveDraft(formId, { answers: next.answers, stepId: next.stepId, resumeToken: next.resumeToken })
    }
  }
  const label = (s) => pick(s.label, lang, simple)
  const optionLabel = (s, v) => pick(s.options?.find((o) => o.value === v)?.label, lang, simple) || v
  const show = (s, v) =>
    isEmpty(v) ? tr('skipped')
      : s.type === 'identityDocument' ? (v.reviewRequested ? tr('requestHumanReview') : tr('docScanDone'))
        : Array.isArray(v) ? v.map((x) => optionLabel(s, x)).join(', ')
          : s.options ? optionLabel(s, v) : v

  const setValue = (id, v) => {
    setErrors({})
    commit({ ...state, stepId: step.id, answers: { ...answers, [id]: v } })
  }

  const say = (text) => {
    if (!text) return
    const turn = ++speechTurnRef.current
    if (!voiceOnlyRef.current) {
      speak(text, lang)
      return
    }
    stopVoice()
    const resumeListening = () => {
      if (turn === speechTurnRef.current && voiceOnlyRef.current) {
        startVoice(() => {}, (transcript) => commandRef.current?.(transcript))
      }
    }
    if (!speak(text, lang, resumeListening)) resumeListening()
  }

  const readOut = () => {
    const opts = step.options?.map((o) => pick(o.label, lang, simple)).join('. ')
    const body = step.type === 'info' ? [].concat(pick(step.body, lang, simple)).join(' ') : ''
    const progress = tr('questionOf', { n: progressIndex, total: asked.length })
    say([progress, label(step), body, step.hint && pick(step.hint, lang, simple), opts && `${tr('options')}: ${opts}`].filter(Boolean).join('. '))
  }
  const readAnswers = () => say(asked.map((s) => `${label(s)}. ${show(s, answers[s.id])}`).join('. '))

  useEffect(() => {
    if (!autoStartVoiceControl || !voiceSupported) return
    voiceOnlyRef.current = true
    startVoice(() => {}, (text) => commandRef.current?.(text))
  }, [autoStartVoiceControl, startVoice, voiceSupported])

  // Move focus to the new question; in simple mode read it aloud. Skipped on first paint so an
  // embedded form does not steal focus from the page.
  useEffect(() => {
    if (!firstRun.current) {
      const root = rootRef.current
      const el = root?.querySelector('[data-autofocus]:checked') || root?.querySelector('[data-autofocus]') || root?.querySelector('[data-focus-heading]') || root?.querySelector('[data-view-heading]')
      el?.focus()
    }
    if ((simple || prefs?.voiceGuidance) && status === 'filling' && !review) readOut()
    else if (prefs?.voiceGuidance && status === 'submitting') say(tr('sending'))
    else if (prefs?.voiceGuidance && review) say(`${tr('reviewTitle')}. ${tr('reviewHint')}`)
    else if (prefs?.voiceGuidance && status === 'done') say(doneTitle)
    firstRun.current = false
    return () => {
      speechTurnRef.current += 1
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, review, status, prefs?.voiceGuidance, doneTitle])

  const saveProgress = async (nextAnswers, nextStepId) => {
    if (!onProgress) return { resumeToken: state.resumeToken }
    setSavingProgress(true)
    setProgressError(false)
    try {
      const saved = await onProgress({
        answers: nextAnswers,
        stepId: nextStepId,
        resumeToken: state.resumeToken,
      })
      return { resumeToken: saved?.resumeToken ?? state.resumeToken }
    } catch {
      setProgressError(true)
      return null
    } finally {
      setSavingProgress(false)
    }
  }

  const advance = async (nextAnswers) => {
    const nextStep = visible[idx + 1]
    const nextState = state.returnToReview || !nextStep
      ? { ...state, answers: nextAnswers, review: true, returnToReview: false }
      : { ...state, answers: nextAnswers, stepId: nextStep.id }
    const saved = await saveProgress(nextAnswers, nextStep?.id ?? step.id)
    if (!saved) return
    commit({ ...nextState, resumeToken: saved.resumeToken })
  }
  const next = async () => {
    if (savingProgress) return
    const err = validateStep(step, answers[step.id], answers, tr, lang, simple)
    if (err) return setErrors({ [step.id]: err })
    setErrors({})
    await advance(answers)
  }
  const skip = async () => {
    if (savingProgress) return
    setErrors({})
    await advance({ ...answers, [step.id]: '' })
  }
  const back = () => {
    setErrors({})
    if (review) commit({ ...state, review: false, stepId: visible[visible.length - 1].id })
    else if (idx > 0) commit({ ...state, stepId: visible[idx - 1].id })
  }
  const edit = (id) => {
    setErrors({})
    commit({ ...state, review: false, returnToReview: true, stepId: id })
  }

  const reviewAll = async () => {
    for (const s of visible) {
      const err = validateStep(s, answers[s.id], answers, tr, lang, simple)
      if (err) {
        setErrors({ [s.id]: err })
        commit({ ...state, review: false, returnToReview: true, stepId: s.id })
        return false
      }
    }
    setErrors({})
    if (!await saveProgress(answers, step.id)) return false
    commit({ ...state, review: true, returnToReview: false })
    readAnswers()
    return true
  }

  const send = async () => {
    voiceOnlyRef.current = false
    speechTurnRef.current += 1
    stopVoice()
    setVoiceOnly(false)
    for (const s of visible) {
      const err = validateStep(s, answers[s.id], answers, tr, lang, simple)
      if (err) {
        setErrors({ [s.id]: err })
        commit({ ...state, review: false, returnToReview: true, stepId: s.id })
        return
      }
    }
    setStatus('submitting')
    setSubmitError(false)
    try {
      const shown = Object.fromEntries(visible.map((s) => [s.id, answers[s.id]]))
      const submissionResult = await onSubmit?.(shown, { schema, visible })
      setResult(submissionResult)
      if (!submissionResult?.preserveDraft) {
        store.remove(`draft:${formId}`)
        dropResume(state.resumeToken)
      }
      setStatus('done')
    } catch {
      setSubmitError(true)
      setStatus('filling')
    }
  }
  const startOver = async () => {
    if (state.resumeToken && onDiscardDraft) {
      try {
        await onDiscardDraft(state.resumeToken)
      } catch {
        setProgressError(true)
        return
      }
    }
    stopVoice()
    voiceOnlyRef.current = false
    speechTurnRef.current += 1
    setVoiceOnly(false)
    store.remove(`draft:${formId}`)
    dropResume(state.resumeToken)
    setErrors({})
    setStatus('filling')
    setState({ answers: { ...initialAnswers }, stepId: null, review: false, returnToReview: false, resumeToken: null })
  }

  const handleVoiceCommand = (rawText) => {
    const text = rawText.trim().toLowerCase().replace(/[.!?]+$/, '')
    if (!text) return
    if (['stop voice control', 'stop listening', 'turn off voice control'].includes(text)) {
      voiceOnlyRef.current = false
      speechTurnRef.current += 1
      stopSpeaking()
      setVoiceOnly(false)
      stopVoice()
      return
    }
    if (['help', 'voice help', 'commands'].includes(text)) {
      say(tr('voiceCommandHelp'))
      return
    }
    if (['read', 'read question', 'repeat', 'say that again'].includes(text)) {
      readOut()
      return
    }
    if (['read answers', 'read my answers'].includes(text)) {
      if (review) readAnswers()
      else reviewAll()
      return
    }
    if (text === 'back' || text === 'go back' || text === 'previous') {
      back()
      return
    }
    if (text === 'skip') {
      if (step.required || step.type === 'info') {
        say(tr('err.required'))
      } else {
        skip()
      }
      return
    }
    if (text === 'review' || text === 'check my answers' || text === 'check answers') {
      reviewAll()
      return
    }
    if (text === 'send' || text === 'submit' || text === 'send my answers') {
      if (review) send()
      else reviewAll()
      return
    }
    if (text === 'next' || text === 'continue' || text === 'go next') {
      if (review) say(tr('voiceCommandHelp'))
      else next()
      return
    }
    if (review) {
      if (text.startsWith('change ')) {
        const query = text.slice(7).trim()
        const target = asked.find((s) => label(s).toLowerCase().includes(query))
        if (target) edit(target.id)
        else say(tr('voiceNoMatch'))
      } else {
        say(tr('voiceCommandHelp'))
      }
      return
    }
    const answer = text.replace(/^(?:answer|my answer is)\s+/, '')
    const result = applyVoice(step, answer, answers[step.id], tr, lang, simple)
    if (result.ok) {
      setValue(step.id, result.value)
      say(tr('voiceAnswerSaved'))
    } else {
      say(result.message)
    }
  }
  useLayoutEffect(() => {
    commandRef.current = handleVoiceCommand
  })
  const startVoiceOnly = () => {
    if (!voiceSupported) return
    voiceOnlyRef.current = true
    setVoiceOnly(true)
    setPrefs?.({ voiceGuidance: true })
    startVoice(() => {}, (text) => commandRef.current?.(text))
  }
  const stopVoiceOnly = () => {
    voiceOnlyRef.current = false
    speechTurnRef.current += 1
    stopSpeaking()
    setVoiceOnly(false)
    stopVoice()
  }
  const title = pick(schema.title, lang, simple)

  if (status === 'done') {
    return (
      <section className="ax-engine" ref={rootRef}>
        <h2 className="ax-title" tabIndex={-1} data-view-heading>{doneTitle}</h2>
        <p className="ax-sr" role="status" aria-live="polite">{doneTitle}</p>
        {progressError && <p className="ax-error" role="alert">{tr('progressSaveFailed')}</p>}
        {doneContent?.({ result, answers, reset: startOver })}
      </section>
    )
  }

  return (
    <section className={`ax-engine${(Number(prefs?.size) || 0) <= 1 ? ' ax-wide' : ''}`} ref={rootRef} aria-label={title}>
      <div className="ax-head">
        <span className="ax-side-icon" aria-hidden="true"><MdPerson /></span>
        <h2 className="ax-title">{title}</h2>
      </div>
      <p className="ax-hint">{schema.hint ? pick(schema.hint, lang, simple) : tr('noTimer')}</p>
      {!review && (
        <div className="ax-progressbox">
          <p className="ax-progress" aria-live="polite" aria-atomic="true">
            {tr('questionOf', { n: progressIndex, total: asked.length })}
          </p>
          <div className="ax-segs" aria-hidden="true">
            {asked.map((s, i) => <span key={s.id} className={i < progressIndex ? 'is-on' : ''} />)}
          </div>
        </div>
      )}
      <div className="ax-row ax-voice-controls">
        {!voiceOnly ? (
          <button type="button" className="ax-btn ax-btn-ghost" onClick={startVoiceOnly} disabled={!voiceSupported}>
            <MdVolumeUp aria-hidden="true" /> {tr('voiceControl')}
          </button>
        ) : (
          <button type="button" className="ax-btn ax-btn-ghost" onClick={stopVoiceOnly}>
            <MdArrowBack aria-hidden="true" /> {tr('stopVoiceControl')}
          </button>
        )}
        <p className="ax-hint" role="status" aria-live="polite">
          {!voiceSupported ? tr('voiceControlUnsupported')
            : voiceError === 'not-allowed' || voiceError === 'service-not-allowed' ? tr('voiceControlDenied')
              : voiceOnly && voiceListening ? `${tr('voiceControlListening')} ${tr('voiceControlHelp')}`
                : voiceOnly ? tr('voiceControlStopped') : tr('voiceControlHelp')}
        </p>
        <p className="ax-hint">{tr('voicePrivacy')}</p>
      </div>

      {review ? (
        <div>
          <h3 className="ax-q" tabIndex={-1} data-view-heading>{tr('reviewTitle')}</h3>
          <p className="ax-hint">{tr('reviewHint')}</p>
          <ol className="ax-review">
            {asked.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{label(s)}</strong>
                  <div>{show(s, answers[s.id])}</div>
                  {s.private && <small className="ax-private"><MdLock aria-hidden="true" /> {tr('privateNote')}</small>}
                </div>
                <button type="button" className="ax-btn ax-btn-ghost" onClick={() => edit(s.id)}>
                  <MdEdit aria-hidden="true" /> {tr('change')}<span className="ax-sr"> — {label(s)}</span>
                </button>
              </li>
            ))}
          </ol>
          {submitError && <p className="ax-error" role="alert">{tr('sendFailed')}</p>}
          {progressError && <p className="ax-error" role="alert">{tr('progressSaveFailed')}</p>}
          <div className="ax-row">
            <button type="button" className="ax-btn" onClick={back}><MdArrowBack aria-hidden="true" /> {tr('back')}</button>
            <button type="button" className="ax-btn ax-btn-ghost" onClick={readAnswers}><MdVolumeUp aria-hidden="true" /> {tr('readAll')}</button>
            <button type="button" className="ax-btn ax-btn-primary" onClick={send} disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
              <MdCheck aria-hidden="true" /> {status === 'submitting' ? tr('sending') : submitLabel || tr('send')}
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            next()
          }}
        >
          {progressError && <p className="ax-error" role="alert">{tr('progressSaveFailed')}</p>}
          <p className="ax-sr" role="status" aria-live="polite" aria-atomic="true">
            {savingProgress ? tr('savingProgress') : status === 'submitting' ? tr('sending') : ''}
          </p>
          <StepField
            step={step}
            qid={qid}
            value={answers[step.id]}
            error={errors[step.id]}
            onChange={(v) => setValue(step.id, v)}
          />
          {step.private && <p className="ax-private"><MdLock aria-hidden="true" /> {tr('privateNote')}</p>}
          <div className="ax-row ax-tools">
            <button type="button" className="ax-btn ax-btn-ghost" onClick={readOut}>
              <MdVolumeUp aria-hidden="true" /> {tr('readAloud')}
            </button>
            {step.type !== 'info' && (
              <VoiceInput
                key={step.id}
                allowAmharic={step.type === 'text' || step.type === 'textarea'}
                onApply={(text) => {
                  const r = applyVoice(step, text, answers[step.id], tr, lang, simple)
                  if (r.ok) setValue(step.id, r.value)
                  return r
                }}
              />
            )}
          </div>
          <div className="ax-row ax-nav">
            {idx > 0 && (
              <button type="button" className="ax-btn" onClick={back}><MdArrowBack aria-hidden="true" /> {tr('back')}</button>
            )}
            {!step.required && step.type !== 'info' && (
              <button type="button" className="ax-btn ax-btn-ghost" onClick={skip}>{tr('skip')}</button>
            )}
            <button type="submit" className="ax-btn ax-btn-primary" disabled={savingProgress} aria-busy={savingProgress}>
              {savingProgress ? tr('savingProgress') : idx === visible.length - 1 ? tr('review') : tr('next')} <MdArrowForward aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      <div className="ax-row ax-foot">
        {showSaveLaterButton && (
          <SaveLater
            formId={formId}
            answers={answers}
            stepId={step.id}
            defaultPhone={answers.phone || answers.learnerPhone}
            onToken={(t) => commit({ ...state, resumeToken: t })}
          />
        )}
        {showSupportButton && openSupport && (
          <button type="button" className="ax-btn ax-btn-ghost" onClick={openSupport}>
            <MdHelp aria-hidden="true" /> {tr('askSupport')}
          </button>
        )}
        {(Object.keys(answers).length > 0 || state.stepId) && (
          <button type="button" className="ax-btn ax-btn-ghost" onClick={startOver}>{tr('startOver')}</button>
        )}
      </div>
    </section>
  )
}
