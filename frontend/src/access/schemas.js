import {
  MdPerson, MdSms, MdBadge, MdDescription, MdPublic, MdLock, MdFavorite, MdHelp, MdBusiness, MdWork,
  MdLocationOn, MdPhone, MdChecklist, MdHandshake, MdSchedule } from 'react-icons/md'
import { supportOptions, offerOptions, YES_NO } from './vocab'

export const DEFAULT_PARTNERS = [
  { value: 'aaapd', label: 'Addis Ababa Association of Persons with Disabilities (AAAPD)', say: ['aaapd', 'addis ababa association'] },
  { value: 'refugee-org', label: 'A refugee support organisation', say: ['refugee'] },
  { value: 'community', label: 'A community or church group', say: ['community', 'church'] },
  { value: 'any', label: 'Choose one for me', say: ['choose', 'any'] },
]

const needsStep = {
  id: 'support',
  type: 'multi',
  icon: MdLock,
  private: true,
  label: { en: 'What would make this easier for you?', simple: 'What helps you?' },
  hint: {
    en: 'We do not ask why. You do not need a doctor’s letter or any proof. You can skip.',
    simple: 'We do not ask why. No papers needed. You can skip.' },
  options: supportOptions() }

const idRouteStep = {
  id: 'idRoute',
  type: 'choice',
  icon: MdBadge,
  required: true,
  label: { en: 'Which ID can you use?', simple: 'Do you have an ID?' },
  hint: {
    en: 'No ID is fine. Every choice lets you carry on.',
    simple: 'No ID is OK. You can still go on.' },
  options: [
    { value: 'kebele', icon: MdBadge, label: { en: 'Kebele ID', simple: 'Kebele ID' }, say: ['kebele', 'national'] },
    { value: 'refugee', icon: MdPublic, label: { en: 'Refugee ID', simple: 'Refugee ID' }, say: ['refugee', 'arra', 'unhcr'] },
    { value: 'other-doc', icon: MdDescription, label: { en: 'Another document (school, church, community or work letter)', simple: 'A different paper or letter' }, say: ['another', 'other', 'letter', 'document'] },
    { value: 'refer', icon: MdHandshake, label: { en: 'I have no document. Please refer me through a partner', simple: 'No paper. Please connect me to a helper group' }, say: ['no document', 'refer', 'partner', 'none'] },
  ] }

const refugeeFinStep = {
  id: 'refugeeFin',
  type: 'refugeeId',
  required: true,
  showIf: (a) => a.idRoute === 'refugee',
  label: { en: 'Refugee ID number (FIN)', simple: 'Refugee ID number' },
  hint: { en: 'Scan the ID or enter the FIN directly. We only compare text; this does not prove that the document is genuine.', simple: 'Scan your ID, or type the number.' },
  validate: (v) => {
    if (v?.mode === 'scan' && v.match === true) return ''
    if (v?.mode === 'manual' && v.fin?.trim()) return ''
    return 'Use scan and compare, or choose manual entry and enter the FIN.'
  },
}

