const { withAndroidManifest } = require('expo/config-plugins');

// Expo SDK 57 dropped android.usesCleartextTraffic from the config schema.
// Dev builds talk to the LAN Django server over plain HTTP, so set the flag
// directly on the merged manifest (debug and release variants).
module.exports = function withAndroidCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
