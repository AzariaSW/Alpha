# React accessible onboarding and career gateway

The React app is the selected production UI. It includes a one-question form engine, answer review
and edit, voice input, a no-document referral handoff, a partner-registration demo, private
on-device support preferences, and the career-gateway demo.

## Current integration boundaries

- Registration drafts are saved through the backend and encrypted at rest. Inactive drafts are
  archived after 30 minutes and deleted after two years.
- The learner's `partner_referral` choice requires explicit consent and is returned to the host
  through `onComplete`. A partner directory, notification, or staff queue is not connected yet.
- Support requests, job postings, and job applications currently stay in browser storage. The UI
  must not describe them as sent to a support team or employer.
- SMS uses a development outbox only. It does not deliver messages or make cross-device links
  work; real carrier delivery requires an SMS provider and confirmed coverage/price.
- The interface currently provides English text. Amharic and other launch languages need
  translation and review before a learner-facing release.

Run the production build and backend checks from the repository root:

```sh
npm run build
npm test
npm run lint
```

See [the backend deployment notes](../../../backend/README.md) for required secrets and service
configuration. Automated axe checks do not replace TalkBack, NVDA, and co-designer testing on
physical devices.