const registrationSteps = [
  { id: 'fullName', type: 'text', icon: MdPerson, required: true, autoComplete: 'name', maxLength: 120,
    label: { en: 'What is your full name?', simple: 'Your full name' },
    hint: { en: 'Enter your name as it appears on your identity document.', simple: 'Your name as it is on your ID.' } },
  { id: 'birthDate', type: 'birth', icon: MdFavorite, autoComplete: 'bday',
    format: (value) => {
      if (typeof value === 'string') return value
      return [value.d, value.m, value.y].filter(Boolean).join('/')
        + (value.cal === 'ethiopian' ? ' (Ethiopian calendar)' : '')
    },
    label: { en: 'What is your date of birth?', simple: 'Your birthday' },
    hint: { en: 'Optional. Choose a calendar and enter the full date or just the year. You can skip.', simple: 'Optional. Enter the full date or just the year. You can skip.' } },
  { id: 'gender', type: 'choice', icon: MdPerson, required: true,
    label: { en: 'How do you describe your gender?', simple: 'Your gender' },
    options: [
      { value: 'woman', label: { en: 'Woman', simple: 'Woman' } },
      { value: 'man', label: { en: 'Man', simple: 'Man' } },
      { value: 'another', label: { en: 'Another gender', simple: 'Another gender' } },
      { value: 'prefer_not_to_say', label: { en: 'Prefer not to say', simple: 'Prefer not to say' } },
    ] },
  { id: 'username', type: 'text', icon: MdPerson, autoComplete: 'username', maxLength: 40,
    label: { en: 'Username (optional)', simple: 'Username (optional)' },
    hint: { en: 'This registration does not create a password or login account.', simple: 'This does not make a login account.' },
    validate: (v) => v && !/^[a-zA-Z0-9._-]{3,40}$/.test(v) ? 'Use 3–40 letters, numbers, dots, underscores or hyphens.' : '' },
  { id: 'email', type: 'email', icon: MdSms, required: true, autoComplete: 'email', maxLength: 254,
    label: { en: 'What is your email address?', simple: 'Your email address' } },
  { id: 'phone', type: 'tel', icon: MdPhone, required: true, autoComplete: 'tel', maxLength: 25,
    label: { en: 'What is your phone number?', simple: 'Your phone number' } },
  { id: 'contactMethods', type: 'multi', icon: MdSms, required: true,
    label: { en: 'How may we contact you? Choose at least one.', simple: 'How may we contact you?' },
    hint: { en: 'An automatic text reminder is sent only if you choose SMS.', simple: 'Text reminders need your SMS permission.' },
    options: [
      { value: 'phone', icon: MdPhone, label: { en: 'Phone call', simple: 'Phone call' } },
      { value: 'sms', icon: MdSms, label: { en: 'Text message (SMS)', simple: 'Text message' } },
      { value: 'email', icon: MdSms, label: { en: 'Email', simple: 'Email' } },
    ] },
  { id: 'identityDocument', type: 'identityDocument', icon: MdBadge, required: true,
    label: { en: 'Scan your identity document', simple: 'Take a photo or choose your ID' },
    hint: { en: 'Take a photo or browse for an image. Say “human review” if you cannot scan. The image stays on this device. We compare only the name and phone number read from it; this is not identity or authenticity verification.', simple: 'Take a photo or choose an image. Say “human review” if you cannot scan.' },
    validate: (v) => (v?.scanned || v?.reviewRequested) && v?.consent
      ? ''
      : 'Scan or choose an image, or request human review, and agree to the data check.' },
]

const partnerBaseSteps = [
  { id: 'name', type: 'text', required: true, maxLength: 120, autoComplete: 'name',
    label: { en: 'What should we call the learner?', simple: 'Learner name' } },
  { id: 'contactMethod', type: 'choice', required: true,
    label: { en: 'How can we reach the learner?', simple: 'How can we reach them?' },
    options: [
      { value: 'sms', label: { en: 'Text message (SMS)', simple: 'Text message' }, say: ['text', 'sms', 'message'] },
      { value: 'call', label: { en: 'Phone call', simple: 'Phone call' }, say: ['call', 'phone'] },
      { value: 'inperson', label: { en: 'I will visit in person', simple: 'I will come to you' }, say: ['visit', 'person', 'come'] },
    ] },
  { id: 'phone', type: 'tel', required: true, autoComplete: 'tel',
    showIf: (a) => a.contactMethod === 'sms' || a.contactMethod === 'call',
    label: { en: 'Learner phone number', simple: 'Learner phone number' } },
]

export function buildSignupSchema() {
  return {
    id: 'signup',
    title: { en: 'Sign up', simple: 'Sign up' },
    doneTitle: { en: 'Registration check complete.' },
    hint: {
      en: 'Each Next saves an incomplete draft to Redis. After 30 minutes idle, a draft may be kept in PostgreSQL for up to 50 years. A resume text is queued only if you choose SMS. On successful completion, the draft is deleted and your details are returned to the host application; this service does not store completed registration details or create a login account.',
      simple: 'Each Next saves your unfinished form. After 30 minutes with no activity, it may be kept for up to 50 years. Text reminders need your SMS permission. When you finish, the draft is deleted.',
    },
    steps: registrationSteps,
  }
}

