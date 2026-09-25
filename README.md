# Telecom Infrastructure & Lease Operations Portal

Portal Terpadu Enterprise untuk Manajemen Sewa Colocation, Skema Revenue Sharing, Monitoring Perizinan SITAC, Tiket Gangguan Darurat, dan WebGIS Sebaran Lokasi.

---

## 🚀 Fitur Utama

1. **Dashboard Ringkasan Eksekutif**
   - KPI Portofolio Sewa Colocation & Interkoneksi (880 sirkuit aktif).
   - Efisiensi perizinan SITAC PA (Rp 2,82 Miliar penghematan).
   - Monitoring tiket darurat fiber optic & insiden utilitas.
   - Grafik analitik interaktif (Top Mitra, Tren Bulanan, Distribusi Kategori).

2. **Manajemen Sewa Colocation & Interkoneksi**
   - Daftar 3.123 sirkuit (Active, Non-Active, Deactivasi).
   - Rekap finansial real-time: Revenue sewa tahunan, biaya sewa mitra, dan margin operasional.
   - Filter cepat berdasarkan pengelola (MM2100, Patra Jasa, dsb.) dan jenis sewa.

3. **Skema Revenue Sharing Mitra**
   - Monitoring khusus 423 kontrak bagi hasil (skema 7.5% s/d 35%).
   - Kalkulasi otomatis nominal bagi hasil mitra dalam Rupiah.
   - Analitik perbandingan pendapatan vs bagi hasil per pengelola.

4. **Monitoring Jatuh Tempo Kontrak (Alerts)**
   - Deteksi otomatis sisa masa berlaku kontrak sewa:
     - 🔴 Critical (<30 hari)
     - 🟡 Warning (30-60 hari)
     - 🟢 Safe (>60 hari)
     - ⚪ Expired / Overdue

5. **Monitoring Perizinan Proyek SITAC (PA)**
   - 451 penugasan izin jalur kabel FO & infrastruktur.
   - Pelacakan progress (*Finish, Ongoing, Hold, Cancel*).
   - Perhitungan otomatis efisiensi negosiasi retribusi (*Cost Saving*).

6. **Tiket Gangguan Darurat (Trouble Tickets)**
   - Monitoring insiden FO Cut, tiang roboh, dan pekerjaan relokasi utilitas.
   - Pelacakan SLA darurat dan pembaruan catatan lapangan.

7. **Peta Sebaran Lokasi (WebGIS Leaflet)**
   - Visualisasi interaktif sebaran 451 titik lokasi lapangan di Jabodetabek, Banten, dan Jawa Barat.
   - Dukungan 3 mode tampilan peta: **Peta Standar (OSM)**, **Citra Satelit Riil (Esri)**, dan **Mode Gelap (Carto Dark)**.
   - Filter status dinamis dan zoom otomatis (*fit bounds*).

8. **Keamanan & Kontrol Akses Berbasis Peran (RBAC)**
   - **Tim Lapangan**: Akses khusus operasional perizinan SITAC, insiden gangguan, dan peta sebaran.
   - **Manajemen / Admin**: Akses menyeluruh termasuk data finansial dan colocation.

---

## 💻 Cara Menjalankan

### Persyaratan
* Python 3.9+ (sudah termasuk `sqlite3`)

### Langkah Menjalankan
1. Jalankan server lokal:
   ```bash
   python server.py
   ```
2. Buka browser dan akses:
   ```
   http://localhost:8888
   ```

### Kredensial Masuk
* **Manajemen / Admin**: `admin` / `admin123`
* **Tim Lapangan**: `lapangan` / `lapangan123`
*(Tersedia tombol 1-Click Quick Access di halaman login).*

---

## 📁 Struktur Berkas

* `index.html` - Struktur tampilan portal antarmuka web.
* `app.js` - Logika interaksi frontend, chart rendering, WebGIS Leaflet, dan API handler.
* `styles.css` - Desain UI modern dark-mode enterprise.
* `server.py` - Backend server Python HTTP + SQLite API RESTful.
* `telecom_portal.db` - Basis data SQLite terpadu.
* `migrate_telecom_db.py` - Skrip ekstraksi dan migrasi data dari Excel ke SQLite.
