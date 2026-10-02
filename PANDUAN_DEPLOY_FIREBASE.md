# 🚀 Panduan Lengkap Deploy ke Google Firebase
## Telecom Operations & Infrastructure Lease Management Portal

Dokumen ini memandu Anda langkah demi langkah untuk melakukan **deployment penuh** portal ini ke **Google Firebase (Hosting & Cloud Firestore)**. Setelah proses deploy selesai, portal dapat diakses secara publik melalui internet dari laptop maupun smartphone petugas lapangan di mana saja tanpa perlu menjalankan server Python lokal.

---

## 📐 Arsitektur Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    PENGGUNA (Browser)                        │
│          Laptop Manajemen / HP Petugas Lapangan              │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              FIREBASE HOSTING (CDN Global)                   │
│  🌐 https://analytics-811fc.web.app                         │
│  📄 index.html, styles.css, app.js, firebase-config.js      │
│  🔒 SSL/HTTPS Otomatis & Gratis                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ Firebase JS SDK
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            GOOGLE CLOUD FIRESTORE (Database)                 │
│  📊 Koleksi: collo_records, sitac_records,                   │
│     gangguan_records, users, summary, rekap_efisiensi        │
│  🔄 Real-time sync & enkripsi otomatis                       │
└─────────────────────────────────────────────────────────────┘
```

### Info Project Firebase
| Item | Detail |
|------|--------|
| **Project ID** | `analytics-811fc` |
| **URL Publik** | https://analytics-811fc.web.app |
| **URL Alternatif** | https://analytics-811fc.firebaseapp.com |
| **Firebase Console** | https://console.firebase.google.com/project/analytics-811fc |

---

## 📁 File Konfigurasi yang Telah Disiapkan

| File | Fungsi |
|------|--------|
| `.firebaserc` | Menghubungkan direktori lokal ke project `analytics-811fc` |
| `firebase.json` | Pengaturan Hosting (ignore `.db`, `.xlsx`, `.py`, `scratch/`) |
| `firestore.rules` | Aturan keamanan akses Cloud Firestore |
| `firebase-config.js` | Kredensial SDK & engine sinkronisasi Firestore |

---

## 📋 Prasyarat Sebelum Deploy

Pastikan hal-hal berikut sudah terpenuhi:

- [x] **Node.js** terinstal (untuk Firebase CLI)
- [x] **Firebase CLI** v15.31.0 sudah terpasang (`firebase --version`)
- [x] **Akun Google** yang memiliki akses ke project `analytics-811fc`
- [x] **Koneksi internet** yang stabil

> **Jika Firebase CLI belum ada**, instal dengan:
> ```powershell
> npm install -g firebase-tools
> ```

---

## 🔧 Langkah Demi Langkah Deployment

### Langkah 1: Buka Terminal / PowerShell

Buka terminal dan masuk ke direktori project:

```powershell
cd "c:\Users\anggi\OneDrive\文件\rekap & report"
```

---

### Langkah 2: Login ke Akun Google Firebase

```powershell
firebase login
```

- Browser otomatis terbuka → halaman login Google
- Pilih akun Google yang memiliki project **`analytics-811fc`**
- Klik **"Allow"** / **"Izinkan"**
- Kembali ke terminal, akan muncul:
  ```
  ✔ Success! Logged in as nama_anda@gmail.com
  ```

> 💡 *Jika browser tidak terbuka otomatis, jalankan:*
> ```powershell
> firebase login --no-localhost
> ```
> *Lalu salin URL yang diberikan ke browser.*

---

### Langkah 3: Verifikasi Project yang Aktif

Pastikan project yang dipakai sudah benar:

```powershell
firebase use analytics-811fc
```

Output yang diharapkan:
```
Now using project analytics-811fc
```

---

### Langkah 4: Aktifkan Firestore di Firebase Console

> ⚠️ **PENTING** — Langkah ini hanya perlu dilakukan **SEKALI** saat pertama kali.

1. Buka https://console.firebase.google.com/project/analytics-811fc
2. Di sidebar kiri, klik **"Firestore Database"**
3. Klik **"Create database"**
4. Pilih lokasi server terdekat:
   - Rekomendasi: **`asia-southeast1` (Jakarta)** atau **`asia-southeast2` (Singapore)**
5. Pilih **"Start in test mode"** (bisa diperketat nanti)
6. Klik **"Create"**

---

### Langkah 5: Deploy Aturan Keamanan Firestore

Deploy security rules agar web app diizinkan membaca/menulis data:

```powershell
firebase deploy --only firestore:rules
```

Tunggu konfirmasi:
```
✔ Deploy complete!
```

---

### Langkah 6: Deploy Web Application ke Firebase Hosting 🚀

Ini adalah perintah utama untuk mengunggah seluruh tampilan web ke cloud:

```powershell
firebase deploy --only hosting
```

Proses deploy biasanya berlangsung **10 – 30 detik**. Di akhir proses, terminal menampilkan:

```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/analytics-811fc/overview
Hosting URL: https://analytics-811fc.web.app
```

> 💡 *Atau deploy semuanya sekaligus (Hosting + Firestore Rules):*
> ```powershell
> firebase deploy
> ```

---

### Langkah 7: Sinkronisasi Data Lokal ke Cloud Firestore

Agar data di cloud sama lengkapnya dengan database lokal (sirkuit colocation, perizinan SITAC, gangguan, akun PIC):

#### Opsi A — Melalui Browser (Paling Mudah) ✅

1. **Jalankan server lokal dulu** (data dibaca dari SQLite lokal):
   ```powershell
   python server.py
   ```
2. Buka browser: http://localhost:8888
3. Login sebagai **Administrator** (`admin` / `admin123`)
4. Di sidebar kiri bawah, klik status **"Google Firestore"**
5. Klik tombol **"Upload Data Lokal ke Firestore"**
6. Tunggu progress bar mencapai 100%
7. ✅ Semua data telah tersimpan permanen di cloud!

#### Opsi B — Melalui Script Python

```powershell
python upload_to_firebase.py
```

---

### Langkah 8: Verifikasi Deployment

1. Buka https://analytics-811fc.web.app di browser
2. Halaman login portal akan muncul
3. Login dengan akun admin:
   - **Username**: `admin`
   - **Password**: `admin123`
4. Pastikan data tampil di dashboard

---

## ✅ Ringkasan Perintah (Quick Reference)

```powershell
# 1. Login (sekali saja)
firebase login

