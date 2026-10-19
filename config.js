// Public Firebase web configuration is NOT a private key.
// Keep firebase null until Authentication (Anonymous), Firestore and rules are set up.
// Never add a Firebase Admin private key or service-account JSON here.
window.EXPERIMENT_CONFIG = {
  experimentId: 'social-decision-v1',
  experimentVersion: '1.0.0',
  firebase: null
  // To activate real submissions, replace null with the web app config:
  // firebase: {
  //   apiKey: '... ',
  //   authDomain: 'YOUR_PROJECT.firebaseapp.com',
  //   projectId: 'YOUR_PROJECT',
  //   appId: '1:...:web:...'
  // }
};