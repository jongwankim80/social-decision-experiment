// Firebase Web App config is PUBLIC. Never store Admin credentials or exported responses here.
// The experiment stays in PREVIEW until Authentication, Firestore and rules are ready,
// a dummy submission has been verified, and submissionsEnabled is deliberately set to true.
window.EXPERIMENT_CONFIG = {
  experimentId: 'social-decision-v1',
  experimentVersion: '1.0.0',
  submissionsEnabled: false,
  firebase: {
    apiKey: 'AIzaSyDJ1tVMIjUUimJcUl-LfWqMCYhO2kJyHL4',
    authDomain: 'social-decision-experiment.firebaseapp.com',
    projectId: 'social-decision-experiment',
    storageBucket: 'social-decision-experiment.firebasestorage.app',
    messagingSenderId: '225709004857',
    appId: '1:225709004857:web:1cdf434ab4d3dd642915e8'
  },
  // Optional public reCAPTCHA Enterprise SITE key, after App Check registration.
  appCheckSiteKey: null
};
