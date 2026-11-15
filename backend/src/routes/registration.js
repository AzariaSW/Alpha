import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { normalizeEthiopianPhone } from '../../../shared/module/src/utils/phone.js';
import { env } from '../config/env.js';
import {
  discardProgress,
  loadProgress,
  saveProgress,
  sendResumeLink,
} from '../services/registrationDrafts.js';
import { getDemoSmsOutbox } from '../services/sms.js';

const router = Router();
const RESUME_TOKEN = /^[a-f0-9]{64}$/;
const contactMethodSchema = z.enum(['phone', 'sms', 'email']);
const idRouteSchema = z.enum(['kebele', 'refugee', 'other-doc', 'refer']);
const optionalText = (max) => z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().max(max).optional(),
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().email().max(254).optional(),
);
const refugeeFinSchema = z.object({
  mode: z.enum(['scan', 'manual']).optional(),
  fin: z.string().trim().max(40).optional(),
  documentFin: z.string().trim().max(40).optional(),
  match: z.boolean().nullable().optional(),
  checked: z.boolean().optional(),
}).strip();
const routeFields = {
  idRoute: idRouteSchema.optional(),
  refugeeFin: refugeeFinSchema.optional(),
  otherDocument: optionalText(200),
  partner: optionalText(60),
  partnerShare: z.enum(['yes', 'no']).optional(),
};
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
    'idRoute',
    'identityDocument',
    'refugeeFin',
    'otherDocument',
    'partner',
    'partnerShare',
    'support',
  ]),
  answers: z.object({
    fullName: z.string().trim().min(1).max(120),
    birthDate: birthDateSchema.optional(),
    gender: z.enum(['woman', 'man', 'another', 'prefer_not_to_say']).optional(),
    username: z.string().trim().max(40).refine((value) => !value || /^[a-zA-Z0-9._-]{3,40}$/.test(value)).optional(),
    email: optionalEmail,
    phone: z.string().trim().min(7).max(25).optional(),
    contactMethods: z.array(contactMethodSchema).optional(),
    ...routeFields,
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
    email: optionalEmail,
    phone: z.string().trim().min(7).max(25),
    contactMethods: z.array(contactMethodSchema).min(1),
    ...routeFields,
  }).strict(),
  document: z.object({
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(25).optional(),
  }).strict().default({}),
  consent: z.boolean().optional(),
}).strict().superRefine((input, ctx) => {
  const route = input.registration.idRoute ?? 'kebele';
  if (route === 'kebele' && input.consent !== true) {
    ctx.addIssue({ code: 'custom', path: ['consent'], message: 'Consent to the document text comparison is required.' });
  }
  if (route === 'refugee' && !input.registration.refugeeFin?.fin && !input.registration.refugeeFin?.documentFin) {
    ctx.addIssue({ code: 'custom', path: ['registration', 'refugeeFin'], message: 'Enter or scan the refugee ID number (FIN).' });
  }
  if (route === 'refer' && !input.registration.partner) {
    ctx.addIssue({ code: 'custom', path: ['registration', 'partner'], message: 'Choose a partner organisation.' });
  }
  if (route === 'refer' && input.registration.partnerShare !== 'yes') {
    ctx.addIssue({ code: 'custom', path: ['registration', 'partnerShare'], message: 'A referral needs permission to share your name and phone with the partner.' });
  }
});

const STEPS_AFTER_CONTACT = new Set([
  'idRoute', 'identityDocument', 'refugeeFin', 'otherDocument', 'partner', 'partnerShare', 'support',
]);

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newReferralCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (const byte of bytes) code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
  return `DB-REF-${code}`;
}

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
    if (STEPS_AFTER_CONTACT.has(input.stepId) && !input.answers.contactMethods?.length) {
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
  if (env.NODE_ENV === 'production' && !env.DEMO_SMS_OUTBOX) {
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

router.post('/drafts/send-link', async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    const result = await sendResumeLink(token, `${req.protocol}://${req.get('host')}`);
    if (result.status === 'not_found') {
      return res.status(404).json({
        error: { code: 'DRAFT_NOT_FOUND', message: 'This registration draft is not available.' },
      });
    }
    if (result.status === 'sms_not_allowed') {
      return res.status(409).json({
        error: { code: 'SMS_NOT_ALLOWED', message: 'Add a phone number and choose text message (SMS) as a contact method first.' },
      });
    }
    res.json({ queued: true, delivered: result.delivered });
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
      (savedAnswers.email || '') === (input.registration.email || ''),
      savedAnswers.phone === input.registration.phone,
      JSON.stringify(savedContactMethods) === JSON.stringify(submittedContactMethods),
      (savedAnswers.idRoute ?? 'kebele') === (input.registration.idRoute ?? 'kebele'),
      (savedAnswers.otherDocument || '') === (input.registration.otherDocument || ''),
      (savedAnswers.partner || '') === (input.registration.partner || ''),
      (savedAnswers.partnerShare || '') === (input.registration.partnerShare || ''),
      (savedAnswers.refugeeFin?.fin || '') === (input.registration.refugeeFin?.fin || ''),
    ].every(Boolean);
    if (!draftMatchesSubmission) {
      return res.status(409).json({
        error: { code: 'DRAFT_CHANGED', message: 'Save the latest registration answers before checking the document.' },
      });
    }

    const idRoute = input.registration.idRoute ?? 'kebele';
    if (idRoute !== 'kebele') {
      await discardProgress(input.token);
      return res.json({
        status: idRoute === 'refer' ? 'referred' : 'received',
        idRoute,
        authenticityVerified: false,
        ...(idRoute === 'refer' ? { referralCode: newReferralCode() } : {}),
        registration: input.registration,
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
