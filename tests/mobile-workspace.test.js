import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspace, startsDocument } from '../mobile/workspace.js';

const origin = 'https://seek.paysme.site';
const home = origin + '/?client=preview';

test('Android bridge accepts the exact origin and pages on the custom domain', () => {
  assert.equal(isWorkspace(origin, origin), true);
  assert.equal(isWorkspace(origin, home + '#profile'), true);
  assert.equal(isWorkspace(origin, origin + '/request-account-removal'), true);
  assert.equal(isWorkspace(origin, origin + '.example/'), false);
  assert.equal(isWorkspace(origin, 'http://seek.paysme.site/'), false);
  assert.equal(isWorkspace(origin, origin + '/api/subscription'), false);
});

test('same-page navigation keeps the native file bridge active', () => {
  assert.equal(startsDocument(home, { url: home + '#profile', loading: true }), false);
  assert.equal(startsDocument(home, { url: origin + '/#browse', loading: false }), false);
  assert.equal(startsDocument(home, { url: home, loading: true }), true);
  assert.equal(startsDocument(home, { url: origin + '/request-account-removal', loading: true }), true);
});
