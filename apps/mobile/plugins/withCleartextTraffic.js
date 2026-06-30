const { withAndroidManifest } = require('@expo/config-plugins');

function addCleartextTraffic(androidManifest) {
  const app = androidManifest.manifest.application?.[0];
  if (app) {
    app.$['android:usesCleartextTraffic'] = 'true';
  }
  return androidManifest;
}

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    config.modResults = addCleartextTraffic(config.modResults);
    return config;
  });
};
