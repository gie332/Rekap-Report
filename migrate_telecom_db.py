#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Database Migration Script: Telecom Infrastructure & Lease Operations Portal
Extracts data from:
1. Report Sitac  2026 FIX.xlsx (SITAC, Gangguan, Rekap Efisiensi)
2. Rekap Collo x Interkoneksi 2024 V2 ROM 22 Nov(1).xlsx (Colocation & Interkoneksi)
Generates: telecom_portal.db (SQLite database with normalized schema & indexes)
"""

import os
import sys
import re
import datetime
import sqlite3
import openpyxl

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_SITAC = os.path.join(BASE_DIR, "Report Sitac  2026 FIX.xlsx")
FILE_COLLO = os.path.join(BASE_DIR, "Rekap Collo x Interkoneksi 2024 V2 ROM 22 Nov(1).xlsx")
DB_PATH = os.path.join(BASE_DIR, "telecom_portal.db")

# Known Jabodetabek coordinates lookup table for fallback geocoding
KNOWN_COORDINATES = {
    'midpoint': (-6.1819, 106.8299),
    'kpk': (-6.1976, 106.8230),
    'kemenpppa': (-6.1670, 106.8086),
    'duraquipt': (-6.4112, 106.8500),
    'siab': (-6.1116, 106.8446),
    'ancol': (-6.1188, 106.8086),
    'comtronics': (-6.2488, 106.9732),
    'hipernet': (-6.1802, 106.8038),
    'feprotama': (-6.1834, 106.6562),
    'mustika jaya': (-6.1638, 106.8066),
    'mnc vision': (-6.2000, 106.8164),
    'koperpu': (-6.2632, 106.9570),
    'grand mutiara gading': (-6.2326, 106.9984),
    'simatupang': (-6.2538, 106.7886),
    'kopi': (-6.1892, 106.8146),
    'jiexpo': (-6.1694, 106.8322),
    'tugu': (-6.3788, 106.8446),
    'giic': (-6.2208, 106.8936),
    'meruya': (-6.1784, 106.8128),
    'recapital': (-6.2036, 106.7984),
    'rasuna said': (-6.1730, 106.8398),
    'ridwan rais': (-6.1982, 106.8254),
    'danareksa': (-6.1548, 106.8576),
    'pegangsaan': (-6.1706, 106.8972),
    'panasonic': (-6.1998, 106.8486),
    'pertamina': (-6.2072, 106.8362),
    'hos cokroaminoto': (-6.2448, 106.8396),
    'cibubur': (-6.2398, 106.9624),
    'tanah abang': (-6.2125, 106.7885),
    'kalibata': (-6.2508, 106.8876),
    'gedung cyber': (-6.2496, 106.8310),
    'senayan': (-6.2017, 106.8425),
    'fatmawati': (-6.2108, 106.8182),
    'sudirman': (-6.2204, 106.8472),
    're abdullah': (-6.5698, 106.8008),
    'cempaka': (-6.2252, 106.8020),
    'makrik': (-6.2272, 106.9696),
    'jamsostek': (-6.1578, 106.8816),
    'hybrida': (-6.1638, 106.8066),
    'kenari': (-6.1982, 106.8254),
    'kelapa dua': (-6.4184, 106.8140),
    'cikarang': (-6.2610, 107.1520),
    'cibitung': (-6.2650, 107.0980),
    'bekasi': (-6.2383, 106.9756),
    'tangerang': (-6.1783, 106.6319),
    'depok': (-6.4025, 106.7942),
    'serpong': (-6.3210, 106.6690),
    'greenlake': (-6.1850, 106.7020),
    'bogor': (-6.5950, 106.7900),
    'bojong': (-6.4950, 106.7950),
    'serang': (-6.1100, 106.1500),
    'karawang': (-6.3150, 107.2950),
    'jakarta': (-6.2000, 106.8200)
}

def clean_text(val):
    if val is None: return ""
    s = str(val).strip()
    if s.lower() in ("none", "null", "-"): return ""
    return s

def parse_currency(val):
    if val is None: return 0, ""
    if isinstance(val, (int, float)): return int(round(val)), ""
    val_str = str(val).strip()
    if not val_str or val_str in ("-", "None", "0"): return 0, ""

    in_kind = ['sampah', 'liter', 'meter', 'kabel', 'fiber', 'unit', 'buah', 'semen', 'cat', 'wifi']
    if any(k in val_str.lower() for k in in_kind): return 0, val_str

    if not re.search(r'\d', val_str): return 0, val_str

    cleaned = re.sub(r'[^\d.,]', '', val_str)
    if '.' in cleaned and ',' not in cleaned:
        parts = cleaned.split('.')
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            cleaned = cleaned.replace('.', '')
        else:
            cleaned = cleaned.replace('.', '')
    elif ',' in cleaned and '.' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    elif ',' in cleaned:
        cleaned = cleaned.replace(',', '.')

    try:
        num = float(cleaned)
        return int(round(num)), (val_str if " " in val_str and not val_str.startswith("Rp") else "")
    except ValueError:
        return 0, val_str

def parse_date(val):
    if val is None: return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("none", "null", "-", "0000-00-00"):
        return None
    match = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', val_str)
    if match:
        y, m, d = match.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    match = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})', val_str)
    if match:
        d, m, y = match.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    return None

def parse_rev_sharing(val):
    """
    Normalisasi nilai Rev Sharing (%) ke format desimal (misal 0.15 untuk 15%).
    Mendukung format integer/float (0.15), string ('15%', '10%', '0.15', '20%').
    """
    if val is None: return "", 0.0
    val_str = str(val).strip()
    if not val_str or val_str in ("-", "None", "0"): return "", 0.0

    # Jika angka float murni
    if isinstance(val, (int, float)):
        num = float(val)
        if num > 1.0: # Jika ditulis 15 artinya 15% -> 0.15
            num = num / 100.0
        return f"{round(num * 100, 1)}%", round(num, 4)

    # Jika string '15%' atau '15 %'
    m_pct = re.search(r'([\d.,]+)\s*%', val_str)
    if m_pct:
        try:
            num = float(m_pct.group(1).replace(',', '.'))
            pct = num / 100.0
            return f"{round(num, 1)}%", round(pct, 4)
        except ValueError:
            pass

    # Jika string desimal '0.15' atau '0,15'
    m_dec = re.search(r'0[.,](\d+)', val_str)
    if m_dec:
        try:
            num = float(val_str.replace(',', '.'))
            return f"{round(num * 100, 1)}%", round(num, 4)
        except ValueError:
            pass

    # Jika angka murni dalam string misal '15'
    m_num = re.search(r'^(\d{1,2}(\.\d+)?)$', val_str)
    if m_num:
        try:
            num = float(m_num.group(1))
            if num > 1.0:
                pct = num / 100.0
                return f"{round(num, 1)}%", round(pct, 4)
            else:
                return f"{round(num * 100, 1)}%", round(num, 4)
        except ValueError:
            pass

    return val_str, 0.0

def parse_int_safe(val, default=None):
    if val is None: return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default

def extract_coords(text):
    if not text: return None, None, "NONE"
    t_str = str(text)

    # 1. Exact tikor: lat, lon
    m = re.search(r'(-?[0-8]\.\d{3,8})[,\s/]+(10[5-8]\.\d{3,8})', t_str)
    if m:
        try:
            return float(m.group(1)), float(m.group(2)), "EXACT"
        except ValueError: pass

    # 2. Known POI lookup
    tl = t_str.lower()
    for kw, (lat, lon) in KNOWN_COORDINATES.items():
        if kw in tl:
            return lat, lon, "GEOCODED"

    return -6.2000, 106.8200, "DEFAULT_JAKARTA"

def init_sqlite_schema(conn):
    cursor = conn.cursor()
    cursor.executescript("""
    DROP TABLE IF EXISTS collo_records;
    CREATE TABLE collo_records (
        id INTEGER PRIMARY KEY,
        pengelola TEXT,
        pelanggan TEXT,
        alamat_pengelola TEXT,
        originating TEXT,
        terminating TEXT,
        metode_kerjasama TEXT,
        jenis_sewa TEXT,
        no_so TEXT,
        sid TEXT,
        sla TEXT,
        layanan TEXT,
        kapasitas TEXT,
        rev_otc INTEGER DEFAULT 0,
        rev_sewa_tahun INTEGER DEFAULT 0,
        biaya_deposit INTEGER DEFAULT 0,
        biaya_otc INTEGER DEFAULT 0,
        biaya_sewa_tahun INTEGER DEFAULT 0,
        margin_rupiah INTEGER DEFAULT 0,
        margin_persen REAL DEFAULT 0.0,
        rev_sharing_raw TEXT,
        rev_sharing_pct REAL DEFAULT 0.0,
        biaya_rev_sharing INTEGER DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        is_active INTEGER DEFAULT 0,
        proses_admin TEXT,
        sisa_hari INTEGER DEFAULT 0,
        alert_category TEXT,
        alert_label TEXT,
        alert_color TEXT,
        ref_spp TEXT,
        spp TEXT,
        po_baru TEXT,
        pic_admin TEXT,
        pic_rekanan TEXT,
        telp TEXT,
        keterangan TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_collo_status ON collo_records(status);
    CREATE INDEX idx_collo_is_active ON collo_records(is_active);
    CREATE INDEX idx_collo_pengelola ON collo_records(pengelola);
    CREATE INDEX idx_collo_pelanggan ON collo_records(pelanggan);
    CREATE INDEX idx_collo_alert_cat ON collo_records(alert_category);
    CREATE INDEX idx_collo_rev_share ON collo_records(rev_sharing_pct);

    DROP TABLE IF EXISTS sitac_records;
    CREATE TABLE sitac_records (
        id INTEGER PRIMARY KEY,
        excel_no INTEGER,
        no_pa TEXT,
        pelanggan TEXT,
        ptl TEXT,
        pic_perijinan TEXT,
        tiering TEXT,
        poin INTEGER,
        terminating TEXT,
        latitude REAL,
        longitude REAL,
        coord_type TEXT,
        biaya_permintaan_awal INTEGER DEFAULT 0,
        catatan_biaya_awal TEXT,
        sewa_otc TEXT,
        biaya_final INTEGER DEFAULT 0,
        biaya_sewa_bulan INTEGER DEFAULT 0,
        efisiensi_rupiah INTEGER DEFAULT 0,
        efisiensi_persen REAL DEFAULT 0.0,
        is_berbiaya INTEGER DEFAULT 0,
        progress TEXT,
        date_pa TEXT,
        date_dispos TEXT,
        date_close TEXT,
        durasi_hari INTEGER,
        aging_category TEXT,
        update_pekerjaan TEXT,
        bulan INTEGER,
        tahun INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_sitac_progress ON sitac_records(progress);
    CREATE INDEX idx_sitac_pic ON sitac_records(pic_perijinan);
    CREATE INDEX idx_sitac_tahun ON sitac_records(tahun);
    CREATE INDEX idx_sitac_aging ON sitac_records(aging_category);

    DROP TABLE IF EXISTS gangguan_records;
    CREATE TABLE gangguan_records (
        id INTEGER PRIMARY KEY,
        no_tiket TEXT,
        tgl_dispos TEXT,
        tgl_selesai TEXT,
        terminating TEXT,
        jenis_gangguan TEXT,
        pic_perijinan TEXT,
        biaya_gangguan INTEGER DEFAULT 0,
        status_pekerjaan TEXT,
        is_selesai INTEGER DEFAULT 0,
        update_gangguan TEXT,
        sla_target TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_gangguan_status ON gangguan_records(is_selesai);
    CREATE INDEX idx_gangguan_pic ON gangguan_records(pic_perijinan);

    DROP TABLE IF EXISTS rekap_efisiensi;
    CREATE TABLE rekap_efisiensi (
        tahun INTEGER PRIMARY KEY,
        total_disposisi INTEGER,
        ada_biaya INTEGER,
        tidak_ada_biaya INTEGER,
        nilai_awal INTEGER,
        nilai_akhir INTEGER,
        efisiensi_rupiah INTEGER,
        efisiensi_persen REAL
    );
    """)
    conn.commit()

def migrate_sitac_and_gangguan(conn):
    print(f"[INFO] Membaca File 1: {FILE_SITAC}...")
    wb = openpyxl.load_workbook(FILE_SITAC, data_only=True)
    cursor = conn.cursor()

    # 1. Master RAW data
    ws_master = wb["Master RAW data"]
    rows = list(ws_master.iter_rows(values_only=True))
    header = rows[0]
    col_map = {str(col).strip().upper(): i for i, col in enumerate(header) if col is not None}

    master_count = 0
    for r in rows[1:]:
        if not any(r): continue
        no_val = r[col_map.get("NO", 0)]
        if no_val is None: continue
        try:
            excel_no = int(float(str(no_val).strip()))
        except ValueError:
            continue

        no_pa = clean_text(r[col_map.get("NO PA", 1)])
        pelanggan = clean_text(r[col_map.get("PELANGGAN", 2)])
        ptl = clean_text(r[col_map.get("PTL", 3)])
        pic = clean_text(r[col_map.get("PIC PERIJINAN", 4)])
        tiering = clean_text(r[col_map.get("TIERING", 5)])
        poin = parse_int_safe(r[col_map.get("POIN", 6)])
        terminating = clean_text(r[col_map.get("TERMINATING", 7)])

        lat, lon, coord_type = extract_coords(terminating)

        b_awal_raw = r[col_map.get("BIAYA PERMINTAAN AWAL", 8)]
        b_awal, c_awal = parse_currency(b_awal_raw)
        sewa_otc = clean_text(r[col_map.get("SEWA/OTC", 9)]) or "-"
        b_final_raw = r[col_map.get("BIAYA FINAL", 10)]
        b_final, _ = parse_currency(b_final_raw)
        b_bulan = parse_currency(r[col_map.get("BIAYA SEWA / BULAN", 11)])[0]

        efisiensi_rp = max(0, b_awal - b_final)
        efisiensi_pct = round((efisiensi_rp / b_awal * 100), 2) if b_awal > 0 else 0.0
        is_berbiaya = 1 if (b_awal > 0 or b_final > 0) else 0

        progress_raw = clean_text(r[col_map.get("PROGRESS", 12)])
        pl = progress_raw.lower()
        if "finish" in pl: progress = "Finish"
        elif "ongoing" in pl or "on going" in pl or "on-going" in pl: progress = "Ongoing"
        elif "hold" in pl: progress = "Hold"
        elif "cancel" in pl: progress = "Cancel"
        else: progress = progress_raw.title() or "Ongoing"

        date_pa = parse_date(r[col_map.get("DATE PA", 13)])
        date_dispos = parse_date(r[col_map.get("DATE DISPOS", 14)])
        date_close = parse_date(r[col_map.get("DATE CLOSE", 15)])

        durasi_hari = None
        if date_dispos and date_close:
            try:
                d1 = datetime.datetime.strptime(date_dispos, "%Y-%m-%d")
                d2 = datetime.datetime.strptime(date_close, "%Y-%m-%d")
                durasi_hari = max(0, (d2 - d1).days)
            except Exception: pass

        if durasi_hari is None or durasi_hari < 0:
            aging_category = "green"
        elif durasi_hari <= 7:
            aging_category = "green"
        elif durasi_hari <= 14:
            aging_category = "yellow"
        else:
            aging_category = "red"

        update_text = clean_text(r[col_map.get("UPDATE PEKERJAAN", 16)])
        bulan = parse_int_safe(r[col_map.get("BULAN", 17)])
        tahun = parse_int_safe(r[col_map.get("TAHUN", 18)])

        cursor.execute("""
            INSERT INTO sitac_records (
                excel_no, no_pa, pelanggan, ptl, pic_perijinan, tiering, poin,
                terminating, latitude, longitude, coord_type,
                biaya_permintaan_awal, catatan_biaya_awal, sewa_otc, biaya_final,
                biaya_sewa_bulan, efisiensi_rupiah, efisiensi_persen, is_berbiaya,
                progress, date_pa, date_dispos, date_close, durasi_hari, aging_category,
                update_pekerjaan, bulan, tahun
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            excel_no, no_pa, pelanggan, ptl, pic, tiering, poin,
            terminating, lat, lon, coord_type,
            b_awal, c_awal, sewa_otc, b_final,
            b_bulan, efisiensi_rp, efisiensi_pct, is_berbiaya,
            progress, date_pa, date_dispos, date_close, durasi_hari, aging_category,
            update_text, bulan, tahun
        ))
        master_count += 1

    # 2. GANGGUAN
    # 2. GANGGUAN
    ws_g = wb["GANGGUAN"]
    g_rows = list(ws_g.iter_rows(values_only=True))[1:]
    gangguan_count = 0
    for idx, r in enumerate(g_rows, start=1):
        if not any(r): continue
        no_val = r[0] if len(r) > 0 else None
        pa_tiket = clean_text(r[3] if len(r) > 3 else "")
        terminating = clean_text(r[4] if len(r) > 4 else "")
        jenis = clean_text(r[8] if len(r) > 8 else "")
        if no_val is None and not pa_tiket and not terminating and not jenis: continue

        no_tiket = pa_tiket or f"TIKET-{idx:04d}"
        tgl_dispos = parse_date(r[1] if len(r) > 1 else None)
        tgl_selesai = parse_date(r[2] if len(r) > 2 else None)
        pic = clean_text(r[6] if len(r) > 6 else "")
        biaya = parse_currency(r[10] if len(r) > 10 else None)[0]
        update_text = clean_text(r[11] if len(r) > 11 else "")
        is_selesai = 1 if (tgl_selesai is not None or "selesai" in update_text.lower()) else 0
        status_pekerjaan = "Selesai" if is_selesai else "Proses (Open)"

        cursor.execute("""
            INSERT INTO gangguan_records (
                no_tiket, tgl_dispos, tgl_selesai, terminating, jenis_gangguan,
                pic_perijinan, biaya_gangguan, status_pekerjaan, is_selesai,
                update_gangguan, sla_target
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            no_tiket, tgl_dispos, tgl_selesai, terminating, jenis,
            pic, biaya, status_pekerjaan,
            is_selesai, update_text, "H+1"
        ))
        gangguan_count += 1

    # 3. Rekap Efesiensi
    rekap_count = 0
    if "Rekap Efesiensi Biaya Perijinan" in wb.sheetnames:
        for r in wb["Rekap Efesiensi Biaya Perijinan"].iter_rows(values_only=True):
            if not any(r): continue
            v0 = str(r[0]).strip() if r[0] is not None else ""
            if v0 in ("2024", "2025", "2026"):
                n_awal = parse_currency(r[3])[0]
                n_akhir = parse_currency(r[4])[0]
                cursor.execute("""
                    INSERT OR REPLACE INTO rekap_efisiensi (
                        tahun, total_disposisi, ada_biaya, tidak_ada_biaya,
                        nilai_awal, nilai_akhir, efisiensi_rupiah, efisiensi_persen
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    int(v0), parse_int_safe(r[1], 0), parse_int_safe(r[2], 0),
                    parse_int_safe(r[5], 0), n_awal, n_akhir,
                    max(0, n_awal - n_akhir),
                    round(((n_awal - n_akhir) / n_awal * 100), 2) if n_awal > 0 else 0.0
                ))
                rekap_count += 1

    conn.commit()
    wb.close()
    print(f"[SUCCESS] File 1 termigrasi: {master_count} SITAC, {gangguan_count} Gangguan, {rekap_count} Rekap.")

def migrate_collocation(conn):
    print(f"[INFO] Membaca File 2: {FILE_COLLO} (Sheet: Raw Data)...")
    wb = openpyxl.load_workbook(FILE_COLLO, data_only=True)
    ws = wb["Raw Data"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    cursor = conn.cursor()

    today = datetime.date.today()
    collo_count = 0

    for r in rows:
        if not any(r): continue
        pengelola = clean_text(r[1] if len(r) > 1 else None)
        pelanggan = clean_text(r[2] if len(r) > 2 else None)
        if not pengelola and not pelanggan: continue

        alamat_pengelola = clean_text(r[3] if len(r) > 3 else "")
        originating = clean_text(r[5] if len(r) > 5 else "")
        terminating = clean_text(r[6] if len(r) > 6 else "")
        metode_kerjasama = clean_text(r[7] if len(r) > 7 else "")
        jenis_sewa = clean_text(r[8] if len(r) > 8 else "")
        no_so = clean_text(r[9] if len(r) > 9 else "")
        sid = clean_text(r[10] if len(r) > 10 else "")
        sla = clean_text(r[11] if len(r) > 11 else "")
        layanan = clean_text(r[12] if len(r) > 12 else "")
        kapasitas = clean_text(r[13] if len(r) > 13 else "")

        rev_otc = parse_currency(r[14] if len(r) > 14 else None)[0]
        rev_sewa_tahun = parse_currency(r[15] if len(r) > 15 else None)[0]
        biaya_deposit = parse_currency(r[16] if len(r) > 16 else None)[0]
        biaya_otc = parse_currency(r[17] if len(r) > 17 else None)[0]
        biaya_sewa_tahun = parse_currency(r[18] if len(r) > 18 else None)[0]

        # Normalisasi Revenue Sharing
        raw_sharing = r[19] if len(r) > 19 else None
        rev_sharing_str, rev_sharing_pct = parse_rev_sharing(raw_sharing)
        biaya_rev_sharing = int(round(rev_sewa_tahun * rev_sharing_pct)) if rev_sharing_pct > 0 else 0

        start_date = parse_date(r[20] if len(r) > 20 else None)
        end_date = parse_date(r[21] if len(r) > 21 else None)

        status_raw = clean_text(r[22] if len(r) > 22 else "").upper()
        if "ACTIVE" in status_raw and "NON" not in status_raw and "DE" not in status_raw:
            status = "ACTIVE"
            is_active = 1
        elif "DEACTIVASI" in status_raw or "DEAKTIVASI" in status_raw:
            status = "DEACTIVASI"
            is_active = 0
        elif "NON" in status_raw:
            status = "NON ACTIVE"
            is_active = 0
        else:
            status = status_raw or "NON ACTIVE"
            is_active = 0

        proses_admin = clean_text(r[23] if len(r) > 23 else "")
        sisa_hari_excel = parse_int_safe(r[25] if len(r) > 25 else None)

        sisa_hari = sisa_hari_excel
        if end_date:
            try:
                ed = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
                sisa_hari_calc = (ed - today).days
                if sisa_hari is None:
                    sisa_hari = sisa_hari_calc
            except Exception: pass
        if sisa_hari is None: sisa_hari = 999

        if sisa_hari <= 0:
            alert_category = "EXPIRED"
            alert_label = "Expired / Overdue"
            alert_color = "red"
        elif sisa_hari < 30:
            alert_category = "CRITICAL"
            alert_label = "Critical (<30 Hari)"
            alert_color = "red"
        elif sisa_hari <= 60:
            alert_category = "WARNING"
            alert_label = "Warning (30-60 Hari)"
            alert_color = "yellow"
        else:
            alert_category = "SAFE"
            alert_label = "Safe (>60 Hari)"
            alert_color = "green"

        margin_rp = rev_sewa_tahun - biaya_sewa_tahun
        margin_pct = round((margin_rp / rev_sewa_tahun * 100), 1) if rev_sewa_tahun > 0 else 0.0

        ref_spp = clean_text(r[28] if len(r) > 28 else "")
        spp = clean_text(r[29] if len(r) > 29 else "")
        po_baru = clean_text(r[30] if len(r) > 30 else "")
        pic_admin = clean_text(r[31] if len(r) > 31 else "")
        pic_rekanan = clean_text(r[32] if len(r) > 32 else "")
        telp = clean_text(r[33] if len(r) > 33 else "")
        keterangan = clean_text(r[44] if len(r) > 44 else "")

        cursor.execute("""
            INSERT INTO collo_records (
                pengelola, pelanggan, alamat_pengelola, originating, terminating,
                metode_kerjasama, jenis_sewa, no_so, sid, sla, layanan, kapasitas,
                rev_otc, rev_sewa_tahun, biaya_deposit, biaya_otc, biaya_sewa_tahun,
                margin_rupiah, margin_persen, rev_sharing_raw, rev_sharing_pct,
                biaya_rev_sharing, start_date, end_date, status, is_active,
                proses_admin, sisa_hari, alert_category, alert_label, alert_color,
                ref_spp, spp, po_baru, pic_admin, pic_rekanan, telp, keterangan
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pengelola, pelanggan, alamat_pengelola, originating, terminating,
            metode_kerjasama, jenis_sewa, no_so, sid, sla, layanan, kapasitas,
            rev_otc, rev_sewa_tahun, biaya_deposit, biaya_otc, biaya_sewa_tahun,
            margin_rp, margin_pct, rev_sharing_str, rev_sharing_pct,
            biaya_rev_sharing, start_date, end_date, status, is_active,
            proses_admin, sisa_hari, alert_category, alert_label, alert_color,
            ref_spp, spp, po_baru, pic_admin, pic_rekanan, telp, keterangan
        ))
        collo_count += 1

    conn.commit()
    wb.close()
    print(f"[SUCCESS] File 2 termigrasi: {collo_count} Sirkuit Colocation & Interkoneksi.")

def main():
    print(f"=======================================================")
    print(f"MIGRASI TELECOM INFRASTRUCTURE & LEASE DATABASE")
    print(f"Target SQLite: {DB_PATH}")
    print(f"=======================================================")

    conn = sqlite3.connect(DB_PATH)
    init_sqlite_schema(conn)
    migrate_sitac_and_gangguan(conn)
    migrate_collocation(conn)

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*), SUM(is_active) FROM collo_records")
    c_tot, c_act = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) FROM collo_records WHERE rev_sharing_pct > 0")
    c_rev_share = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM sitac_records")
    s_tot = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM gangguan_records")
    g_tot = cursor.fetchone()[0]

    print("\n--- RINGKASAN DATABASE TELECOM PORTAL ---")
    print(f"Total Sirkuit Colocation : {c_tot} (Active: {c_act}, History: {c_tot - c_act})")
    print(f"Total Link Rev Sharing   : {c_rev_share} sirkuit")
    print(f"Total Penugasan SITAC    : {s_tot} proyek")
    print(f"Total Tiket Gangguan     : {g_tot} tiket")
    print("----------------------------------------\n")
    conn.close()

if __name__ == "__main__":
    main()