# 2. Set project
firebase use analytics-811fc

# 3. Deploy rules + hosting
firebase deploy

# 4. Atau deploy hosting saja (untuk update tampilan)
firebase deploy --only hosting

# 5. Upload data lokal ke Firestore
python server.py          # jalankan server dulu
# lalu buka localhost:8888 → klik Upload ke Firestore
```

---

## 🔄 Cara Memperbarui Aplikasi (Redeploy)

Setiap kali ada perubahan kode (HTML, CSS, JS), cukup jalankan **1 perintah**:

```powershell
firebase deploy --only hosting
```

Revisi langsung aktif di internet dalam hitungan detik! 🎉

---

## 📱 Cara Mengakses Setelah Deploy

| Pengguna | Media Akses | Cara |
|----------|-------------|------|
| **Manajemen / Eksekutif** | Laptop / PC | Buka https://analytics-811fc.web.app |
| **Petugas Lapangan (PIC)** | HP Android / iPhone | Buka link di browser HP, login dengan akun PIC |

### Akun Default yang Tersedia

| Username | Password | Role | Nama |
|----------|----------|------|------|
| `admin` | `admin123` | Admin (Manajemen) | Administrator |
| `harlan` | `pic123` | Lapangan | Harlan |
| `budi` | `pic123` | Lapangan | Budi Rodiyah |
| `edi` | `pic123` | Lapangan | Edi Swargaloka |
| `abusopian` | `pic123` | Lapangan | M. Abusopian |
| `muhidin` | `pic123` | Lapangan | Muhidin |
| `brian` | `pic123` | Lapangan | Brian Ariyanto |
| `zulhadi` | `pic123` | Lapangan | Zulhadi Syahril |

> ⚠️ **Setelah deploy, segera ganti password default melalui menu Alat → Ganti Password Akun!**

---

## 💰 Informasi Kuota & Biaya (Firebase Spark Plan — GRATIS)

Project ini berjalan di atas **Firebase Spark Plan (Free Tier)**:

| Layanan | Kuota Gratis |
|---------|-------------|
| **Firebase Hosting** | Transfer 10 GB/bulan, penyimpanan 10 GB |
| **Cloud Firestore** | 50.000 reads & 20.000 writes per hari |
| **SSL Certificate** | 100% Gratis selamanya (HTTPS) |

Kapasitas gratis ini **lebih dari cukup** untuk kebutuhan operasional harian seluruh tim telekomunikasi Anda tanpa biaya langganan bulanan.

---

## ⚠️ Catatan Penting

### Perbedaan Mode Lokal vs Cloud

| Aspek | Mode Lokal (localhost) | Mode Cloud (Firebase) |
|-------|----------------------|----------------------|
| **Server** | `python server.py` harus jalan | Tidak perlu server |
| **Database** | SQLite (`telecom_portal.db`) | Cloud Firestore |
| **Akses** | Hanya jaringan lokal | Dari mana saja via internet |
| **Login** | API lokal `/api/auth/login` | Langsung via Firestore |
| **CRUD Data** | API REST lokal | Langsung via Firestore JS SDK |

### Keamanan Firestore

Saat ini `firestore.rules` mengizinkan semua akses (mode testing). Untuk produksi, perbarui rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Hanya user yang terautentikasi
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 🛠️ Troubleshooting

| Masalah | Solusi |
|---------|-------|
| `firebase: command not found` | Instal: `npm install -g firebase-tools` |
| `Error: Not logged in` | Jalankan: `firebase login` |
| `Permission denied` | Pastikan akun Google punya akses ke project |
| Data kosong di cloud | Jalankan sinkronisasi data (Langkah 7) |
| Halaman tidak update | Tunggu 1-2 menit, atau buka di incognito mode |
| `Firestore: PERMISSION_DENIED` | Deploy ulang rules: `firebase deploy --only firestore:rules` |
