#!/usr/bin/env python3
"""
extract_all_data.py
Pipeline Ekstraksi Terpadu Multi-Spreadsheet:
1. 'Report Sitac  2026 FIX.xlsx' (Master RAW data, GANGGUAN, Rekap Efesiensi)
2. 'Rekap Collo x Interkoneksi 2024 V2 ROM 22 Nov(1).xlsx' (Raw Data)

Menghasilkan:
- sitac_collo_data.json  : Berkas JSON terstruktur & teroptimasi
- sitac_collo_data.js    : Berkas Standalone JS (window.SITAC_COLLO_DATA)
- network_infrastructure.db : Database SQLite lokal berindeks performa tinggi
"""

import os
import re
import json
import sqlite3
import datetime
import openpyxl

FILE_SITAC = "Report Sitac  2026 FIX.xlsx"
FILE_COLLO = "Rekap Collo x Interkoneksi 2024 V2 ROM 22 Nov(1).xlsx"

OUTPUT_JSON = "sitac_collo_data.json"
OUTPUT_JS = "sitac_collo_data.js"
OUTPUT_DB = "network_infrastructure.db"

# Anchor geografis Jabodetabek & Jawa Barat untuk geocoding alamat terminating
GEO_ANCHORS = {
    'tanah abang': (-6.1855, 106.8155),
    'kebon sirih': (-6.1837, 106.8290),
    'menteng': (-6.1950, 106.8320),
    'kemayoran': (-6.1550, 106.8520),
    'cideng': (-6.1730, 106.8110),
    'merdeka barat': (-6.1760, 106.8230),
    'sudirman': (-6.2150, 106.8220),
    'kuningan': (-6.2280, 106.8310),
    'setiabudi': (-6.2110, 106.8280),
    'duren tiga': (-6.2520, 106.8390),
    'tebet': (-6.2300, 106.8520),
    'ancol': (-6.1260, 106.8320),
    'pluit': (-6.1180, 106.7910),
    'sunter': (-6.1420, 106.8710),
    'marunda': (-6.1050, 106.9650),
    'kelapa gading': (-6.1580, 106.9080),
    'daan mogot': (-6.1580, 106.7350),
    'cengkareng': (-6.1450, 106.7280),
    'grogol': (-6.1660, 106.7890),
    'halim': (-6.2620, 106.8910),
    'cawang': (-6.2480, 106.8680),
    'cakung': (-6.1880, 106.9510),
    'buaran': (-6.2200, 106.9180),
    'bekasi': (-6.2380, 106.9750),
    'harapan indah': (-6.1830, 106.9820),
    'cikarang': (-6.2610, 107.1520),
    'depok': (-6.3950, 106.8230),
    'limo': (-6.3680, 106.7720),
    'tangerang': (-6.1780, 106.6310),
    'bsd': (-6.3010, 106.6520),
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

def parse_int_safe(val, default=None):
    if val is None: return default
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return default

def resolve_coordinates(coord_text, address_text, record_id):
    coord_regex = re.compile(r'(-?\d{1,2}\.\d+)\s*,\s*(\d{2,3}\.\d+)')
    if coord_text:
        match = coord_regex.search(coord_text)
        if match:
            try:
                lat = float(match.group(1))
                lng = float(match.group(2))
                return round(lat, 6), round(lng, 6), "EXACT"
            except ValueError:
                pass
    if address_text:
        match = coord_regex.search(address_text)
        if match:
            try:
                lat = float(match.group(1))
                lng = float(match.group(2))
                return round(lat, 6), round(lng, 6), "EXACT"
            except ValueError:
                pass
        lower_addr = address_text.lower()
        for key, (base_lat, base_lng) in GEO_ANCHORS.items():
            if key in lower_addr:
                offset_lat = ((record_id * 17) % 31 - 15) * 0.0018
                offset_lng = ((record_id * 23) % 31 - 15) * 0.0018
                return round(base_lat + offset_lat, 6), round(base_lng + offset_lng, 6), "GEOCODED"
    offset_lat = ((record_id * 13) % 41 - 20) * 0.003
    offset_lng = ((record_id * 19) % 41 - 20) * 0.003
    return round(-6.2088 + offset_lat, 6), round(106.8456 + offset_lng, 6), "AREA_DEFAULT"

# ==============================================================================
# 1. PROCESS FILE 1: SITAC, GANGGUAN, REKAP EFISIENSI
# ==============================================================================
def process_sitac_file():
    print(f"[INFO] Memproses File 1: {FILE_SITAC}...")
    wb = openpyxl.load_workbook(FILE_SITAC, data_only=True)

    # A. Master RAW data
    ws = wb["Master RAW data"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    master_records = []

    for row in rows:
        if not any(row): continue
        no_val = row[0] if len(row) > 0 else None
        no_pa = clean_text(row[1] if len(row) > 1 else None)
        pelanggan = clean_text(row[2] if len(row) > 2 else None)
        if no_val is None and not no_pa and not pelanggan: continue

        seq_id = len(master_records) + 1
        excel_no = parse_int_safe(no_val, seq_id)
        ptl = clean_text(row[3] if len(row) > 3 else "")
        perijinan = clean_text(row[4] if len(row) > 4 else "")
        tiering = clean_text(row[5] if len(row) > 5 else "")
        poin = parse_int_safe(row[6] if len(row) > 6 else None)
        terminating = clean_text(row[7] if len(row) > 7 else "")
        koordinat_raw = clean_text(row[8] if len(row) > 8 else "")
        lat, lng, coord_type = resolve_coordinates(koordinat_raw, terminating, seq_id)

        biaya_awal, catatan_biaya_awal = parse_currency(row[9] if len(row) > 9 else None)
        sewa_otc = clean_text(row[10] if len(row) > 10 else "")
        if not sewa_otc:
            sewa_otc = "OTC" if (biaya_awal > 0 or (len(row) > 11 and parse_currency(row[11])[0] > 0)) else "-"
        biaya_final, _ = parse_currency(row[11] if len(row) > 11 else None)
        biaya_sewa_bulan, _ = parse_currency(row[12] if len(row) > 12 else None)

        raw_progress = str(row[13] or "Finish").strip().lower()
        if "finish" in raw_progress: progress = "Finish"
        elif "cancel" in raw_progress: progress = "Cancel"
        elif "ongoing" in raw_progress: progress = "Ongoing"
        elif "hold" in raw_progress: progress = "Hold"
        else: progress = "Finish"

        date_pa = parse_date(row[14] if len(row) > 14 else None)
        date_dispos = parse_date(row[15] if len(row) > 15 else None)
        date_close = parse_date(row[18] if len(row) > 18 else None)
        aging_close = parse_int_safe(row[20] if len(row) > 20 else None)
        aging_berjalan = parse_int_safe(row[21] if len(row) > 21 else None)

        if aging_close is None and date_dispos and date_close:
            try:
                d1 = datetime.datetime.strptime(date_dispos, "%Y-%m-%d")
                d2 = datetime.datetime.strptime(date_close, "%Y-%m-%d")
                aging_close = max(0, (d2 - d1).days)
            except Exception: pass
        durasi_hari = aging_close if progress == "Finish" else (aging_berjalan if aging_berjalan is not None else 0)

        if durasi_hari is None or durasi_hari <= 7:
            aging_category = "green"
        elif durasi_hari <= 14:
            aging_category = "yellow"
        else:
            aging_category = "red"

        efisiensi_rp = max(0, biaya_awal - biaya_final) if biaya_awal > 0 else 0
        efisiensi_pct = round((efisiensi_rp / biaya_awal * 100), 2) if biaya_awal > 0 else 0.0

        bulan = parse_int_safe(row[23] if len(row) > 23 else None)
        tahun = parse_int_safe(row[24] if len(row) > 24 else None)
        if not tahun and date_dispos:
            tahun = int(date_dispos.split("-")[0])
            bulan = int(date_dispos.split("-")[1])
        elif not tahun and date_close:
            tahun = int(date_close.split("-")[0])
            bulan = int(date_close.split("-")[1])
        if not tahun: tahun = 2025

        master_records.append({
            "id": seq_id,
            "excel_no": excel_no,
            "no_pa": no_pa,
            "pelanggan": pelanggan,
            "ptl": ptl,
            "pic_perijinan": perijinan,
            "tiering": tiering,
            "poin": poin,
            "terminating": terminating,
            "latitude": lat,
            "longitude": lng,
            "coord_type": coord_type,
            "biaya_permintaan_awal": biaya_awal,
            "catatan_biaya_awal": catatan_biaya_awal,
            "sewa_otc": sewa_otc,
            "biaya_final": biaya_final,
            "biaya_sewa_bulan": biaya_sewa_bulan,
            "efisiensi_rupiah": efisiensi_rp,
            "efisiensi_persen": efisiensi_pct,
            "is_berbiaya": 1 if (biaya_final > 0 or biaya_awal > 0) else 0,
            "progress": progress,
            "date_pa": date_pa,
            "date_dispos": date_dispos,
            "date_close": date_close,
            "durasi_hari": durasi_hari,
            "aging_category": aging_category,
            "update_pekerjaan": clean_text(row[22] if len(row) > 22 else ""),
            "bulan": bulan,
            "tahun": tahun
        })

    # B. GANGGUAN
    ws_g = wb["GANGGUAN"]
    gangguan_records = []
    for r in list(ws_g.iter_rows(values_only=True))[1:]:
        if not any(r): continue
        no_val = r[0] if len(r) > 0 else None
        pa_tiket = clean_text(r[3] if len(r) > 3 else "")
        terminating = clean_text(r[4] if len(r) > 4 else "")
        jenis = clean_text(r[8] if len(r) > 8 else "")
        # Skip template rows that only contain sequence number in column A with no actual data
        tgl_raw = r[1] if len(r) > 1 else None
        if not pa_tiket and not terminating and not jenis and tgl_raw is None:
            continue

        g_id = len(gangguan_records) + 1
        tgl_dispos = parse_date(r[1] if len(r) > 1 else None)
        tgl_selesai = parse_date(r[2] if len(r) > 2 else None)
        update_text = clean_text(r[11] if len(r) > 11 else "")
        is_selesai = 1 if (tgl_selesai is not None or "selesai" in update_text.lower()) else 0
        biaya_g, _ = parse_currency(r[10] if len(r) > 10 else None)
        lat, lng, _ = resolve_coordinates("", terminating, g_id + 1000)

        gangguan_records.append({
            "id": g_id,
            "no_tiket": pa_tiket or f"TIKET-{g_id:04d}",
            "tgl_dispos": tgl_dispos,
            "tgl_selesai": tgl_selesai,
            "terminating": terminating,
            "latitude": lat,
            "longitude": lng,
            "pic_disposisi": clean_text(r[5] if len(r) > 5 else ""),
            "pic_perijinan": clean_text(r[6] if len(r) > 6 else ""),
            "pic_admin": clean_text(r[7] if len(r) > 7 else ""),
            "jenis_gangguan": jenis,
            "biaya_gangguan": biaya_g,
            "status": "Selesai" if is_selesai == 1 else "Aktif (Open)",
            "is_selesai": is_selesai,
            "update_gangguan": update_text
        })

    # C. Rekap Efisiensi
    rekap_list = []
    if "Rekap Efesiensi Biaya Perijinan" in wb.sheetnames:
        for r in wb["Rekap Efesiensi Biaya Perijinan"].iter_rows(values_only=True):
            if not any(r): continue
            v0 = str(r[0]).strip() if r[0] is not None else ""
            if v0 in ("2024", "2025", "2026"):
                n_awal = parse_currency(r[3])[0]
                n_akhir = parse_currency(r[4])[0]
                rekap_list.append({
                    "tahun": int(v0),
                    "total_disposisi": parse_int_safe(r[1], 0),
                    "ada_biaya": parse_int_safe(r[2], 0),
                    "tidak_ada_biaya": parse_int_safe(r[5], 0),
                    "nilai_awal": n_awal,
                    "nilai_akhir": n_akhir,
                    "efisiensi_rupiah": max(0, n_awal - n_akhir),
                    "efisiensi_persen": round(((n_awal - n_akhir) / n_awal * 100), 2) if n_awal > 0 else 0
                })

    wb.close()
    print(f"[SUCCESS] File 1 selesai: {len(master_records)} Master RAW, {len(gangguan_records)} Gangguan, {len(rekap_list)} Rekap.")
    return master_records, gangguan_records, rekap_list

# ==============================================================================
# 2. PROCESS FILE 2: COLOCATION & INTERKONEKSI
# ==============================================================================
def process_collo_file():
    print(f"[INFO] Memproses File 2: {FILE_COLLO} (Sheet: Raw Data)...")
    wb = openpyxl.load_workbook(FILE_COLLO, data_only=True)
    ws = wb["Raw Data"]
    rows = list(ws.iter_rows(values_only=True))[1:]

    collo_records = []
    today = datetime.date.today()

    for idx, r in enumerate(rows, start=1):
        if not any(r): continue
        pengelola = clean_text(r[1] if len(r) > 1 else None)
        pelanggan = clean_text(r[2] if len(r) > 2 else None)
        if not pengelola and not pelanggan: continue

        c_id = len(collo_records) + 1
        alamat_pengelola = clean_text(r[3] if len(r) > 3 else "")
        monitoring_raw = clean_text(r[4] if len(r) > 4 else "")
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
        rev_sharing = clean_text(r[19] if len(r) > 19 else "")

        start_date = parse_date(r[20] if len(r) > 20 else None)
        end_date = parse_date(r[21] if len(r) > 21 else None)

        status_raw = clean_text(r[22] if len(r) > 22 else "").upper()
        if "ACTIVE" in status_raw and "NON" not in status_raw and "DE" not in status_raw:
            status = "ACTIVE"
        elif "DEACTIVASI" in status_raw or "DEAKTIVASI" in status_raw:
            status = "DEACTIVASI"
        elif "NON" in status_raw:
            status = "NON ACTIVE"
        else:
            status = status_raw or "NON ACTIVE"

        proses_admin = clean_text(r[23] if len(r) > 23 else "")
        sisa_hari_excel = parse_int_safe(r[25] if len(r) > 25 else None)

        # Hitung sisa hari dari end_date
        sisa_hari = sisa_hari_excel
        if end_date:
            try:
                ed = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
                sisa_hari_calc = (ed - today).days
                if sisa_hari is None:
                    sisa_hari = sisa_hari_calc
            except Exception: pass
        if sisa_hari is None: sisa_hari = 999

        # Smart Expiration Alert Classification
        # 🔴 CRITICAL: < 30 Hari
        # 🟡 WARNING: 30 - 60 Hari
        # 🟢 SAFE: > 60 Hari
        # ⚫ EXPIRED: Sisa hari <= 0
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

        # Kalkulasi Margin
        margin_rp = rev_sewa_tahun - biaya_sewa_tahun
        margin_pct = round((margin_rp / rev_sewa_tahun * 100), 1) if rev_sewa_tahun > 0 else 0.0

        ref_spp = clean_text(r[28] if len(r) > 28 else "")
        spp = clean_text(r[29] if len(r) > 29 else "")
        po_baru = clean_text(r[30] if len(r) > 30 else "")
        pic_admin = clean_text(r[31] if len(r) > 31 else "")
        pic_rekanan = clean_text(r[32] if len(r) > 32 else "")
        telp = clean_text(r[33] if len(r) > 33 else "")
        keterangan = clean_text(r[44] if len(r) > 44 else "")

        collo_records.append({
            "id": c_id,
            "pengelola": pengelola,
            "pelanggan": pelanggan,
            "alamat_pengelola": alamat_pengelola,
            "originating": originating,
            "terminating": terminating,
            "metode_kerjasama": metode_kerjasama,
            "jenis_sewa": jenis_sewa,
            "no_so": no_so,
            "sid": sid,
            "sla": sla,
            "layanan": layanan,
            "kapasitas": kapasitas,
            "rev_otc": rev_otc,
            "rev_sewa_tahun": rev_sewa_tahun,
            "biaya_deposit": biaya_deposit,
            "biaya_otc": biaya_otc,
            "biaya_sewa_tahun": biaya_sewa_tahun,
            "margin_rupiah": margin_rp,
            "margin_persen": margin_pct,
            "rev_sharing": rev_sharing,
            "start_date": start_date,
            "end_date": end_date,
            "status": status,
            "is_active": 1 if status == "ACTIVE" else 0,
            "proses_admin": proses_admin,
            "sisa_hari": sisa_hari,
            "alert_category": alert_category,
            "alert_label": alert_label,
            "alert_color": alert_color,
            "ref_spp": ref_spp,
            "spp": spp,
            "po_baru": po_baru,
            "pic_admin": pic_admin,
            "pic_rekanan": pic_rekanan,
            "telp": telp,
            "keterangan": keterangan
        })

    wb.close()
    print(f"[SUCCESS] File 2 selesai: {len(collo_records)} total data Collo & Interkoneksi ({sum(1 for c in collo_records if c['is_active'] == 1)} ACTIVE).")
    return collo_records

# ==============================================================================
# 3. EXECUTIVE & MODULE SUMMARIES
# ==============================================================================
def generate_unified_summary(sitac_records, collo_records, gangguan_records, rekap_efisiensi):
    # Metrik Collo ACTIVE (Default)
    active_collo = [c for c in collo_records if c["is_active"] == 1]
    history_collo = [c for c in collo_records if c["is_active"] == 0]

    tot_active_rev = sum(c["rev_sewa_tahun"] for c in active_collo)
    tot_active_biaya = sum(c["biaya_sewa_tahun"] for c in active_collo)
    tot_active_margin = tot_active_rev - tot_active_biaya
    margin_pct = round((tot_active_margin / tot_active_rev * 100), 2) if tot_active_rev > 0 else 0.0

    # Status breakdown Collo
    collo_status_counts = {"ACTIVE": len(active_collo), "NON ACTIVE": sum(1 for c in collo_records if c["status"] == "NON ACTIVE"), "DEACTIVASI": sum(1 for c in collo_records if c["status"] == "DEACTIVASI")}

    # Expiration Alerts (Active only)
    alert_counts = {"CRITICAL": 0, "WARNING": 0, "SAFE": 0, "EXPIRED": 0}
    for c in active_collo:
        cat = c["alert_category"]
        if cat in alert_counts: alert_counts[cat] += 1

    # Top 10 Pengelola by Biaya Sewa (Active)
    pengelola_map = {}
    for c in active_collo:
        p = c["pengelola"] or "Tidak Tercatat"
        if p not in pengelola_map:
            pengelola_map[p] = {"pengelola": p, "biaya_sewa": 0, "rev_sewa": 0, "sirkuit_count": 0}
        pengelola_map[p]["biaya_sewa"] += c["biaya_sewa_tahun"]
        pengelola_map[p]["rev_sewa"] += c["rev_sewa_tahun"]
        pengelola_map[p]["sirkuit_count"] += 1

    top10_pengelola = sorted(pengelola_map.values(), key=lambda x: x["biaya_sewa"], reverse=True)[:10]

    # SITAC Summaries
    tot_sitac = len(sitac_records)
    sitac_status = {"Finish": 0, "Ongoing": 0, "Hold": 0, "Cancel": 0}
    for s in sitac_records:
        st = s["progress"]
        if st in sitac_status: sitac_status[st] += 1
        else: sitac_status["Finish"] += 1

    sitac_biaya_awal = sum(s["biaya_permintaan_awal"] for s in sitac_records)
    sitac_biaya_final = sum(s["biaya_final"] for s in sitac_records)
    sitac_efisiensi = sum(s["efisiensi_rupiah"] for s in sitac_records)
    sitac_efisiensi_pct = round((sitac_efisiensi / sitac_biaya_awal * 100), 2) if sitac_biaya_awal > 0 else 0

    # Gangguan Summaries
    tot_gangguan = len(gangguan_records)
    aktif_gangguan = sum(1 for g in gangguan_records if g["is_selesai"] == 0)
    selesai_gangguan = tot_gangguan - aktif_gangguan
    gangguan_res_rate = round((selesai_gangguan / tot_gangguan * 100), 1) if tot_gangguan > 0 else 0

    # Workload PIC SITAC
    pic_map = {}
    for s in sitac_records:
        pic = s["pic_perijinan"] or "Unassigned"
        if pic not in pic_map:
            pic_map[pic] = {
                "pic": pic, "total_penugasan": 0, "finish": 0, "ongoing": 0,
                "cancel": 0, "hold": 0, "biaya_awal": 0, "biaya_final": 0,
                "efisiensi_rupiah": 0, "sla_days": [], "gangguan_count": 0
            }
        pic_map[pic]["total_penugasan"] += 1
        st = s["progress"].lower()
        if st in pic_map[pic]: pic_map[pic][st] += 1
        pic_map[pic]["biaya_awal"] += s["biaya_permintaan_awal"]
        pic_map[pic]["biaya_final"] += s["biaya_final"]
        pic_map[pic]["efisiensi_rupiah"] += s["efisiensi_rupiah"]
        if s["progress"] == "Finish" and s["durasi_hari"] is not None and s["durasi_hari"] >= 0:
            pic_map[pic]["sla_days"].append(s["durasi_hari"])

    for g in gangguan_records:
        pic_g = g["pic_perijinan"]
        if not pic_g: continue
        for pic in pic_map:
            if pic_g.lower() in pic.lower() or pic.lower() in pic_g.lower():
                pic_map[pic]["gangguan_count"] += 1
                break

    workload_list = []
    for pic, d in pic_map.items():
        finish_rate = round((d["finish"] / d["total_penugasan"] * 100), 1) if d["total_penugasan"] > 0 else 0
        efisiensi_pct = round((d["efisiensi_rupiah"] / d["biaya_awal"] * 100), 1) if d["biaya_awal"] > 0 else 0
        avg_sla = round(sum(d["sla_days"]) / len(d["sla_days"]), 1) if d["sla_days"] else 0
        workload_list.append({
            "pic": pic, "total_penugasan": d["total_penugasan"],
            "finish": d["finish"], "ongoing": d["ongoing"], "cancel": d["cancel"],
            "hold": d["hold"], "finish_rate": finish_rate, "biaya_awal": d["biaya_awal"],
            "biaya_final": d["biaya_final"], "efisiensi_rupiah": d["efisiensi_rupiah"],
            "efisiensi_persen": efisiensi_pct, "avg_sla_hari": avg_sla,
            "gangguan_count": d["gangguan_count"]
        })
    workload_list.sort(key=lambda x: x["total_penugasan"], reverse=True)

    return {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "executive": {
            "collo_active_count": len(active_collo),
            "collo_history_count": len(history_collo),
            "collo_total_revenue": tot_active_rev,
            "collo_total_biaya": tot_active_biaya,
            "collo_margin_profit": tot_active_margin,
            "collo_margin_percent": margin_pct,
            "sitac_total_pa": tot_sitac,
            "sitac_status_distribution": sitac_status,
            "sitac_pct_finish": round((sitac_status["Finish"] / tot_sitac * 100), 1) if tot_sitac else 0,
            "sitac_pct_cancel": round((sitac_status["Cancel"] / tot_sitac * 100), 1) if tot_sitac else 0,
            "sitac_pct_ongoing_hold": round(((sitac_status["Ongoing"] + sitac_status["Hold"]) / tot_sitac * 100), 1) if tot_sitac else 0,
            "sitac_biaya_awal": sitac_biaya_awal,
            "sitac_biaya_final": sitac_biaya_final,
            "sitac_efisiensi_rupiah": sitac_efisiensi,
            "sitac_efisiensi_persen": sitac_efisiensi_pct,
            "gangguan_aktif": aktif_gangguan,
            "gangguan_total": tot_gangguan,
            "gangguan_resolution_rate": gangguan_res_rate
        },
        "collo_summary": {
            "total_records": len(collo_records),
            "active_count": len(active_collo),
            "history_count": len(history_collo),
            "status_counts": collo_status_counts,
            "alert_counts": alert_counts,
            "top10_pengelola": top10_pengelola
        },
        "workload_performa": workload_list,
        "rekap_efisiensi": rekap_efisiensi
    }

# ==============================================================================
# 4. SAVE TO DATABASE & STATIC ASSETS
# ==============================================================================
def save_database_and_files(sitac_records, collo_records, gangguan_records, rekap_efisiensi, summary):
    payload = {
        "metadata": {
            "title": "Network Operations & Infrastructure Lease Management Dashboard",
            "version": "3.0",
            "last_updated": summary["generated_at"],
            "total_sitac": len(sitac_records),
            "total_collo": len(collo_records),
            "total_collo_active": summary["executive"]["collo_active_count"],
            "total_gangguan": len(gangguan_records)
        },
        "summary": summary,
        "sitac_records": sitac_records,
        "collo_records": collo_records,
        "gangguan_records": gangguan_records,
        "rekap_efisiensi": rekap_efisiensi
    }

    # 1. JSON
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[SUCCESS] JSON tersimpan: {OUTPUT_JSON} ({os.path.getsize(OUTPUT_JSON):,} bytes)")

    # 2. Standalone JS
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("window.SITAC_COLLO_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
    print(f"[SUCCESS] JS tersimpan: {OUTPUT_JS} ({os.path.getsize(OUTPUT_JS):,} bytes)")

    # 3. SQLite Database
    if os.path.exists(OUTPUT_DB):
        try: os.remove(OUTPUT_DB)
        except Exception: pass

    conn = sqlite3.connect(OUTPUT_DB)
    cur = conn.cursor()

    # Tabel SITAC
    cur.execute("""
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
        biaya_permintaan_awal INTEGER,
        catatan_biaya_awal TEXT,
        sewa_otc TEXT,
        biaya_final INTEGER,
        biaya_sewa_bulan INTEGER,
        efisiensi_rupiah INTEGER,
        efisiensi_persen REAL,
        is_berbiaya INTEGER,
        progress TEXT,
        date_pa TEXT,
        date_dispos TEXT,
        date_close TEXT,
        durasi_hari INTEGER,
        aging_category TEXT,
        update_pekerjaan TEXT,
        bulan INTEGER,
        tahun INTEGER
    );
    """)
    cur.execute("CREATE INDEX idx_sitac_status ON sitac_records(progress);")
    cur.execute("CREATE INDEX idx_sitac_pic ON sitac_records(pic_perijinan);")

    insert_sitac_sql = """
    INSERT INTO sitac_records VALUES (
        :id, :excel_no, :no_pa, :pelanggan, :ptl, :pic_perijinan, :tiering, :poin, :terminating,
        :latitude, :longitude, :coord_type, :biaya_permintaan_awal, :catatan_biaya_awal,
        :sewa_otc, :biaya_final, :biaya_sewa_bulan, :efisiensi_rupiah, :efisiensi_persen,
        :is_berbiaya, :progress, :date_pa, :date_dispos, :date_close, :durasi_hari,
        :aging_category, :update_pekerjaan, :bulan, :tahun
    );
    """
    cur.executemany(insert_sitac_sql, sitac_records)

    # Tabel Collo
    cur.execute("""
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
        rev_otc INTEGER,
        rev_sewa_tahun INTEGER,
        biaya_deposit INTEGER,
        biaya_otc INTEGER,
        biaya_sewa_tahun INTEGER,
        margin_rupiah INTEGER,
        margin_persen REAL,
        rev_sharing TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        is_active INTEGER,
        proses_admin TEXT,
        sisa_hari INTEGER,
        alert_category TEXT,
        alert_label TEXT,
        alert_color TEXT,
        ref_spp TEXT,
        spp TEXT,
        po_baru TEXT,
        pic_admin TEXT,
        pic_rekanan TEXT,
        telp TEXT,
        keterangan TEXT
    );
    """)
    cur.execute("CREATE INDEX idx_collo_status ON collo_records(status);")
    cur.execute("CREATE INDEX idx_collo_is_active ON collo_records(is_active);")
    cur.execute("CREATE INDEX idx_collo_pengelola ON collo_records(pengelola);")
    cur.execute("CREATE INDEX idx_collo_pelanggan ON collo_records(pelanggan);")
    cur.execute("CREATE INDEX idx_collo_alert ON collo_records(alert_category);")

    insert_collo_sql = """
    INSERT INTO collo_records VALUES (
        :id, :pengelola, :pelanggan, :alamat_pengelola, :originating, :terminating,
        :metode_kerjasama, :jenis_sewa, :no_so, :sid, :sla, :layanan, :kapasitas,
        :rev_otc, :rev_sewa_tahun, :biaya_deposit, :biaya_otc, :biaya_sewa_tahun,
        :margin_rupiah, :margin_persen, :rev_sharing, :start_date, :end_date, :status,
        :is_active, :proses_admin, :sisa_hari, :alert_category, :alert_label, :alert_color,
        :ref_spp, :spp, :po_baru, :pic_admin, :pic_rekanan, :telp, :keterangan
    );
    """
    cur.executemany(insert_collo_sql, collo_records)

    # Tabel Gangguan
    cur.execute("""
    CREATE TABLE gangguan_records (
        id INTEGER PRIMARY KEY,
        no_tiket TEXT,
        tgl_dispos TEXT,
        tgl_selesai TEXT,
        terminating TEXT,
        latitude REAL,
        longitude REAL,
        pic_disposisi TEXT,
        pic_perijinan TEXT,
        pic_admin TEXT,
        jenis_gangguan TEXT,
        biaya_gangguan INTEGER,
        status TEXT,
        is_selesai INTEGER,
        update_gangguan TEXT
    );
    """)
    insert_gangguan_sql = """
    INSERT INTO gangguan_records VALUES (
        :id, :no_tiket, :tgl_dispos, :tgl_selesai, :terminating, :latitude, :longitude,
        :pic_disposisi, :pic_perijinan, :pic_admin, :jenis_gangguan, :biaya_gangguan,
        :status, :is_selesai, :update_gangguan
    );
    """
    cur.executemany(insert_gangguan_sql, gangguan_records)

    conn.commit()
    conn.close()
    print(f"[SUCCESS] SQLite tersimpan: {OUTPUT_DB} ({os.path.getsize(OUTPUT_DB):,} bytes)")

def main():
    print("=" * 70)
    print(" UNIFIED DATA PIPELINE: NETWORK OPS & LEASE MANAGEMENT")
    print("=" * 70)

    sitac_records, gangguan_records, rekap_efisiensi = process_sitac_file()
    collo_records = process_collo_file()
    summary = generate_unified_summary(sitac_records, collo_records, gangguan_records, rekap_efisiensi)
    save_database_and_files(sitac_records, collo_records, gangguan_records, rekap_efisiensi, summary)

    exec_s = summary["executive"]
    print("\n" + "=" * 70)
    print(" RINGKASAN EKSEKUTIF UTAMA:")
    print("=" * 70)
    print(f"Colocation Sirkuit Aktif : {exec_s['collo_active_count']} ACTIVE (Histori: {exec_s['collo_history_count']})")
    print(f"Total Revenue Sewa Aktif : Rp {exec_s['collo_total_revenue']:,}")
    print(f"Total Biaya Sewa Mitra   : Rp {exec_s['collo_total_biaya']:,}")
    print(f"Margin Profitabilitas    : Rp {exec_s['collo_margin_profit']:,} ({exec_s['collo_margin_percent']}%)")
    print(f"Total Perizinan SITAC    : {exec_s['sitac_total_pa']} PA (Finish: {exec_s['sitac_pct_finish']}%, Cancel: {exec_s['sitac_pct_cancel']}%)")
    print(f"Efisiensi Negosiasi SITAC: Rp {exec_s['sitac_efisiensi_rupiah']:,} ({exec_s['sitac_efisiensi_persen']}%)")
    print(f"Tiket Gangguan           : {exec_s['gangguan_total']} Total ({exec_s['gangguan_aktif']} Aktif)")
    print("=" * 70)

if __name__ == "__main__":
    main()
