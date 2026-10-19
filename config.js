// These are PUBLIC Firebase web-app configuration values, never private Admin keys.
// Keep firebase: null for PREVIEW. Configure Authentication, Firestore Rules and
// App Check BEFORE replacing null and recruiting real participants.
window.EXPERIMENT_CONFIG = {
  experimentId: 'social-decision-v1',
  experimentVersion: '1.0.0',
  firebase: null,
  // Optional public reCAPTCHA Enterprise SITE key, after App Check registration.
  appCheckSiteKey: null
  // Example after backend setup:
  // firebase: {
  //   apiKey: 'PUBLIC_WEB_API_KEY',
  //   authDomain: 'YOUR_PROJECT.firebaseapp.com',
  //   projectId: 'YOUR_PROJECT_ID',
  //   appId: 'YOUR_PUBLIC_WEB_APP_ID'
  // },
  // appCheckSiteKey: 'YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY'
};