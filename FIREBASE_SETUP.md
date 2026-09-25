# Panduan Integrasi Google Firebase (Cloud Firestore)
## Network Operations & Infrastructure Lease Management Dashboard

Panduan ini menjelaskan langkah demi langkah cara menghubungkan dashboard ini dengan database **Google Cloud Firestore (Firebase)** agar data operasional Anda tersimpan di cloud dan dapat diakses/diperbarui secara real-time.

---

### Langkah 1: Buat Project Firebase Gratis

1. Kunjungi [Google Firebase Console](https://console.firebase.google.com/) dan login menggunakan akun Google Anda.
2. Klik tombol **"Add project"** (Tambah Project).
3. Beri nama project Anda, misalnya: `network-ops-dashboard`.
4. (Opsional) Google Analytics dapat dinonaktifkan jika tidak diperlukan, lalu klik **"Create project"**.
5. Tunggu beberapa detik hingga project selesai dibuat, lalu klik **"Continue"**.

---

### Langkah 2: Aktifkan Database Cloud Firestore

1. Di menu navigasi sebelah kiri, klik **Build** > **Firestore Database**.
2. Klik tombol **"Create database"**.
3. Pilih lokasi server database, disarankan memilih yang terdekat dengan Indonesia, misalnya: `asia-southeast2` (Jakarta) atau `asia-southeast1` (Singapura).
4. Pada pemilihan Security Rules, pilih **"Start in test mode"** (atau atur aturan keamanan seperti di Langkah 3).
5. Klik **"Enable"**.

---

### Langkah 3: Konfigurasi Firestore Security Rules

Di tab **Rules** pada Firestore Database, pastikan aturan mengizinkan pembacaan dan penulisan:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
*Catatan: Aturan di atas cocok untuk pengujian internal tim. Di lingkungan produksi publik, Anda dapat mengaktifkan Firebase Authentication.*

Klik **"Publish"** untuk menyimpan aturan.

---

### Langkah 4: Daftarkan Web App & Dapatkan Kunci Konfigurasi

1. Di halaman Project Overview (ikon gerigi ⚙️ di kiri atas > **Project settings**).
2. Di bagian bawah tab **General**, pada bagian *"Your apps"*, klik ikon Web (`</>`).
3. Beri nama aplikasi, misalnya: `Network Dashboard Web`.
4. Centang atau abaikan Firebase Hosting, lalu klik **"Register app"**.
5. Salin objek `firebaseConfig` yang tampil di layar. Bentuknya seperti berikut:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "network-ops-12345.firebaseapp.com",
  projectId: "network-ops-12345",
  storageBucket: "network-ops-12345.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxx"
};
```

---

### Langkah 5: Hubungkan ke Dashboard (Pilih Salah Satu Cara)

#### Cara A: Langsung dari Antarmuka Web Dashboard (Paling Mudah)
1. Buka dashboard di browser Anda: [http://localhost:8888/](http://localhost:8888/).
2. Di pojok kanan atas navbar, klik tombol status: **"Firebase: Local Mode"**.
3. Modal Pengaturan Firebase akan terbuka. Masukkan / tempel nilai `API Key`, `Project ID`, `Auth Domain`, dll.
4. Klik **"Simpan & Test Koneksi"**.
5. Jika status berubah menjadi 🟢 **"Connected"**, klik tombol **"Sync / Upload Data ke Firestore"**.
6. Dashboard akan mengunggah seluruh data (3.123 Collo, 451 SITAC, 393 Gangguan) langsung dari browser Anda!

#### Cara B: Tempel ke File `firebase-config.js`
Buka file `firebase-config.js` di editor, lalu isi objek `DEFAULT_FIREBASE_CONFIG`:
```javascript
window.DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "network-ops-12345.firebaseapp.com",
  projectId: "network-ops-12345",
  storageBucket: "network-ops-12345.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxx"
};
```
Simpan file, lalu refresh browser Anda.

#### Cara C: Melalui Script Python CLI
Anda juga dapat menyinkronkan data menggunakan script Python:
```bash
python upload_to_firebase.py --project network-ops-12345
```
*(Gantilah `network-ops-12345` dengan Project ID Firebase Anda)*.

---

### Keunggulan Arsitektur Hybrid Resilient
- **Tahan Gangguan (Zero-Downtime)**: Jika koneksi internet terputus atau Firebase belum dikonfigurasi, dashboard **tetap dapat berjalan 100% normal** menggunakan data lokal berkecepatan tinggi (`sitac_collo_data.js`).
- **Indikator Transparan**: Navbar selalu menampilkan status apakah data sedang dimuat dari Cloud Firestore (🟢 *Firebase: Cloud*) atau dari penyimpanan lokal (🟡 *Local Mode*).
