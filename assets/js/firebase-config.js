// assets/js/firebase-config.js — Hisab Rakho Firebase Configuration

const firebaseConfig = {
  apiKey: "AIzaSyAWInhuuFUGh0sqorq2k4V10cEpQ5klhjU",
  authDomain: "shop-app-af93c.firebaseapp.com",
  projectId: "shop-app-af93c",
  storageBucket: "shop-app-af93c.firebasestorage.app",
  messagingSenderId: "635819523906",
  appId: "1:635819523906:web:2c393204830e21b7e352db",
  measurementId: "G-YDZMRP8SCY"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence — Firestore caches data locally and auto-syncs
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firebase] Multiple tabs open — persistence in first tab only');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firebase] Browser does not support offline persistence');
  }
});

// ── Auto-detect network status and notify UI ──
window.addEventListener('online', () => {
  console.log('[Firebase] Online — Firestore auto-syncing queued writes');
  if (typeof updateConnectionStatus === 'function') updateConnectionStatus(true);
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => {
      reg.sync.register('hisab-rakho-sync').catch(() => {});
    });
  }
});

window.addEventListener('offline', () => {
  console.log('[Firebase] Offline — writes will queue and auto-sync when back online');
  if (typeof updateConnectionStatus === 'function') updateConnectionStatus(false);
});

// Initial offline check
if (!navigator.onLine) {
  setTimeout(() => {
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus(false);
  }, 1000);
}
