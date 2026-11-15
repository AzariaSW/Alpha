import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

let server;

after(() => server?.close());

it('advertises the active API version at the versioned base path', async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/v1`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('api-version'), 'v1');
  assert.deepEqual(await response.json(), { version: 'v1', status: 'active' });

  const unversionedResponse = await fetch(`${baseUrl}/api/companies`);
  assert.equal(unversionedResponse.status, 404);
});