// Support request from any screen: private, no reason asked.
export const supportRequestSchema = {
  id: 'support-request',
  title: { en: 'Ask for support privately', simple: 'Ask for help, privately' },
  steps: [
    { ...needsStep, required: true, private: false,
      hint: { en: 'Pick what helps. You never have to say why, and no proof is needed.', simple: 'Pick what helps. No reason. No papers.' } },
    { id: 'note', type: 'textarea', maxLength: 600,
      label: { en: 'Anything else you want us to know?', simple: 'Anything else?' },
      hint: { en: 'Optional. Do not tell us about your health unless you want to.', simple: 'You can skip.' } },
    { id: 'replyVia', type: 'choice', required: true,
      label: { en: 'How may we reply?', simple: 'How can we answer you?' },
      options: [
        { value: 'sms', icon: MdSms, label: { en: 'Text message (SMS)', simple: 'Text message' }, say: ['text', 'sms'] },
        { value: 'inperson', icon: MdLocationOn, label: { en: 'I will ask in person', simple: 'I will come to you' }, say: ['person', 'visit'] },
        { value: 'none', icon: MdLock, label: { en: 'Do not reply. Just save my request', simple: 'Just save it' }, say: ['save', 'none'] },
      ] },
    { id: 'phone', type: 'tel', required: true, showIf: (a) => a.replyVia === 'sms', autoComplete: 'tel',
      label: { en: 'Phone number for the reply', simple: 'Your phone number' } },
  ] }

// Partner registers a learner. Consent comes first; nothing about the learner is asked before it.
export function buildPartnerSchema({ partners = DEFAULT_PARTNERS } = {}) {
  const base = { steps: partnerBaseSteps }
  return {
    id: 'partner-register',
    title: { en: 'Register a learner (partner)', simple: 'Register a learner' },
    steps: [
      { id: 'partnerName', type: 'text', icon: MdBusiness, required: true, maxLength: 120,
        label: { en: 'Your organisation’s name', simple: 'Your group name' } },
      { id: 'staffName', type: 'text', icon: MdPerson, required: true, maxLength: 120,
        label: { en: 'Your name', simple: 'Your name' } },
      { id: 'consentInfo', type: 'info', icon: MdFavorite,
        label: { en: 'Read this to the learner, in their own language', simple: 'Read this to the learner' },
        body: { en: [
          'We want to make a learning profile for you. We will keep your name, phone and the answers you choose to give.',
          'You can say no. If you say no, nothing is saved. You can change your mind later and ask us to delete everything.',
          'You will get a text message with a link. There you can keep or delete the profile yourself.',
        ] } },
      { id: 'consent', type: 'choice', icon: MdFavorite, required: true, mustBe: 'yes',
        label: { en: 'Did the learner clearly say YES?', simple: 'Did the learner say YES?' },
        mustBeMsg: { en: 'Without a clear YES from the learner, we cannot continue. Nothing has been saved about them.' },
        options: YES_NO },
      { id: 'consentHow', type: 'choice', required: true, showIf: (a) => a.consent === 'yes',
        label: { en: 'How did they give their OK?', simple: 'How did they say yes?' },
        options: [
          { value: 'spoken', label: { en: 'They said it out loud' }, say: ['said', 'spoken', 'voice'] },
          { value: 'tapped', label: { en: 'They tapped it on the device themselves' }, say: ['tapped', 'themselves'] },
          { value: 'signed', label: { en: 'They signed or used a thumbprint' }, say: ['signed', 'thumb', 'fingerprint'] },
        ] },
      { ...base.steps[0], id: 'name', showIf: (a) => a.consent === 'yes' },
      { ...base.steps[1], showIf: (a) => a.consent === 'yes' },
      { ...base.steps[2], id: 'phone', showIf: (a) => a.consent === 'yes' && (a.contactMethod === 'sms' || a.contactMethod === 'call') },
      { ...idRouteStep, showIf: (a) => a.consent === 'yes' },
      { id: 'idNumber', type: 'text', maxLength: 60, showIf: (a) => a.consent === 'yes' && a.idRoute === 'kebele',
        label: { en: 'Kebele ID number', simple: 'Kebele ID number' }, hint: { en: 'You can skip.' } },
      { ...refugeeFinStep, showIf: (a) => a.consent === 'yes' && a.idRoute === 'refugee' },
      { id: 'partner', type: 'choice', icon: MdHandshake, required: true,
        showIf: (a) => a.consent === 'yes' && a.idRoute === 'refer',
        label: { en: 'Which partner can help the learner?', simple: 'Which group can help?' },
        options: partners.map((p) => ({ icon: MdHandshake, ...p })) },
      { id: 'partnerShare', type: 'choice', icon: MdHelp, required: true,
        showIf: (a) => a.consent === 'yes' && a.idRoute === 'refer',
        label: { en: 'Can we share the learner’s name and phone with them?', simple: 'Can we share their name and phone?' },
        options: YES_NO },
      { ...needsStep, showIf: (a) => a.consent === 'yes',
        hint: { en: 'Ask only if the learner wants to share. It goes to the learner’s own profile, not to your list.' } },
    ] }
}

