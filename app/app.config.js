// Adds what can't be written in app.json (which stays the main settings file).
//
// Firebase (push notifications on Android): google-services.json is NOT in Git (the
// repository is public). It is kept
//   - on the laptop, next to this file (for local builds), and
//   - in the Expo account as the secret file variable GOOGLE_SERVICES_JSON (EAS builds).
// Without it the app still works; only Android push notifications are missing.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
