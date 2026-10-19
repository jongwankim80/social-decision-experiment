// Firebase Web App config is PUBLIC. Never store Admin credentials or exported responses here.
// Live submissions are enabled for a supervised pilot after the project owner
// configured Anonymous Authentication, Firestore, and published Security Rules.
// Do not distribute to students until a real test submission and access test pass.
window.EXPERIMENT_CONFIG = {
  experimentId: 'social-decision-v1',
  experimentVersion: '1.0.0',
  submissionsEnabled: true,
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
