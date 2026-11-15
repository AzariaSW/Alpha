import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { processDueDrafts, registrationDraftTiming, saveProgress } from '../src/services/registrationDrafts.js';
import { getDemoSmsOutbox } from '../src/services/sms.js';

const baseRegistration = {
  fullName: 'Ada Example',
  birthDate: '1990-05-05',
  gender: 'woman',
  username: 'ada.example',
  email: 'ada@example.org',
  phone: '0912345678',
  contactMethods: ['sms', 'email'],
};

describe('registration API and draft lifecycle', () => {
  let server;
  let baseUrl;

  after(() => server?.close());

  async function startServer() {
    if (server) return;
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  it('saves and restores incomplete draft progress; checks name and phone without authenticating a document', async () => {
    await startServer();
    const token = 'a'.repeat(64);

    const missingConsent = await fetch(`${baseUrl}/api/v1/registration/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepId: 'identityDocument',
        answers: { fullName: baseRegistration.fullName },
      }),
    });
    assert.equal(missingConsent.status, 400);

    const saved = await fetch(`${baseUrl}/api/v1/registration/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        stepId: 'contactMethods',
        answers: baseRegistration,
      }),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { token });

    const loaded = await fetch(`${baseUrl}/api/v1/registration/drafts/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const loadedDraft = await loaded.json();
    assert.equal(loadedDraft.draft.stepId, 'contactMethods');
    assert.equal(loadedDraft.draft.answers.email, baseRegistration.email);

    const verified = await fetch(`${baseUrl}/api/v1/registration/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        registration: baseRegistration,
        document: { name: 'ADA Example', phone: '+251 912 345 678' },
        consent: true,
      }),
    });
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), {
      status: 'text_match',
      matches: { fullName: true, phone: true },
      authenticityVerified: false,
      registration: baseRegistration,
    });

    const deleted = await fetch(`${baseUrl}/api/v1/registration/drafts/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(deleted.status, 404);
  });

  it('requires both document fields to match and rejects invalid birth dates', async () => {
    await startServer();
    const draft = await saveProgress({
      answers: baseRegistration,
      stepId: 'identityDocument',
      baseUrl,
    });
    const mismatch = await fetch(`${baseUrl}/api/v1/registration/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: draft.token,
        registration: baseRegistration,
        document: { name: baseRegistration.fullName },
        consent: true,
      }),
    });
    assert.deepEqual(await mismatch.json(), {
      status: 'review_required',
      matches: { fullName: true, phone: false },
      authenticityVerified: false,
    });

    const invalidDate = await fetch(`${baseUrl}/api/v1/registration/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: draft.token,
        registration: { ...baseRegistration, birthDate: '1990-02-31' },
        document: { name: baseRegistration.fullName, phone: baseRegistration.phone },
        consent: true,
      }),
    });
    assert.equal(invalidDate.status, 400);
  });

  it('rejects a final payload that differs from saved registration answers', async () => {
    await startServer();
    const draft = await saveProgress({
      answers: baseRegistration,
      stepId: 'identityDocument',
      baseUrl,
    });
    const response = await fetch(`${baseUrl}/api/v1/registration/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: draft.token,
        registration: { ...baseRegistration, email: 'changed@example.org' },
        document: { name: baseRegistration.fullName, phone: baseRegistration.phone },
        consent: true,
      }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'DRAFT_CHANGED');
  });

  it('archives an idle Redis draft for 50 years and queues a reminder only with SMS consent', async () => {
    await startServer();
    const answers = { ...baseRegistration };
    const { token } = await saveProgress({
      answers,
      stepId: 'contactMethods',
      baseUrl: 'http://localhost:3000',
    });
    await processDueDrafts(Date.now() + registrationDraftTiming.idleTimeoutMs + 1);

    assert.equal(
      registrationDraftTiming.fallbackRetentionMs,
      50 * 365.25 * 24 * 60 * 60 * 1000,
    );
    assert.ok(getDemoSmsOutbox().some((message) => message.to === answers.phone));

    const resumed = await fetch(`${baseUrl}/api/v1/registration/drafts/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(resumed.status, 200);

    const noSmsDraft = await saveProgress({
      answers: { ...baseRegistration, contactMethods: ['email'] },
      stepId: 'contactMethods',
      baseUrl,
    });
    const outboxCount = getDemoSmsOutbox().length;
    await processDueDrafts(Date.now() + registrationDraftTiming.idleTimeoutMs + 1);
    assert.equal(getDemoSmsOutbox().length, outboxCount);
    assert.ok(noSmsDraft.token);
  });
});
