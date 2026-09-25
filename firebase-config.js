/**
 * Firebase Configuration & Firestore Initializer
 * Network Operations & Infrastructure Lease Management Dashboard
 */

// Default configuration placeholder
// Anda dapat memasukkan konfigurasi Firebase Anda di sini atau melalui Modal Pengaturan di UI Dashboard
window.DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

(function () {
  'use strict';

  // Load saved config from localStorage if available
  function getActiveConfig() {
    try {
      const stored = localStorage.getItem('sitac_firebase_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.projectId) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored firebase config:', e);
    }
    return window.DEFAULT_FIREBASE_CONFIG;
  }

  function saveConfig(config) {
    localStorage.setItem('sitac_firebase_config', JSON.stringify(config));
  }

  function isConfigValid(cfg) {
    return Boolean(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.trim().length > 5);
  }

  let firebaseApp = null;
  let firestoreDb = null;

  function initializeFirebaseApp() {
    const cfg = getActiveConfig();
    if (!isConfigValid(cfg)) {
      return { success: false, reason: 'Config not set or missing apiKey/projectId' };
    }

    try {
      if (typeof firebase === 'undefined') {
        return { success: false, reason: 'Firebase SDK not loaded' };
      }

      // If already initialized with same projectId
      if (!firebase.apps || firebase.apps.length === 0) {
        firebaseApp = firebase.initializeApp(cfg);
      } else {
        firebaseApp = firebase.app();
      }

      firestoreDb = firebase.firestore();
      return { success: true, app: firebaseApp, db: firestoreDb };
    } catch (err) {
      console.error('Firebase initialization error:', err);
      return { success: false, error: err };
    }
  }

  // Export functions to window namespace
  window.FirebaseManager = {
    getConfig: getActiveConfig,
    saveConfig: saveConfig,
    isConfigured: function () {
      return isConfigValid(getActiveConfig());
    },
    init: initializeFirebaseApp,
    getDb: function () {
      if (!firestoreDb) {
        const res = initializeFirebaseApp();
        if (res.success) return res.db;
      }
      return firestoreDb;
    }
  };

  // Attempt auto-init on load if config exists
  if (window.FirebaseManager.isConfigured()) {
    initializeFirebaseApp();
  }
})();
