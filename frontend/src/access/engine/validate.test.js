import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateStep } from './validate.js'

const step = { type: 'birth', required: false }
const tr = (key) => key

describe('birth-date validation', () => {
  it('accepts a legacy ISO date and a year-only answer', () => {
    assert.equal(validateStep({ type: 'date', required: true }, '1990-05-05', {}, tr), '')
    assert.equal(validateStep(step, { cal: 'gregorian', d: '', m: '', y: '1990' }, {}, tr), '')
  })

  it('accepts valid Ethiopian dates and rejects invalid Pagume days', () => {
    assert.equal(validateStep(step, { cal: 'ethiopian', d: '10', m: '1', y: '2015' }, {}, tr), '')
    assert.equal(validateStep(step, { cal: 'ethiopian', d: '6', m: '13', y: '2014' }, {}, tr), 'err.date')
  })

  it('allows an omitted date and rejects a future year', () => {
    assert.equal(validateStep(step, '', {}, tr), '')
    assert.equal(validateStep(step, { cal: 'ethiopian', d: '', m: '', y: '9999' }, {}, tr), 'err.date')
  })
})
