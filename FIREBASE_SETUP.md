# Panduan Integrasi Google Firebase (Cloud Firestore)
## Telecom Operations & Infrastructure Lease Management Portal

Panduan ini menjelaskan langkah demi langkah cara menghubungkan dashboard ini dengan database **Google Cloud Firestore (Firebase)** agar data operasional Anda tersimpan di cloud dan dapat diakses/diperbarui secara real-time oleh seluruh tim dan petugas lapangan tanpa perlu menjalankan server Python lokal.

---

### Mengapa Menggunakan Google Firebase?
1. **Akses dari Mana Saja**: Petugas lapangan / PIC dapat membuka portal langsung dari smartphone atau laptop di lokasi site tanpa harus berada di jaringan lokal yang sama.
2. **Real-Time Synchronization**: Ketika seorang teknisi memperbarui status tiket gangguan atau proyek SITAC, perubahan langsung muncul di layar manajemen seketika.
3. **Gratis (Firebase Spark Plan)**: Cloud Firestore menyediakan kuota gratis 50.000 read dan 20.000 write per hari, sangat mencukupi untuk operasional harian.
4. **Arsitektur Hybrid Resilient**: Jika koneksi internet terputus atau Firebase belum diset, portal tetap bekerja 100% normal menggunakan database lokal (Zero-Downtime).

---

### Langkah 1: Buat Project Firebase Gratis

1. Kunjungi [Google Firebase Console](https://console.firebase.google.com/) dan login menggunakan akun Google Anda.
2. Klik tombol **"Add project"** (Tambah Project).
3. Beri nama project Anda, misalnya: `telecom-portal-ops`.
4. (Opsional) Google Analytics dapat dinonaktifkan jika tidak diperlukan, lalu klik **"Create project"**.
5. Tunggu beberapa detik hingga proses selesai, lalu klik **"Continue"**.

---

### Langkah 2: Aktifkan Database Cloud Firestore

1. Di menu navigasi sebelah kiri, klik **Build** > **Firestore Database**.
2. Klik tombol **"Create database"**.
3. Pilih lokasi server database, disarankan memilih yang terdekat dengan Indonesia:
   - `asia-southeast2` (Jakarta) atau
   - `asia-southeast1` (Singapura).
4. Pada pemilihan Security Rules, pilih **"Start in test mode"** (atau atur aturan keamanan seperti pada Langkah 3).
5. Klik **"Enable"**.

---

### Langkah 3: Konfigurasi Firestore Security Rules

Di tab **Rules** pada menu Firestore Database, pastikan aturan mengizinkan pembacaan dan penulisan data:

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
*Catatan: Aturan di atas mengizinkan akses tim internal. Di lingkungan produksi publik, Anda dapat mengaitkannya dengan Firebase Authentication.*

Klik tombol **"Publish"** di pojok kanan atas untuk menyimpan aturan.

---

### Langkah 4: Daftarkan Web App & Salin Kunci Konfigurasi

1. Masuk ke halaman **Project Overview** (klik ikon gerigi ⚙️ di kiri atas > **Project settings**).
2. Di bagian bawah tab **General**, pada bagian *"Your apps"*, klik ikon Web (`</>`).
3. Beri nama aplikasi web, misalnya: `Telecom Portal Web`.
4. Centang atau abaikan Firebase Hosting, lalu klik **"Register app"**.
5. Salin blok kode `firebaseConfig` yang tampil di layar. Contohnya:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "telecom-portal-ops.firebaseapp.com",
  projectId: "telecom-portal-ops",
  storageBucket: "telecom-portal-ops.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxx"
};
```

---

### Langkah 5: Hubungkan ke Portal (Pilih Salah Satu Cara)

#### Cara A: Langsung dari Tampilan Web Portal (Paling Cepat & Praktis)
1. Buka portal di browser Anda: [http://localhost:8888/](http://localhost:8888/).
2. Di navbar atas, klik tombol status: **"Firebase: Local Mode"** (tombol berwarna kuning).
3. Modal pengaturan Firebase akan terbuka.
4. **Tempel seluruh blok kode `const firebaseConfig = { ... }`** ke kotak teks *"Tempel Objek Konfigurasi Firebase"*.
5. Klik tombol **"Ekstrak Otomatis"** (sistem otomatis mengisi API Key, Project ID, dll).
6. Klik **"Simpan & Terapkan"**. Status navbar akan berubah menjadi 🟢 **"Firebase: Cloud ([Project-ID])"**.
7. Klik tombol **"Upload Data Lokal ke Firestore"**. Seluruh 2.301 data Colocation, 451 SITAC, 98 Gangguan, dan Akun PIC Lapangan akan otomatis diunggah ke cloud!

---

#### Cara B: Mengisi File `firebase-config.js`
Buka file `firebase-config.js` di teks editor, lalu tempel nilai kredensial ke objek `DEFAULT_FIREBASE_CONFIG`:

```javascript
window.DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "telecom-portal-ops.firebaseapp.com",
  projectId: "telecom-portal-ops",
  storageBucket: "telecom-portal-ops.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxx"
};
```
Simpan file, lalu refresh browser Anda.

---

#### Cara C: Mengunggah Data Melalui Terminal Python CLI
Jika ingin mengunggah data dari terminal tanpa membuka browser:
```bash
python upload_to_firebase.py --project NAMA_PROJECT_FIREBASE_ANDA
```
*Contoh:*
```bash
python upload_to_firebase.py --project telecom-portal-ops
```
Script akan membaca database SQLite lokal dan melakukan batch upload langsung ke Google Cloud Firestore.

---

### Struktur Koleksi Cloud Firestore yang Digunakan:
- `users` : Akun resmi PIC lapangan (Harlan, Budi, Edi, Abusopian, Muhidin, Brian, Zulhadi) & Admin dengan hash SHA-256.
- `sitac_records` : 451 proyek perizinan SITAC, status target, aging, dan koordinat WebGIS.
- `gangguan_records` : 98 tiket gangguan darurat (open, in progress, closed).
- `collo_records` : 2.301 link sewa colocation, tarif sewa, skema revenue sharing, dan margin finansial.
- `rekap_efisiensi` : Rekapitulasi efisiensi biaya sewa tahunan.
- `summary` : Metrik ringkasan eksekutif (total pendapatan, biaya, margin).
