/**
 * Firebase Configuration & Firestore Integration Engine
 * Network Operations & Infrastructure Lease Management Portal
 * Supports Hybrid Resilient Architecture (Cloud Firestore & Local SQLite)
 */

window.DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9C38cUSWaJcvYNu4a18begzwSlEJOiAg",
  authDomain: "analytics-811fc.firebaseapp.com",
  projectId: "analytics-811fc",
  storageBucket: "analytics-811fc.firebasestorage.app",
  messagingSenderId: "585171712098",
  appId: "1:585171712098:web:88d0c24c059dd21f57b93b",
  measurementId: "G-ZYYH3EBTHW"
};

(function () {
  'use strict';

  const STORAGE_KEY_CONFIG = 'sitac_firebase_config';
  const STORAGE_KEY_CLOUD_MODE = 'sitac_use_cloud_firebase';

  let firebaseApp = null;
  let firestoreDb = null;

  // Retrieve active config — hardcoded DEFAULT takes priority when it has credentials
  function getActiveConfig() {
    // Always use hardcoded default if it has real credentials
    if (isConfigValid(window.DEFAULT_FIREBASE_CONFIG)) {
      return window.DEFAULT_FIREBASE_CONFIG;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.projectId && parsed.apiKey) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca firebase config tersimpan:', e);
    }
    return window.DEFAULT_FIREBASE_CONFIG;
  }

  function saveConfig(cfg) {
    if (!cfg) return;
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
    // Re-initialize when config changes
    return initializeFirebaseApp(true);
  }

  function removeConfig() {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    localStorage.removeItem(STORAGE_KEY_CLOUD_MODE);
    firebaseApp = null;
    firestoreDb = null;
  }

  function isConfigValid(cfg) {
    return Boolean(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.trim().length > 6 && cfg.projectId.trim().length > 2);
  }

  function isCloudModeActive() {
    // Auto-enable cloud mode when a valid config is present (no manual toggle needed)
    return isConfigValid(getActiveConfig());
  }

  function setCloudMode(active) {
    localStorage.setItem(STORAGE_KEY_CLOUD_MODE, active ? 'true' : 'false');
  }

  // Parse raw text pasted from Firebase Console (JS object or JSON)
  function parseConfigString(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();

    // 1. Try direct JSON parse
    try {
      const parsed = JSON.parse(text);
      if (parsed && (parsed.apiKey || parsed.projectId)) return parsed;
    } catch (e) {}

    // 2. Regex extract fields from JS object
    const result = {};
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
    
    fields.forEach(f => {
      const regex = new RegExp(`['"]?${f}['"]?\\s*:\\s*['"\`]([^'"\`]+)['"\`]`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        result[f] = match[1].trim();
      }
    });

    if (result.apiKey && result.projectId) {
      return result;
    }
    return null;
  }

  // Initialize Firebase App & Firestore
  function initializeFirebaseApp(forceReinit = false) {
    const cfg = getActiveConfig();
    if (!isConfigValid(cfg)) {
      return { success: false, reason: 'Kredensial Firebase belum lengkap (butuh apiKey & projectId).' };
    }

    if (typeof firebase === 'undefined') {
      return { success: false, reason: 'Firebase SDK belum dimuat di browser.' };
    }

    try {
      if (forceReinit && firebase.apps.length > 0) {
        // We reuse existing or initialize named app
        try {
          firebaseApp = firebase.app();
        } catch (e) {
          firebaseApp = firebase.initializeApp(cfg);
        }
      } else if (!firebase.apps || firebase.apps.length === 0) {
        firebaseApp = firebase.initializeApp(cfg);
      } else {
        firebaseApp = firebase.app();
      }

      firestoreDb = firebase.firestore();
      return { success: true, app: firebaseApp, db: firestoreDb };
    } catch (err) {
      console.error('Firebase initialization error:', err);
      return { success: false, error: err.message || err };
    }
  }

  // Test Firestore Connection
  async function testConnection() {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) {
      return { success: false, message: initRes.reason || 'Inisialisasi Firebase gagal' };
    }

    try {
      // Test read to Firestore metadata or summary
      const db = initRes.db;
      await db.collection('_health_check').doc('ping').set({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        ping: 'pong'
      }, { merge: true });

      return { success: true, message: 'Koneksi ke Google Cloud Firestore berhasil!', projectId: getActiveConfig().projectId };
    } catch (err) {
      console.warn('Firestore test connection notice:', err);
      // Even if write is restricted, try a simple read
      try {
        const db = initRes.db;
        await db.collection('summary').limit(1).get();
        return { success: true, message: 'Koneksi ke Google Cloud Firestore berhasil (Read Only)!', projectId: getActiveConfig().projectId };
      } catch (err2) {
        return { 
          success: false, 
          message: `Gagal terhubung ke Firestore: ${err2.message || err.message}. Periksa Security Rules Firestore Anda.`,
          error: err2
        };
      }
    }
  }

  // Batch upload local SQLite data into Cloud Firestore
  async function uploadLocalDataToFirestore(onProgress) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) {
      throw new Error(initRes.reason || 'Firebase belum terkonfigurasi');
    }
    const db = initRes.db;

    // 1. Fetch datasets from local endpoints
    const endpoints = [
      { name: 'summary', url: '/api/executive/summary', isObject: true },
      { name: 'users', url: '/api/auth/registered-pics', key: 'pics' },
      { name: 'rekap_efisiensi', url: '/api/rekap-efisiensi' },
      { name: 'sitac_records', url: '/api/sitac/list?page_size=2000', key: 'data' },
      { name: 'gangguan_records', url: '/api/gangguan/list?status=ALL&date_type=dispos', key: 'data' },
      { name: 'collo_records', url: '/api/collo/list?page_size=5000&status=ALL', key: 'data' }
    ];

    let totalDocsUploaded = 0;
    let stepIndex = 0;

    for (const ep of endpoints) {
      stepIndex++;
      if (onProgress) onProgress(`Mengunduh data lokal: ${ep.name}...`, 10 + stepIndex * 10);

      let items = [];
      try {
        const res = await fetch(ep.url);
        if (!res.ok) continue;
        const resJson = await res.json();
        if (ep.isObject) {
          items = [{ id: 'executive_summary', ...resJson }];
        } else if (ep.key && resJson[ep.key]) {
          items = resJson[ep.key];
        } else if (Array.isArray(resJson)) {
          items = resJson;
        }
      } catch (fetchErr) {
        console.warn(`Gagal mengambil data untuk ${ep.name}:`, fetchErr);
        continue;
      }

      if (!items || items.length === 0) continue;

      // 2. Upload in Firestore batches of 400
      const batchSize = 350;
      for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        const batch = db.batch();

        chunk.forEach(item => {
          let docId = '';
          if (ep.name === 'users') {
            docId = item.username ? `user_${item.username}` : `user_${item.id}`;
          } else if (ep.name === 'gangguan_records') {
            docId = `ticket_${item.id || item.no_tiket || Math.random()}`;
          } else if (ep.name === 'sitac_records') {
            docId = `sitac_${item.id || Math.random()}`;
          } else if (ep.name === 'collo_records') {
            docId = `collo_${item.id || Math.random()}`;
          } else if (ep.name === 'rekap_efisiensi') {
            docId = `tahun_${item.tahun || item.id}`;
          } else {
            docId = String(item.id || 'default');
          }

          const docRef = db.collection(ep.name).doc(docId);
          // Clean undefined values
          const cleanItem = JSON.parse(JSON.stringify(item));
          batch.set(docRef, cleanItem, { merge: true });
        });

        await batch.commit();
        totalDocsUploaded += chunk.length;

        if (onProgress) {
          const progressPercent = Math.min(95, 20 + Math.round((totalDocsUploaded / 3000) * 75));
          onProgress(`Tersinkronisasi ${ep.name}: ${Math.min(i + batchSize, items.length)}/${items.length} dokumen`, progressPercent);
        }
      }
    }

    if (onProgress) onProgress(`Selesai! Berhasil mengunggah ${totalDocsUploaded} dokumen ke Cloud Firestore.`, 100);
    return { success: true, totalUploaded: totalDocsUploaded };
  }

  // Fetch a collection from Firestore
  async function fetchFirestoreCollection(collectionName) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;
    const snap = await db.collection(collectionName).get();
    const results = [];
    snap.forEach(doc => results.push({ docId: doc.id, ...doc.data() }));
    return results;
  }

  // SHA-256 Client-side hashing for Firestore Auth
  async function hashPwClient(pw) {
    if (!pw) return '';
    try {
      const msgUint8 = new TextEncoder().encode(pw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return pw;
    }
  }

  // Firestore Auth & User Management
  async function seedDefaultUsersIfEmpty() {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) return;
    const db = initRes.db;

    try {
      const snap = await db.collection('users').limit(1).get();
      if (!snap.empty) return; // Already has users

      const defaultUsers = [
        { username: 'admin', email: 'admin@telecom.ops', password_hash: await hashPwClient('admin123'), full_name: 'Administrator (Manajemen)', role: 'admin', avatar_icon: 'fa-shield-halved', badge_color: 'cyan', pic_code: '' },
        { username: 'harlan', email: 'harlan@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Harlan', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'emerald', pic_code: 'Harlan' },
        { username: 'budi', email: 'budi@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Budi Rodiyah', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'cyan', pic_code: 'Budi' },
        { username: 'edi', email: 'edi@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Edi Swargaloka', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'amber', pic_code: 'Edi' },
        { username: 'abusopian', email: 'abusopian@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'M. Abusopian', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'indigo', pic_code: 'Abusopian' },
        { username: 'muhidin', email: 'muhidin@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Muhidin', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'teal', pic_code: 'Muhidin' },
        { username: 'brian', email: 'brian@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Brian Ariyanto', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'purple', pic_code: 'Brian' },
        { username: 'zulhadi', email: 'zulhadi@telecom.ops', password_hash: await hashPwClient('pic123'), full_name: 'Zulhadi Syahril', role: 'lapangan', avatar_icon: 'fa-helmet-safety', badge_color: 'blue', pic_code: 'Zulhadi' }
      ];

      const batch = db.batch();
      defaultUsers.forEach(u => {
        const ref = db.collection('users').doc(`user_${u.username}`);
        batch.set(ref, { ...u, created_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      console.log('Firebase Firestore: Users default berhasil di-seed.');
    } catch (e) {
      console.warn('Seeding default users to Firestore notice:', e);
    }
  }

  async function firestoreLogin(identifier, password) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const idClean = String(identifier || '').trim().toLowerCase();
    if (!idClean) throw new Error('Silakan masukkan username atau email akun Anda.');
    if (!password) throw new Error('Silakan masukkan kata sandi akun Anda.');

    const pwHash = await hashPwClient(password);

    // Search by username or email in Firestore
    let snap = await db.collection('users').where('username', '==', idClean).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('users').where('email', '==', idClean).limit(1).get();
    }
    if (snap.empty) {
      throw new Error(`Akun '${identifier}' tidak terdaftar di Google Firebase.`);
    }

    const doc = snap.docs[0];
    const uData = doc.data();

    if (uData.password_hash !== pwHash) {
      throw new Error('Kata sandi yang Anda masukkan salah.');
    }

    // Record login activity in Firestore audit logs
    await logActivity('LOGIN', `User ${uData.username} (${uData.full_name}) berhasil masuk via Firebase`, uData.username);

    return {
      id: doc.id,
      username: uData.username,
      email: uData.email || `${uData.username}@telecom.ops`,
      full_name: uData.full_name,
      role: uData.role,
      avatar_icon: uData.avatar_icon || (uData.role === 'admin' ? 'fa-shield-halved' : 'fa-helmet-safety'),
      badge_color: uData.badge_color || (uData.role === 'admin' ? 'cyan' : 'emerald'),
      pic_code: uData.pic_code || ''
    };
  }

  // Lookup user for Forgot Password flow
  async function firestoreForgotLookup(identifier) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const idClean = String(identifier || '').trim().toLowerCase();
    if (!idClean) throw new Error('Silakan masukkan username atau email terdaftar.');

    let snap = await db.collection('users').where('username', '==', idClean).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('users').where('email', '==', idClean).limit(1).get();
    }
    if (snap.empty) {
      throw new Error(`Akun dengan username atau email '${identifier}' tidak ditemukan di Firebase.`);
    }

    const doc = snap.docs[0];
    const uData = doc.data();

    return {
      success: true,
      docId: doc.id,
      username: uData.username,
      email: uData.email || `${uData.username}@telecom.ops`,
      full_name: uData.full_name,
      role: uData.role,
      pic_code: uData.pic_code || ''
    };
  }

  // Reset password directly in Firestore
  async function firestoreResetPassword(identifier, newPassword) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    if (!newPassword || newPassword.length < 4) {
      throw new Error('Kata sandi baru minimal harus 4 karakter.');
    }

    const idClean = String(identifier || '').trim().toLowerCase();
    let snap = await db.collection('users').where('username', '==', idClean).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('users').where('email', '==', idClean).limit(1).get();
    }
    if (snap.empty) {
      throw new Error('Akun tidak ditemukan di Firebase.');
    }

    const doc = snap.docs[0];
    const uData = doc.data();
    const newHash = await hashPwClient(newPassword);

    await db.collection('users').doc(doc.id).update({
      password_hash: newHash,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('RESET_PASSWORD', `Kata sandi akun ${uData.username} (@${uData.full_name}) di-reset melalui fitur Lupa Sandi Firebase`, uData.username);

    return {
      success: true,
      message: `Kata sandi akun '${uData.full_name}' (@${uData.username}) berhasil diperbarui di Google Firebase!`,
      username: uData.username,
      full_name: uData.full_name
    };
  }

  async function firestoreRegister(userData) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const username = (userData.username || '').trim().toLowerCase();
    if (!username || username.length < 3) throw new Error('Username minimal 3 karakter.');
    if (!userData.password || userData.password.length < 4) throw new Error('Kata sandi minimal 4 karakter.');
    if (!userData.full_name || !userData.full_name.trim()) throw new Error('Nama lengkap wajib diisi.');

    const email = (userData.email || `${username}@telecom.ops`).trim().toLowerCase();

    // Check if username already exists in Firestore
    const snapUser = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!snapUser.empty) {
      throw new Error(`Username '${username}' sudah terdaftar di Firebase.`);
    }

    // Check if email already exists in Firestore
    const snapEmail = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!snapEmail.empty) {
      throw new Error(`Email '${email}' sudah digunakan akun lain di Firebase.`);
    }

    const pwHash = await hashPwClient(userData.password);
    const docId = `user_${username}`;
    const newUser = {
      username: username,
      email: email,
      password_hash: pwHash,
      full_name: userData.full_name.trim(),
      role: userData.role || 'lapangan',
      avatar_icon: userData.role === 'admin' ? 'fa-shield-halved' : 'fa-helmet-safety',
      badge_color: userData.role === 'admin' ? 'cyan' : 'emerald',
      pic_code: userData.pic_code || userData.full_name.split(' ')[0],
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(docId).set(newUser);
    await logActivity('REGISTER', `Pendaftaran akun PIC baru ${newUser.username} (${newUser.full_name}) ke Google Firebase`, newUser.username);

    return { 
      success: true, 
      message: `Akun '${userData.full_name}' (@${username}) berhasil didaftarkan ke Cloud Firebase!`, 
      user: newUser 
    };
  }

  async function firestoreChangePassword(username, oldPw, newPw) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const uLower = (username || '').trim().toLowerCase();
    const oldHash = await hashPwClient(oldPw);
    const newHash = await hashPwClient(newPw);

    const snap = await db.collection('users').where('username', '==', uLower).limit(1).get();
    if (snap.empty) throw new Error('Akun tidak ditemukan di Firebase.');

    const doc = snap.docs[0];
    if (doc.data().password_hash !== oldHash) {
      throw new Error('Kata sandi lama yang Anda masukkan salah.');
    }

    await db.collection('users').doc(doc.id).update({ 
      password_hash: newHash,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('CHANGE_PASSWORD', `User ${uLower} berhasil mengubah kata sandi di Firebase`, uLower);
    return { success: true, message: 'Kata sandi berhasil diperbarui di Cloud Firebase!' };
  }

  async function firestoreAdminResetPassword(targetUser, newPw) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const uLower = (targetUser || '').trim().toLowerCase();
    const newHash = await hashPwClient(newPw);

    const snap = await db.collection('users').where('username', '==', uLower).limit(1).get();
    if (snap.empty) throw new Error(`Akun '${targetUser}' tidak ditemukan di Firebase.`);

    const doc = snap.docs[0];
    await db.collection('users').doc(doc.id).update({ 
      password_hash: newHash,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('ADMIN_RESET_PASSWORD', `Admin me-reset kata sandi akun ${targetUser} di Firebase`);
    return { success: true, message: `Kata sandi akun '${targetUser}' berhasil di-reset di Cloud Firebase!` };
  }

  async function firestoreDeleteUser(targetUser) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    const uLower = (targetUser || '').trim().toLowerCase();
    const snap = await db.collection('users').where('username', '==', uLower).limit(1).get();
    if (snap.empty) throw new Error(`Akun '${targetUser}' tidak ditemukan di Firebase.`);

    const doc = snap.docs[0];
    await db.collection('users').doc(doc.id).delete();
    await logActivity('ADMIN_DELETE_USER', `Admin menghapus akun ${targetUser} dari Firebase`);
    return { success: true, message: `Akun '${targetUser}' berhasil dihapus dari Cloud Firebase!` };
  }

  // Generic Firestore CRUD helper methods
  async function firestoreAddRecord(collectionName, data) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;
    const ref = await db.collection(collectionName).add({
      ...data,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: ref.id, ...data };
  }

  async function firestoreUpdateRecord(collectionName, docId, updates) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;
    await db.collection(collectionName).doc(String(docId)).update({
      ...updates,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
  }

  async function firestoreDeleteRecord(collectionName, docId) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;
    await db.collection(collectionName).doc(String(docId)).delete();
    return { success: true };
  }

  // Activity Audit Log Tracker
  async function logActivity(action, details, username) {
    try {
      const initRes = initializeFirebaseApp();
      if (!initRes.success) return;
      const db = initRes.db;

      const user = username || (localStorage.getItem('telecom_portal_user') ? JSON.parse(localStorage.getItem('telecom_portal_user')).username : 'system');
      await db.collection('audit_logs').add({
        action: action,
        details: details || '',
        username: user,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        time_str: new Date().toLocaleString('id-ID')
      });
    } catch (e) {
      console.warn('Audit log write notice:', e);
    }
  }

  // Upload file directly to Firebase Storage
  async function uploadToStorage(file, folder = 'bukti_lapangan') {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error('Firebase belum terinisialisasi');

    if (typeof firebase.storage === 'undefined') {
      throw new Error('Firebase Storage SDK belum dimuat');
    }

    const storageRef = firebase.storage().ref();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = storageRef.child(`${folder}/${timestamp}_${safeName}`);

    const snapshot = await fileRef.put(file);
    const downloadUrl = await snapshot.ref.getDownloadURL();
    return { url: downloadUrl, filename: `${timestamp}_${safeName}` };
  }

  // Bulk Batch Import Records into Firestore
  async function batchImportRecords(collectionName, items, onProgress) {
    const initRes = initializeFirebaseApp();
    if (!initRes.success) throw new Error(initRes.reason);
    const db = initRes.db;

    if (!items || items.length === 0) return { success: true, count: 0 };

    const batchSize = 300;
    let totalImported = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const batch = db.batch();

      chunk.forEach(item => {
        const docRef = db.collection(collectionName).doc();
        const cleanItem = JSON.parse(JSON.stringify(item));
        batch.set(docRef, {
          ...cleanItem,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
      totalImported += chunk.length;

      if (onProgress) {
        onProgress(`Mengimpor ${totalImported}/${items.length} data ke Firestore...`, Math.round((totalImported / items.length) * 100));
      }
    }

    await logActivity('IMPORT_EXCEL', `Berhasil mengimpor ${totalImported} data ke koleksi ${collectionName}`);
    return { success: true, count: totalImported };
  }

  // Global window object export
  window.FirebaseManager = {
    getConfig: getActiveConfig,
    saveConfig: saveConfig,
    removeConfig: removeConfig,
    isConfigured: function () {
      return isConfigValid(getActiveConfig());
    },
    isCloudModeActive: isCloudModeActive,
    setCloudMode: setCloudMode,
    parseConfigString: parseConfigString,
    init: initializeFirebaseApp,
    testConnection: testConnection,
    uploadLocalDataToFirestore: uploadLocalDataToFirestore,
    fetchCollection: fetchFirestoreCollection,
    seedUsers: seedDefaultUsersIfEmpty,
    loginUser: firestoreLogin,
    registerUser: firestoreRegister,
    forgotLookup: firestoreForgotLookup,
    resetPassword: firestoreResetPassword,
    changePassword: firestoreChangePassword,
    adminResetPassword: firestoreAdminResetPassword,
    deleteUser: firestoreDeleteUser,
    addRecord: firestoreAddRecord,
    updateRecord: firestoreUpdateRecord,
    deleteRecord: firestoreDeleteRecord,
    logActivity: logActivity,
    uploadToStorage: uploadToStorage,
    batchImportRecords: batchImportRecords,
    getDb: function () {
      if (!firestoreDb) {
        const res = initializeFirebaseApp();
        if (res.success) return res.db;
      }
      return firestoreDb;
    }
  };

  // Attempt auto-init and seed users on load if config exists
  if (window.FirebaseManager.isConfigured()) {
    initializeFirebaseApp();
    seedDefaultUsersIfEmpty();
  }
})();
