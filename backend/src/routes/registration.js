import { Router } from 'express';
import { z } from 'zod';
import { normalizeEthiopianPhone } from '../../../shared/module/src/utils/phone.js';
import { env } from '../config/env.js';
import {
  discardProgress,
  loadProgress,
  saveProgress,
} from '../services/registrationDrafts.js';
import { getDemoSmsOutbox } from '../services/sms.js';

const router = Router();
const RESUME_TOKEN = /^[a-f0-9]{64}$/;
const contactMethodSchema = z.enum(['phone', 'sms', 'email']);
const birthDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value
      && date <= new Date();
  });

const progressSchema = z.object({
  token: z.string().regex(RESUME_TOKEN).optional(),
  stepId: z.enum([
    'fullName',
    'birthDate',
    'gender',
    'username',
    'email',
    'phone',
    'contactMethods',
    'identityDocument',
  ]),
  answers: z.object({
    fullName: z.string().trim().min(1).max(120),
    birthDate: birthDateSchema.optional(),
    gender: z.enum(['woman', 'man', 'another', 'prefer_not_to_say']).optional(),
    username: z.string().trim().max(40).refine((value) => !value || /^[a-zA-Z0-9._-]{3,40}$/.test(value)).optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().min(7).max(25).optional(),
    contactMethods: z.array(contactMethodSchema).optional(),
  }).strict(),
}).strict();

const tokenSchema = z.object({
  token: z.string().regex(RESUME_TOKEN),
}).strict();

const verifySchema = z.object({
  token: z.string().regex(RESUME_TOKEN),
  registration: z.object({
    fullName: z.string().trim().min(1).max(120),
    birthDate: birthDateSchema,
    gender: z.enum(['woman', 'man', 'another', 'prefer_not_to_say']),
    username: z.string().trim().max(40).refine((value) => !value || /^[a-zA-Z0-9._-]{3,40}$/.test(value)).optional(),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(25),
    contactMethods: z.array(contactMethodSchema).min(1),
  }).strict(),
  document: z.object({
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(25).optional(),
  }).strict(),
  consent: z.literal(true),
}).strict();

function normalizeName(value = '') {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

router.post('/drafts', async (req, res, next) => {
  try {
    const input = progressSchema.parse(req.body);
    if (input.stepId === 'identityDocument' && !input.answers.contactMethods?.length) {
      return res.status(400).json({
        error: { code: 'CONTACT_CONSENT_REQUIRED', message: 'Choose at least one contact method before continuing.' },
      });
    }

    const result = await saveProgress({
      token: input.token,
      answers: input.answers,
      stepId: input.stepId,
      baseUrl: `${req.protocol}://${req.get('host')}`,
    });
    res.status(200).json({ token: result.token });
  } catch (error) {
    next(error);
  }
});

router.get('/demo-sms', (_req, res, next) => {
  if (env.NODE_ENV === 'production') {
    return next();
  }
  return res.json({ messages: getDemoSmsOutbox() });
});

router.post('/drafts/activity', async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    const draft = await loadProgress(token);
    if (!draft) {
      return res.status(404).json({
        error: { code: 'DRAFT_NOT_FOUND', message: 'This registration draft is not available.' },
      });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/drafts/load', async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    const draft = await loadProgress(token);
    if (!draft) {
      return res.status(404).json({
        error: { code: 'DRAFT_NOT_FOUND', message: 'This registration draft is not available.' },
      });
    }
    res.json({ draft });
  } catch (error) {
    next(error);
  }
});

router.post('/drafts/delete', async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    await discardProgress(token);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/verify', async (req, res, next) => {
  try {
    const input = verifySchema.parse(req.body);
    const draft = await loadProgress(input.token);
    if (!draft) {
      return res.status(404).json({
        error: { code: 'DRAFT_NOT_FOUND', message: 'This registration draft is not available.' },
      });
    }
    const savedAnswers = draft.answers;
    const savedContactMethods = [...(savedAnswers.contactMethods || [])].sort();
    const submittedContactMethods = [...input.registration.contactMethods].sort();
    const draftMatchesSubmission = [
      savedAnswers.fullName === input.registration.fullName,
      savedAnswers.birthDate === input.registration.birthDate,
      savedAnswers.gender === input.registration.gender,
      (savedAnswers.username || '') === (input.registration.username || ''),
      savedAnswers.email === input.registration.email,
      savedAnswers.phone === input.registration.phone,
      JSON.stringify(savedContactMethods) === JSON.stringify(submittedContactMethods),
    ].every(Boolean);
    if (!draftMatchesSubmission) {
      return res.status(409).json({
        error: { code: 'DRAFT_CHANGED', message: 'Save the latest registration answers before checking the document.' },
      });
    }

    const enteredName = normalizeName(input.registration.fullName);
    const documentName = normalizeName(input.document.name);
    const enteredPhone = normalizeEthiopianPhone(input.registration.phone);
    const documentPhone = normalizeEthiopianPhone(input.document.phone);
    const matches = {
      fullName: Boolean(enteredName && documentName && enteredName === documentName),
      phone: Boolean(enteredPhone && documentPhone && enteredPhone === documentPhone),
    };
    const textMatch = matches.fullName && matches.phone;

    if (textMatch) await discardProgress(input.token);
    res.json({
      status: textMatch ? 'text_match' : 'review_required',
      matches,
      authenticityVerified: false,
      ...(textMatch ? { registration: input.registration } : {}),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
