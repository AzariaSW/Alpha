/* eslint-disable react-refresh/only-export-components -- entry file, nothing imports it */
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccessibleOnboarding, PartnerRegister, CareerGateway, AccessShell } from './index'
import { getOutbox } from './store'

const TABS = [
  ['signup', 'Sign up and profile'],
  ['partner', 'Partner registers a learner'],
  ['careers', 'Career gateway'],
  ['outbox', 'SMS outbox (demo)'],
]

function Outbox() {
  const [box, setBox] = useState(getOutbox)
  const [unavailable, setUnavailable] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setBox([...getOutbox(), ...await loadDemoSmsOutbox()])
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    }
  }, [])
  useEffect(() => {
    let active = true
    loadDemoSmsOutbox()
      .then((messages) => {
        if (active) setBox([...getOutbox(), ...messages])
      })
      .catch(() => {
        if (active) setUnavailable(true)
      })
    return () => { active = false }
  }, [])
  return (
    <section>
      <h2>SMS outbox (demo)</h2>
      <p>No SMS service is connected. Messages that would be texted appear here during local development.</p>
      {unavailable && <p role="status">The backend demo outbox is not available.</p>}
      <button type="button" className="ax-btn" onClick={refresh}>Refresh</button>
      <ul>
        {box.map((m, i) => (
          <li key={`${m.queuedAt || m.at}-${i}`}><strong>{m.to}</strong>: {m.body}</li>
        ))}
      </ul>
    </section>
  )
}

async function loadDemoSmsOutbox() {
  const response = await fetch('/api/v1/registration/demo-sms')
  if (!response.ok) throw new Error('Demo outbox is unavailable')
  const result = await response.json()
  return result.messages || []
}

function Demo() {
  const [tab, setTab] = useState('signup')
  return (
    <AccessShell>
      <nav className="ax-row ax-tabs" aria-label="Demo sections">
        {TABS.map(([id, name]) => (
          <button key={id} type="button" className="ax-tab" aria-pressed={tab === id} onClick={() => setTab(id)}>{name}</button>
        ))}
      </nav>
      <main>
        {tab === 'signup' && <AccessibleOnboarding onComplete={() => setTab('careers')} />}
        {tab === 'partner' && <PartnerRegister />}
        {tab === 'careers' && <CareerGateway />}
        {tab === 'outbox' && <Outbox />}
      </main>
    </AccessShell>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
