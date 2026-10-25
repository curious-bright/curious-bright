import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsConfigured,
  initAnalytics,
  pageview,
  sanitizePath,
  track,
} from '../src/lib/analytics.ts';
import {
  analyticsConfigured as landingConfigured,
  initAnalytics as landingInit,
  pageview as landingPageview,
  track as landingTrack,
} from '../../landing-page/src/lib/analytics.ts';

test('empty Umami env keeps the main web analytics integration inert', () => {
  assert.equal(analyticsConfigured(), false);
  let calls = 0;
  globalThis.window = { umami: { track() { calls += 1; } } };
  track('sign_up', { method: 'password' });
  pageview('/profile/ada');
  initAnalytics();
  assert.equal(calls, 0);
  assert.equal(sanitizePath('/profile/ada'), '/profile/:username');
  assert.equal(
    sanitizePath('/verification/email/4bde3ef4-69c4-4cc7-bd4e-cb26a54f7f0f'),
    '/verification/email/:token',
  );
});

test('empty Umami env keeps the landing analytics integration inert', () => {
  assert.equal(landingConfigured(), false);
  let calls = 0;
  globalThis.window = { umami: { track() { calls += 1; } } };
  landingTrack('pricing_cta', { plan: 'pro' });
  landingPageview('/');
  landingInit();
  assert.equal(calls, 0);
});
