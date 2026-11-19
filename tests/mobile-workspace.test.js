import test from 'node:test';
import assert from 'node:assert/strict';
import { isOAuthLaunch, isWorkspace, oauthRedirectUrl, readOAuthCallback, startsDocument } from '../mobile/workspace.js';

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

test('native sign-in only opens a SeekGRN Supabase PKCE authorization request', () => {
  const authorize = 'https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/authorize';
  const params = new URLSearchParams({ provider: 'google', redirect_to: oauthRedirectUrl, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' });
  const url = `${authorize}?${params}`;
  assert.equal(isOAuthLaunch(url), true);
  assert.equal(isOAuthLaunch(url.replace('provider=google', 'provider=apple')), true);
  assert.equal(isOAuthLaunch(url.replace('provider=google', 'provider=github')), false);
  assert.equal(isOAuthLaunch(url.replace('https://', 'http://')), false);
  assert.equal(isOAuthLaunch(url.replace('.supabase.co/', '.supabase.co.example/')), false);
  assert.equal(isOAuthLaunch(url.replace('=s256', '=plain')), false);
  assert.equal(isOAuthLaunch(url + '&redirect_to=https%3A%2F%2Fexample.com'), false);
  params.set('redirect_to', 'https://seek.paysme.site/');
  assert.equal(isOAuthLaunch(`${authorize}?${params}`), false);
});

test('installed wrapper accepts only a code from the registered sign-in callback', () => {
  assert.deepEqual(readOAuthCallback(oauthRedirectUrl + '?code=abc-123'), { code: 'abc-123' });
  assert.match(readOAuthCallback(oauthRedirectUrl + '?error=access_denied&error_description=details').error, /could not authorize/);
  assert.equal(readOAuthCallback(oauthRedirectUrl + '?code=abc&code=other'), null);
  assert.equal(readOAuthCallback(oauthRedirectUrl + '#access_token=token&refresh_token=token'), null);
  assert.equal(readOAuthCallback(oauthRedirectUrl + '/other?code=abc'), null);
  assert.equal(readOAuthCallback('https://seek.paysme.site/?code=abc'), null);
});
