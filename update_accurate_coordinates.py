import sqlite3, re

# Comprehensive Geocoding Knowledge Base for Jabodetabek, Banten, and West/Central Java
GEO_RULES = [
    # Explicit Tikor (Latitude, Longitude)
    (r'(-?[0-8]\.\d{3,8})[,\s/]+(10[5-8]\.\d{3,8})', 'EXACT'),

    # Banten: Cilegon, Serang, Lebak, Pandeglang
    ('cilegon', (-6.0175, 106.0538)),
    ('kotasari', (-6.0150, 106.0350)),
    ('krakatau', (-6.0125, 106.0150)),
    ('asahimas', (-6.0125, 106.0150)),
    ('labuan', (-6.3775, 105.8290)),
    ('pandeglang', (-6.3088, 106.1065)),
    ('malimping', (-6.7865, 105.9984)),
    ('malingping', (-6.7865, 105.9984)),
    ('leuwidamar', (-6.5350, 106.2300)),
    ('serang', (-6.1104, 106.1550)),
    ('anyer', (-6.0512, 105.9180)),
    ('bpjn banten', (-6.1850, 106.6340)),

    # Central Java & Outer West Java
    ('kudus', (-6.8048, 110.8405)),
    ('kaliwungu', (-6.8048, 110.8405)),
    ('satyamitra', (-6.9740, 109.9230)),
    ('banyu putih', (-6.9740, 109.9230)),
    ('karawang', (-6.3150, 107.2950)),
    ('cikampek', (-6.4150, 107.4550)),
    ('sukabumi', (-6.9277, 106.9300)),

    # Bogor, Puncak & Jonggol
    ('ciawi', (-6.6575, 106.8524)),
    ('jonggol', (-6.4428, 107.0392)),
    ('citra indah', (-6.4428, 107.0392)),
    ('cibinong', (-6.4850, 106.8550)),
    ('bojonggede', (-6.4950, 106.7950)),
    ('bojong gede', (-6.4950, 106.7950)),
    ('bojong sari', (-6.3980, 106.7450)),
    ('bojongsari', (-6.3980, 106.7450)),
    ('sentul', (-6.5412, 106.8624)),
    ('cibubur', (-6.3725, 106.9024)),
    ('citra grand', (-6.3725, 106.9024)),
    ('bogor', (-6.5950, 106.7900)),

    # Depok
    ('sawangan', (-6.3950, 106.7800)),
    ('cinere', (-6.3250, 106.7820)),
    ('margonda', (-6.3725, 106.8320)),
    ('technovillage', (-6.4150, 106.8550)),
    ('depok', (-6.4025, 106.7942)),

    # Bekasi, Cikarang, Industrial Hubs
    ('deltamas', (-6.3685, 107.1724)),
    ('giic', (-6.3685, 107.1724)),
    ('mm2100', (-6.2954, 107.0982)),
    ('gandamekar', (-6.2954, 107.0982)),
    ('mekarwangi', (-6.2954, 107.0982)),
    ('kuehne', (-6.2954, 107.0982)),
    ('cikarang barat', (-6.2750, 107.0980)),
    ('cikarang pusat', (-6.3685, 107.1724)),
    ('cikarang selatan', (-6.3250, 107.1420)),
    ('cikarang utara', (-6.2550, 107.1550)),
    ('pilar', (-6.2550, 107.1550)),
    ('cikarang', (-6.2610, 107.1520)),
    ('cibitung', (-6.2650, 107.0980)),
    ('tambun', (-6.2600, 107.0600)),
    ('jatiasih', (-6.2980, 106.9620)),
    ('jati asih', (-6.2980, 106.9620)),
    ('jatimekar', (-6.2980, 106.9620)),
    ('harapan indah', (-6.1750, 106.9820)),
    ('muara tawar', (-6.1250, 106.9950)),
    ('summarecon bekasi', (-6.2250, 106.9980)),
    ('pondok gede', (-6.2850, 106.9150)),
    ('mustika jaya', (-6.2850, 107.0250)),
    ('grand mutiara gading', (-6.2850, 107.0250)),
    ('bekasi timur', (-6.2550, 107.0150)),
    ('bekasi barat', (-6.2383, 106.9756)),
    ('bekasi utara', (-6.2150, 106.9950)),
    ('bekasi selatan', (-6.2450, 106.9850)),
    ('bekasi', (-6.2383, 106.9756)),

    # Tangerang & Tangerang Selatan
    ('taman tekno', (-6.3475, 106.6712)),
    ('taman tecno', (-6.3475, 106.6712)),
    ('puspiptek', (-6.3475, 106.6712)),
    ('puspitek', (-6.3475, 106.6712)),
    ('foresta', (-6.3015, 106.6450)),
    ('bsd', (-6.3015, 106.6540)),
    ('alam sutera', (-6.2250, 106.6550)),
    ('pasar delapan', (-6.2250, 106.6550)),
    ('serpong', (-6.3210, 106.6690)),
    ('ciater', (-6.3150, 106.6950)),
    ('rawamekar jaya', (-6.3150, 106.6950)),
    ('ciputra serpong', (-6.3350, 106.6350)),
    ('bintaro', (-6.2825, 106.7280)),
    ('titan bintaro', (-6.2825, 106.7280)),
    ('fiera graha', (-6.2750, 106.7150)),
    ('pondok aren', (-6.2725, 106.7150)),
    ('pondok ranji', (-6.2785, 106.7380)),
    ('ciputat', (-6.3112, 106.7450)),
    ('rempoa', (-6.2950, 106.7620)),
    ('dci rempoa', (-6.2950, 106.7620)),
    ('pamulang', (-6.3450, 106.7350)),
    ('cikokol', (-6.1950, 106.6340)),
    ('karawaci', (-6.2250, 106.6150)),
    ('legok', (-6.3125, 106.5820)),
    ('curug', (-6.2712, 106.5620)),
    ('jatake', (-6.1950, 106.5650)),
    ('manis', (-6.1950, 106.5650)),
    ('tristate', (-6.1950, 106.5650)),
    ('keroncong', (-6.1850, 106.5750)),
    ('panunggangan', (-6.2150, 106.6450)),
    ('diklat pemda', (-6.2650, 106.5850)),
    ('bizpoint', (-6.2350, 106.5350)),
    ('greenlake', (-6.1850, 106.7020)),
    ('green lake', (-6.1850, 106.7020)),
    ('cibodas', (-6.1950, 106.6050)),
    ('tangerang', (-6.1783, 106.6319)),
    ('tangsel', (-6.3015, 106.6712)),

    # Jakarta Utara
    ('marunda', (-6.1085, 106.9620)),
    ('kbn', (-6.1285, 106.9250)),
    ('cilincing', (-6.1154, 106.9468)),
    ('sukapura', (-6.1380, 106.9250)),
    ('balrich', (-6.1380, 106.9250)),
    ('rawa malang', (-6.1154, 106.9468)),
    ('kalibaru', (-6.1080, 106.9290)),
    ('semper', (-6.1280, 106.9150)),
    ('islamic centre', (-6.1280, 106.9150)),
    ('tanjung priok', (-6.1150, 106.8850)),
    ('tanjung priuk', (-6.1150, 106.8850)),
    ('sunter', (-6.1415, 106.8724)),
    ('graha abhitech', (-6.1415, 106.8724)),
    ('atria', (-6.1415, 106.8724)),
    ('pluit', (-6.1264, 106.7925)),
    ('de ploeit', (-6.1264, 106.7925)),
    ('penjaringan', (-6.1264, 106.7925)),
    ('kelapa gading', (-6.1585, 106.9050)),
    ('klp. gading', (-6.1585, 106.9050)),
    ('pegangsaan dua', (-6.1585, 106.9050)),
    ('ancol', (-6.1188, 106.8086)),
    ('lodan', (-6.1188, 106.8086)),

    # Jakarta Pusat
    ('medan merdeka', (-6.1818, 106.8284)),
    ('danareksa', (-6.1818, 106.8284)),
    ('kediaman', (-6.1818, 106.8284)),
    ('gambir', (-6.1767, 106.8306)),
    ('lapangan banteng', (-6.1704, 106.8351)),
    ('kemayoran', (-6.1550, 106.8550)),
    ('jiexpo', (-6.1550, 106.8550)),
    ('tanah abang', (-6.1850, 106.8150)),
    ('midpoint', (-6.1819, 106.8299)),
    ('grand indonesia', (-6.1950, 106.8217)),
    ('thamrin', (-6.1884, 106.8236)),
    ('menara thamrin', (-6.1884, 106.8236)),
    ('lippo thamrin', (-6.1884, 106.8236)),
    ('menteng', (-6.1950, 106.8380)),
    ('cokroaminoto', (-6.1950, 106.8320)),
    ('salemba', (-6.1920, 106.8500)),
    ('kenari', (-6.1950, 106.8450)),
    ('cempaka mas', (-6.1680, 106.8750)),
    ('cempaka putih', (-6.1820, 106.8750)),
    ('glodok', (-6.1450, 106.8150)),
    ('wtc', (-6.2125, 106.8200)),
    ('bumn', (-6.1818, 106.8284)),

    # Jakarta Selatan
    ('sudirman', (-6.2185, 106.8220)),
    ('sahid sudirman', (-6.2185, 106.8220)),
    ('astra', (-6.2185, 106.8220)),
    ('wisma 46', (-6.2085, 106.8210)),
    ('intiland', (-6.2084, 106.8214)),
    ('centennial tower', (-6.2305, 106.8220)),
    ('gatot subroto', (-6.2332, 106.8184)),
    ('gatot soebroto', (-6.2332, 106.8184)),
    ('lumba-lumba', (-6.2332, 106.8184)),
    ('jamsostek', (-6.2332, 106.8184)),
    ('brin', (-6.2332, 106.8184)),
    ('kuningan', (-6.2285, 106.8275)),
    ('megakuninag', (-6.2285, 106.8275)),
    ('mega kuningan', (-6.2285, 106.8275)),
    ('rasuna said', (-6.2285, 106.8275)),
    ('sentra mulia', (-6.2285, 106.8275)),
    ('setiabudi', (-6.2084, 106.8236)),
    ('setia budi', (-6.2084, 106.8236)),
    ('karet kuningan', (-6.2185, 106.8220)),
    ('karet tengsin', (-6.2185, 106.8220)),
    ('karet', (-6.2185, 106.8220)),
    ('tegal parang', (-6.2425, 106.8320)),
    ('senayan', (-6.2185, 106.8020)),
    ('gbk', (-6.2185, 106.8020)),
    ('hutan kota gbk', (-6.2185, 106.8020)),
    ('jcc', (-6.2150, 106.8050)),
    ('slipi', (-6.1950, 106.7990)),
    ('parman', (-6.1908, 106.7972)),
    ('permata hijau', (-6.2215, 106.7844)),
    ('recapital', (-6.2405, 106.8050)),
    ('simatupang', (-6.2950, 106.8250)),
    ('menara 165', (-6.2950, 106.8250)),
    ('fatmawati', (-6.2850, 106.7950)),
    ('pondok indah', (-6.2731, 106.7842)),
    ('pondok pinang', (-6.2731, 106.7742)),
    ('petukangan', (-6.2384, 106.7571)),
    ('tanjung barat', (-6.3075, 106.8400)),
    ('mahata', (-6.3075, 106.8400)),
    ('kalibata', (-6.2550, 106.8550)),
    ('mampang', (-6.2550, 106.8250)),
    ('tebet', (-6.2350, 106.8550)),
    ('pancoran', (-6.2450, 106.8450)),
    ('pasar minggu', (-6.2850, 106.8450)),
    ('cilandak', (-6.2950, 106.8050)),
    ('kebayoran', (-6.2450, 106.7950)),
    ('blok m', (-6.2450, 106.8000)),
    ('gedung cyber', (-6.2405, 106.8285)),
    ('danantara', (-6.2350, 106.8250)),

    # Jakarta Timur
    ('matraman', (-6.2017, 106.8584)),
    ('kebon manggis', (-6.2017, 106.8584)),
    ('halim', (-6.2666, 106.8912)),
    ('cawang', (-6.2485, 106.8680)),
    ('otista', (-6.2425, 106.8680)),
    ('wisma indomobil', (-6.2427, 106.8629)),
    ('mt haryono', (-6.2427, 106.8629)),
    ('pulogadung', (-6.1925, 106.9110)),
    ('pulo gadung', (-6.1925, 106.9110)),
    ('jiep', (-6.1925, 106.9110)),
    ('cakung', (-6.1820, 106.9550)),
    ('ujung menteng', (-6.1820, 106.9550)),
    ('duren sawit', (-6.2285, 106.9290)),
    ('malaka', (-6.2285, 106.9290)),
    ('rawamangun', (-6.1950, 106.8850)),
    ('cipinang', (-6.2150, 106.8850)),
    ('kampung rambutan', (-6.3150, 106.8800)),
    ('ciracas', (-6.3250, 106.8750)),

    # Jakarta Barat
    ('grogol', (-6.1650, 106.7850)),
    ('palmerah', (-6.2011, 106.7822)),
    ('binus', (-6.2011, 106.7822)),
    ('tanjung duren', (-6.1750, 106.7850)),
    ('kebon jeruk', (-6.1950, 106.7750)),
    ('kebun jeruk', (-6.1950, 106.7750)),
    ('meruya', (-6.1950, 106.7350)),
    ('puri', (-6.1850, 106.7350)),
    ('kembangan', (-6.1850, 106.7350)),
    ('daan mogot', (-6.1550, 106.7050)),
    ('kalideres', (-6.1550, 106.7050)),
    ('semanan', (-6.1601, 106.6974)),
    ('cengkareng', (-6.1500, 106.7350)),
    ('rawa buaya', (-6.1650, 106.7250)),
    ('duri kosambi', (-6.1650, 106.7150)),
    ('tambora', (-6.1450, 106.8050)),
    ('pakojan', (-6.1400, 106.8050)),

    # Broad City Center Fallbacks
    ('jakarta barat', (-6.1683, 106.7588)),
    ('jakarta selatan', (-6.2615, 106.8106)),
    ('jakarta timur', (-6.2250, 106.9004)),
    ('jakarta utara', (-6.1384, 106.8640)),
    ('jakarta pusat', (-6.1865, 106.8341)),
    ('jakarta', (-6.2000, 106.8200))
]

