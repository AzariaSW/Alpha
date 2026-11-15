import { useAccess } from '../context'

const EMPTY = { cal: 'gregorian', d: '', m: '', y: '' }

export default function BirthField({ value, onChange, error, qid }) {
  const { tr } = useAccess()
  const legacyDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { cal: 'gregorian', y: value.slice(0, 4), m: value.slice(5, 7), d: value.slice(8, 10) }
    : {}
  const current = {
    ...EMPTY,
    ...(value && typeof value === 'object' ? value : legacyDate),
  }
  const set = (patch) => {
    const next = { ...current, ...patch }
    onChange(!next.d && !next.m && !next.y && next.cal === 'gregorian' ? '' : next)
  }
  const digits = (text) => text.replace(/\D/g, '')

  return (
    <div>
      <div className="ax-chips" role="group" aria-label={tr('birthCalendar')}>
        {[
          ['gregorian', 'calGregorian'],
          ['ethiopian', 'calEthiopian'],
        ].map(([code, key]) => (
          <label key={code} className={`ax-chip${current.cal === code ? ' is-on' : ''}`}>
            <input
              type="radio"
              name={`${qid}-cal`}
              checked={current.cal === code}
              onChange={() => set({ cal: code })}
            />
            <span>{tr(key)}</span>
          </label>
        ))}
      </div>
      <div className="ax-birth-grid">
        {[
          ['d', 'birthDay', 2],
          ['m', 'birthMonth', 2],
          ['y', 'birthYear', 4],
        ].map(([key, text, max], index) => (
          <div key={key}>
            <label htmlFor={`${qid}-${key}`} className="ax-label-small">{tr(text)}</label>
            <input
              id={`${qid}-${key}`}
              className="ax-input"
              inputMode="numeric"
              autoComplete={key === 'd' ? 'bday-day' : key === 'm' ? 'bday-month' : 'bday-year'}
              maxLength={max}
              value={current[key] ?? ''}
              aria-invalid={error ? true : undefined}
              data-autofocus={index === 0 ? true : undefined}
              onChange={(event) => set({ [key]: digits(event.target.value) })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