// ----- Career gateway -----

export function buildApplicationSchema(job) {
  return {
    id: `apply-${job.id}`,
    title: { en: `Apply: ${job.title}`, simple: `Apply: ${job.title}` },
    steps: [
      { id: 'name', type: 'text', required: true, maxLength: 120, autoComplete: 'name', icon: MdPerson,
        label: { en: 'Your name', simple: 'Your name' } },
      { id: 'phone', type: 'tel', required: true, autoComplete: 'tel', icon: MdPhone,
        label: { en: 'Phone number', simple: 'Your phone number' } },
      { id: 'why', type: 'textarea', required: true, maxLength: 1200, icon: MdWork,
        label: { en: 'Why do you want this job?', simple: 'Why do you want this job?' },
        hint: { en: 'A few words are enough. You can speak your answer.', simple: 'A few words are OK. You can speak.' } },
      { id: 'experience', type: 'textarea', maxLength: 1200, icon: MdChecklist,
        label: { en: 'What work or skills do you have?', simple: 'What can you do?' },
        hint: { en: 'Work, volunteering, home or community tasks all count. You can skip.', simple: 'All kinds of work count. You can skip.' } },
      { id: 'availability', type: 'choice', required: true, icon: MdSchedule,
        label: { en: 'When can you start?', simple: 'When can you start?' },
        options: [
          { value: 'now', label: { en: 'Right away', simple: 'Now' }, say: ['right away', 'now', 'immediately'] },
          { value: '1m', label: { en: 'Within a month', simple: 'In one month' }, say: ['month'] },
          { value: 'later', label: { en: 'Later. Let us talk', simple: 'Later' }, say: ['later', 'talk'] },
        ] },
      { id: 'interviewSupport', type: 'multi', icon: MdLock, private: true,
        label: { en: 'Do you want this employer to prepare anything for your interview?', simple: 'Do you want anything ready for your interview?' },
        hint: { en: 'Optional. The employer sees only what you tick, never why. Skip to share nothing.', simple: 'You can skip. Nothing is shared if you skip.' },
        options: supportOptions().filter((o) => job.offers.includes(o.value)) },
    ] }
}

export const employerSchema = {
  id: 'employer-job',
  title: { en: 'Post a job and the support it offers', simple: 'Post a job' },
  steps: [
    { id: 'company', type: 'text', required: true, maxLength: 120, icon: MdBusiness,
      label: { en: 'Company name', simple: 'Company name' } },
    { id: 'contact', type: 'tel', required: true, icon: MdPhone,
      label: { en: 'Phone number for applicants’ replies', simple: 'Phone number' } },
    { id: 'title', type: 'text', required: true, maxLength: 120, icon: MdWork,
      label: { en: 'Job title', simple: 'Job name' } },
    { id: 'summary', type: 'textarea', required: true, maxLength: 800,
      label: { en: 'What will the person do?', simple: 'What is the work?' },
      hint: { en: 'Use plain words, short sentences.', simple: 'Use short, simple words.' } },
    { id: 'place', type: 'text', required: true, maxLength: 120, icon: MdLocationOn,
      label: { en: 'Where is the work?', simple: 'Where is the work?' } },
    { id: 'offers', type: 'multi', required: true, icon: MdChecklist,
      label: { en: 'What can this job offer?', simple: 'What can you offer?' },
      hint: { en: 'Tick everything you can arrange. Applicants are matched to these without telling you anything about themselves.', simple: 'Tick all you can do.' },
      requiredMsg: { en: 'Please tick at least one thing this job offers.' },
      options: offerOptions() },
    { id: 'offersNote', type: 'textarea', maxLength: 600,
      label: { en: 'Anything else you can arrange?', simple: 'Anything else?' } },
    { id: 'noProof', type: 'choice', required: true, mustBe: 'yes',
      label: { en: 'Will you arrange adjustments when asked, without asking for medical proof?', simple: 'Will you help when asked, without asking for medical papers?' },
      mustBeMsg: { en: 'We can only list jobs that agree not to ask for medical proof.' },
      options: YES_NO },
  ] }