def geocode_terminating(text):
    if not text:
        return -6.2000, 106.8200, 'DEFAULT'
    t = text.lower()

    # 1. Regex Tikor
    m = re.search(r'(-?[0-8]\.\d{3,8})[,\s/]+(10[5-8]\.\d{3,8})', t)
    if m:
        try:
            return float(m.group(1)), float(m.group(2)), 'EXACT_TIKOR'
        except Exception: pass

    # 2. Sequential Rules Lookup
    for rule, coords in GEO_RULES:
        if isinstance(rule, str) and rule in t:
            return coords[0], coords[1], f'GEO_{rule.upper()}'

    return -6.2000, 106.8200, 'DEFAULT'

def update_all_sitac_coordinates():
    conn = sqlite3.connect('telecom_portal.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id, terminating FROM sitac_records')
    records = cursor.fetchall()

    updated = 0
    types = {}

    for r_id, term in records:
        lat, lon, c_type = geocode_terminating(term)
        cursor.execute('''
            UPDATE sitac_records
            SET latitude = ?, longitude = ?, coord_type = ?
            WHERE id = ?
        ''', (lat, lon, c_type, r_id))
        updated += 1
        types[c_type] = types.get(c_type, 0) + 1

    conn.commit()
    conn.close()
    print(f'Successfully updated {updated} sitac coordinates in telecom_portal.db')
    print('Coordinate type breakdown:')
    for k, v in sorted(types.items(), key=lambda x: x[1], reverse=True)[:15]:
        print(f'  {k}: {v}')

if __name__ == '__main__':
    update_all_sitac_coordinates()
