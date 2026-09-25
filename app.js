/**
 * Telecom Infrastructure & Lease Operations Portal - Frontend Application Engine
 * Integrates SQLite REST API, Dynamic Routing, Real-Time CRUD, Revenue Sharing & WebGIS
 */

(function () {
  'use strict';

  // --- GLOBAL STATE ---
  const state = {
    activeView: 'view-executive',
    theme: localStorage.getItem('portal_theme') || 'dark',
    currentUser: JSON.parse(localStorage.getItem('telecom_portal_user') || 'null'),
    token: localStorage.getItem('telecom_portal_token') || null,

    // View 2: Colocation Links (Default: ACTIVE ONLY)
    collo: {
      status: 'ACTIVE',
      jenisSewa: 'ALL',
      pengelola: 'ALL',
      search: '',
      sort: 'margin_desc',
      page: 1,
      pageSize: 25,
      data: [],
      totals: {}
    },

    // View 3: Revenue Sharing
    revSharing: {
      search: '',
      data: []
    },

    // View 4: Expiration Alerts
    alerts: {
      category: 'CRITICAL',
      search: '',
      data: []
    },

    // View 5: SITAC Projects
    sitac: {
      status: 'ALL',
      pic: 'ALL',
      year: 'ALL',
      aging: 'ALL',
      search: '',
      page: 1,
      pageSize: 25,
      data: []
    },

    // View 6: Emergency Trouble Tickets
    gangguan: {
      status: 'ALL',
      search: '',
      data: []
    },

    // Meta options
    meta: {
      pengelola: [],
      pic: [],
      jenisSewa: []
    },

    // View 7 & 8 cached dataset for exports & charts
    efisiensi: [],
    picMatrix: []
  };

  // Chart & Map instances registry
  const charts = {};
  let leafletMap = null;
  let mapMarkersLayer = null;
  let mapBaseLayers = {};
  let currentBaseLayer = 'osm';
  let mapResizeObserver = null;
  let lastMapBounds = null;

  const destroyChart = (key) => {
    if (charts[key]) {
      try { charts[key].destroy(); } catch (e) {}
      charts[key] = null;
    }
  };

  const getChartTheme = () => {
    const isDark = state.theme === 'dark';
    return {
      isDark,
      textColor: isDark ? '#94a3b8' : '#475569',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? '#0f172a' : '#ffffff',
      tooltipText: isDark ? '#f8fafc' : '#0f172a'
    };
  };

  // --- FORMATTING UTILS ---
  const formatRupiah = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Number(val).toLocaleString('id-ID');
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'portal-toast';
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-rose-400';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s.includes('FINISH') || s === 'ACTIVE') {
      return `<span class="status-badge status-active"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(status)}</span>`;
    } else if (s.includes('ONGOING')) {
      return `<span class="status-badge status-ongoing"><i class="fa-solid fa-clock"></i> Ongoing</span>`;
    } else if (s.includes('HOLD')) {
      return `<span class="status-badge status-hold"><i class="fa-solid fa-circle-pause"></i> Hold</span>`;
    } else if (s.includes('CANCEL') || s.includes('DEACTIVASI')) {
      return `<span class="status-badge status-cancel"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(status)}</span>`;
    } else {
      return `<span class="status-badge status-nonactive">${escapeHtml(status || 'Non Active')}</span>`;
    }
  };

  const getAgingBadge = (days) => {
    if (days === null || days === undefined || days < 0) {
      return `<span class="aging-badge aging-green">-</span>`;
    }
    if (days <= 7) {
      return `<span class="aging-badge aging-green" title="SLA Aman (&le; 7 Hari)"><i class="fa-solid fa-check"></i> ${days} Hari</span>`;
    } else if (days <= 14) {
      return `<span class="aging-badge aging-yellow" title="Perhatian (8 - 14 Hari)"><i class="fa-solid fa-triangle-exclamation"></i> ${days} Hari</span>`;
    } else {
      return `<span class="aging-badge aging-red" title="Kritis (> 14 Hari)"><i class="fa-solid fa-fire"></i> ${days} Hari</span>`;
    }
  };

  const getAlertBadge = (category, sisaHari) => {
    const cat = (category || '').toUpperCase();
    if (cat === 'CRITICAL') {
      return `<span class="alert-pill alert-critical"><i class="fa-solid fa-fire"></i> CRITICAL (${sisaHari} Hari)</span>`;
    } else if (cat === 'WARNING') {
      return `<span class="alert-pill alert-warning"><i class="fa-solid fa-bell"></i> WARNING (${sisaHari} Hari)</span>`;
    } else if (cat === 'SAFE') {
      return `<span class="alert-pill alert-safe"><i class="fa-solid fa-shield-check"></i> SAFE (${sisaHari} Hari)</span>`;
    } else {
      return `<span class="alert-pill alert-expired"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRED (${sisaHari} Hari)</span>`;
    }
  };

  // --- INITIALIZATION ---
  async function init() {
    initTheme();
    setupEventListeners();
    await loadMetaOptions();
    initAuth();
  }

  // --- AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) ---
  function initAuth() {
    const savedUser = localStorage.getItem('telecom_portal_user');
    if (savedUser) {
      try {
        state.currentUser = JSON.parse(savedUser);
        hideLoginOverlay();
        applyRolePermissions(state.currentUser.role);
        return;
      } catch (e) {
        localStorage.removeItem('telecom_portal_user');
        state.currentUser = null;
      }
    }
    showLoginOverlay();
  }

  function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('topbarUserProfile')?.classList.add('hidden');
    document.getElementById('btnLogout')?.classList.add('hidden');
  }

  function hideLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    document.getElementById('topbarUserProfile')?.classList.remove('hidden');
    document.getElementById('btnLogout')?.classList.remove('hidden');
  }

  function applyRolePermissions(role) {
    const isLapangan = role === 'lapangan';

    // 1. Update Topbar User Profile Badge
    const nameDisplay = document.getElementById('userNameDisplay');
    const roleDisplay = document.getElementById('userRoleDisplay');
    const avatarIcon = document.getElementById('userRoleIcon');
    const avatarBox = document.getElementById('userRoleAvatar');

    if (nameDisplay) {
      nameDisplay.textContent = state.currentUser?.full_name || (isLapangan ? 'Tim SITAC & Lapangan' : 'Administrator');
    }
    if (roleDisplay) {
      roleDisplay.textContent = isLapangan ? 'TIM LAPANGAN (SITAC)' : 'MANAJEMEN / ADMIN';
      roleDisplay.className = isLapangan ? 'text-[9px] uppercase tracking-wider text-emerald-400 font-semibold' : 'text-[9px] uppercase tracking-wider text-cyan-400 font-semibold';
    }
    if (avatarIcon) {
      avatarIcon.className = isLapangan ? 'fa-solid fa-helmet-safety' : 'fa-solid fa-shield-halved';
    }
    if (avatarBox) {
      avatarBox.className = isLapangan
        ? 'w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    }

    // 2. Hide / Show Sidebar Menus
    const groupCollo = document.getElementById('groupCollo');
    const execNavWrap = document.querySelector('.nav-item[data-view="view-executive"]')?.closest('.nav-section-wrap');

    if (groupCollo) {
      groupCollo.style.display = isLapangan ? 'none' : '';
    }
    if (execNavWrap) {
      execNavWrap.style.display = isLapangan ? 'none' : '';
    }

    // 3. Add Data Modal Restrictions: Hide Colocation Option for Lapangan
    const pickCollo = document.getElementById('btnPickCollo');
    if (pickCollo) {
      pickCollo.style.display = isLapangan ? 'none' : '';
    }

    // 4. Initial Landing View
    if (isLapangan) {
      // Auto-expand groupSitac
      const groupSitac = document.getElementById('groupSitac');
      if (groupSitac && groupSitac.classList.contains('collapsed')) {
        groupSitac.classList.remove('collapsed');
      }
      // If currently on executive or collo, redirect to view-sitac-pa
      if (state.activeView === 'view-executive' || state.activeView.startsWith('view-collo-')) {
        switchView('view-sitac-pa');
      } else {
        switchView(state.activeView);
      }
    } else {
      // Admin: load executive summary if on initial view
      if (state.activeView === 'view-executive') {
        loadExecutiveSummary();
      } else {
        switchView(state.activeView);
      }
    }
  }

  async function performLogin(username, password) {
    const errBox = document.getElementById('loginErrorAlert');
    const errMsg = document.getElementById('loginErrorMsg');
    const submitBtn = document.getElementById('btnLoginSubmit');
    if (errBox) errBox.classList.add('hidden');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Memvalidasi...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Username atau password tidak sesuai');
      }

      state.currentUser = data.user;
      state.token = data.token;
      localStorage.setItem('telecom_portal_user', JSON.stringify(data.user));
      localStorage.setItem('telecom_portal_token', data.token);

      hideLoginOverlay();
      applyRolePermissions(data.user.role);
      showToast(data.message || `Selamat datang, ${data.user.full_name}!`, 'success');

      if (document.getElementById('loginUsername')) document.getElementById('loginUsername').value = '';
      if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';

    } catch (err) {
      if (errBox) {
        errBox.classList.remove('hidden');
        if (errMsg) errMsg.textContent = err.message;
      }
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1"></i> Masuk ke Portal';
      }
    }
  }

  function performLogout() {
    localStorage.removeItem('telecom_portal_user');
    localStorage.removeItem('telecom_portal_token');
    state.currentUser = null;
    state.token = null;
    showLoginOverlay();
    showToast('Anda telah keluar dari sistem.', 'info');
  }

  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const icon = document.querySelector('#themeToggleBtn i');
    if (icon) {
      icon.className = state.theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  }

  async function loadMetaOptions() {
    try {
      const res = await fetch('/api/meta/options');
      if (res.ok) {
        state.meta = await res.json();
        populateFilterDropdowns();
      }
    } catch (e) {
      console.warn('Gagal memuat filter options:', e);
    }
  }

  function populateFilterDropdowns() {
    // Pengelola
    const pSelect = document.getElementById('colloFilterPengelola');
    if (pSelect && state.meta.pengelola) {
      pSelect.innerHTML = '<option value="ALL">Semua Pengelola</option>' + 
        state.meta.pengelola.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }

    // Jenis Sewa
    const jSelect = document.getElementById('colloFilterJenis');
    if (jSelect && state.meta.jenis_sewa) {
      jSelect.innerHTML = '<option value="ALL">Semua Jenis Sewa</option>' +
        state.meta.jenis_sewa.map(j => `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`).join('');
    }

    // PIC SITAC
    const picSelect = document.getElementById('sitacFilterPic');
    if (picSelect && state.meta.pic) {
      picSelect.innerHTML = '<option value="ALL">Semua PIC SITAC</option>' +
        state.meta.pic.map(pic => `<option value="${escapeHtml(pic)}">${escapeHtml(pic)}</option>`).join('');
    }
  }

  // --- NAVIGATION ROUTING ---
  function switchView(viewId) {
    // RBAC: Tim Lapangan cannot access executive or colocation views
    if (state.currentUser?.role === 'lapangan' && (viewId === 'view-executive' || viewId.startsWith('view-collo-'))) {
      showToast('Akses dibatasi. Modul Colocation & Finansial hanya untuk Manajemen.', 'error');
      viewId = 'view-sitac-pa';
    }

    state.activeView = viewId;

    // Update active nav button
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });

    // Toggle active view container
    document.querySelectorAll('.portal-view').forEach(view => {
      view.classList.toggle('active', view.id === viewId);
    });

    // Update topbar breadcrumbs
    const bcCat = document.getElementById('breadcrumbCategory');
    const bcTitle = document.getElementById('breadcrumbPageTitle');

    const metaMap = {
      'view-executive': { cat: 'Ringkasan', title: 'Dashboard Ringkasan Eksekutif' },
      'view-collo-list': { cat: 'Colocation & Sewa Aset', title: 'Daftar Link & Finansial (Sewa Aset)' },
      'view-collo-rev-sharing': { cat: 'Colocation & Sewa Aset', title: 'Skema Revenue Sharing Mitra' },
      'view-collo-alerts': { cat: 'Colocation & Sewa Aset', title: 'Monitoring Jatuh Tempo Kontrak (Alerts)' },
      'view-sitac-pa': { cat: 'Operasional SITAC & Lapangan', title: 'Monitoring Perizinan Proyek (PA)' },
      'view-gangguan': { cat: 'Operasional SITAC & Lapangan', title: 'Tiket Gangguan Darurat (Incident SLA)' },
      'view-efisiensi': { cat: 'Operasional SITAC & Lapangan', title: 'Rekap Efisiensi Biaya Negosiasi' },
      'view-pic-matrix': { cat: 'Operasional SITAC & Lapangan', title: 'Beban Kerja & Leaderboard PIC SITAC' },
      'view-webgis': { cat: 'Operasional SITAC & Lapangan', title: 'Peta Sebaran Lokasi Spasial (WebGIS)' }
    };

    if (metaMap[viewId]) {
      bcCat.textContent = metaMap[viewId].cat;
      bcTitle.textContent = metaMap[viewId].title;
    }

    // Auto-expand parent accordion group if target item is inside it
    const activeNavBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    const parentNavGroup = activeNavBtn?.closest('.nav-section-group');
    if (parentNavGroup && parentNavGroup.classList.contains('collapsed')) {
      parentNavGroup.classList.remove('collapsed');
    }

    // Lazy load data for view
    if (viewId === 'view-executive') loadExecutiveSummary();
    else if (viewId === 'view-collo-list') loadColloData();
    else if (viewId === 'view-collo-rev-sharing') loadRevSharingData();
    else if (viewId === 'view-collo-alerts') loadAlertsData();
    else if (viewId === 'view-sitac-pa') loadSitacData();
    else if (viewId === 'view-gangguan') loadGangguanData();
    else if (viewId === 'view-efisiensi') loadEfisiensiData();
    else if (viewId === 'view-pic-matrix') loadPicMatrixData();
    else if (viewId === 'view-webgis') {
      setTimeout(() => initWebgisMap(), 50);
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 250);
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 500);
    }
  }

  // =========================================================================
  // VIEW 1: EXECUTIVE OVERVIEW
  // =========================================================================
  async function loadExecutiveSummary() {
    try {
      const res = await fetch('/api/executive/summary');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      state.execData = data;

      // Populate Cards
      const c = data.collo || {};
      document.getElementById('execActiveCollo').textContent = Number(c.active_count || 880).toLocaleString('id-ID');
      document.getElementById('execHistCollo').textContent = Number(c.total_records - c.active_count).toLocaleString('id-ID');
      document.getElementById('execDeactCollo').textContent = Number(c.deactivasi_count || 285).toLocaleString('id-ID');
      document.getElementById('execMarginRp').textContent = formatRupiah(c.active_margin);
      document.getElementById('execRevRp').textContent = formatRupiah(c.active_revenue);
      document.getElementById('execMarginPct').textContent = `${c.margin_pct}%`;

      const s = data.sitac || {};
      document.getElementById('execSitacFinish').innerHTML = `${s.finish_count} <span class="text-xs text-slate-400 font-normal">/ ${s.total_pa} PA</span>`;
      document.getElementById('execSitacSavings').textContent = formatRupiah(s.total_efisiensi_rupiah);

      const g = data.gangguan || {};
      document.getElementById('execGangguanTotal').textContent = g.total_gangguan || 393;
      document.getElementById('execGangguanSelesai').textContent = g.selesai_count || 96;
      document.getElementById('execGangguanOpen').textContent = g.aktif_count || 297;

      // Update Nav Badges dynamically
      const bCollo = document.getElementById('badgeNavActiveCollo');
      if (bCollo) bCollo.textContent = Number(c.active_count || 880).toLocaleString('id-ID');
      const bRev = document.getElementById('badgeNavRevShare');
      if (bRev) bRev.textContent = Number(c.rev_sharing_count || 423).toLocaleString('id-ID');
      const bAlerts = document.getElementById('badgeNavCriticalAlerts');
      if (bAlerts) bAlerts.textContent = Number(c.critical_alerts_count || 40).toLocaleString('id-ID');
      const bSitac = document.getElementById('badgeNavSitac');
      if (bSitac) bSitac.textContent = Number(s.total_pa || 451).toLocaleString('id-ID');
      const bGangguan = document.getElementById('badgeNavGangguan');
      if (bGangguan) bGangguan.textContent = Number(g.total_gangguan || 393).toLocaleString('id-ID');

      // Update Power BI Radial Gauges
      const sitacRate = (s.total_pa > 0) ? (s.finish_count / s.total_pa * 100).toFixed(1) : 0;
      if (document.getElementById('gaugeSitacRate')) document.getElementById('gaugeSitacRate').textContent = `${sitacRate}%`;
      if (document.getElementById('gaugeSitacBar')) document.getElementById('gaugeSitacBar').style.width = `${sitacRate}%`;

      const savingsRate = s.efisiensi_pct || 0;
      if (document.getElementById('gaugeSavingsRate')) document.getElementById('gaugeSavingsRate').textContent = `${savingsRate}%`;
      if (document.getElementById('gaugeSavingsBar')) document.getElementById('gaugeSavingsBar').style.width = `${savingsRate}%`;

      const marginRate = c.margin_pct || 0;
      if (document.getElementById('gaugeMarginRate')) document.getElementById('gaugeMarginRate').textContent = `${marginRate}%`;
      if (document.getElementById('gaugeMarginBar')) document.getElementById('gaugeMarginBar').style.width = `${marginRate}%`;

      const resRate = g.resolution_rate || 0;
      if (document.getElementById('gaugeGangguanRate')) document.getElementById('gaugeGangguanRate').textContent = `${resRate}%`;
      if (document.getElementById('gaugeGangguanBar')) document.getElementById('gaugeGangguanBar').style.width = `${resRate}%`;

      // Render Charts
      renderExecutiveCharts(data);

    } catch (e) {
      console.error('Failed to load executive summary:', e);
    }
  }

  function renderExecutiveCharts(data) {
    const { textColor, gridColor } = getChartTheme();

    // Chart 1: Top 10 Pengelola (Horizontal Bar)
    const ctxPengelola = document.getElementById('chartTopPengelola')?.getContext('2d');
    if (ctxPengelola) {
      destroyChart('topPengelola');
      const topP = data.top_pengelola || [];
      charts.topPengelola = new Chart(ctxPengelola, {
        type: 'bar',
        data: {
          labels: topP.map(p => p.pengelola.length > 20 ? p.pengelola.slice(0, 20) + '...' : p.pengelola),
          datasets: [
            {
              label: 'Biaya Sewa Mitra (Rp)',
              data: topP.map(p => p.total_biaya),
              backgroundColor: 'rgba(245, 158, 11, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Revenue Sewa (Rp)',
              data: topP.map(p => p.total_rev),
              backgroundColor: 'rgba(6, 182, 212, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e9).toFixed(1) + 'M' } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }

    // Chart 2: SITAC Status Donut
    const ctxStatus = document.getElementById('chartSitacStatus')?.getContext('2d');
    if (ctxStatus) {
      destroyChart('sitacStatus');
      const s = data.sitac || {};
      charts.sitacStatus = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: ['Finish', 'Ongoing', 'Hold', 'Cancel'],
          datasets: [{
            data: [s.finish_count || 373, s.ongoing_count || 10, s.hold_count || 5, s.cancel_count || 63],
            backgroundColor: ['#10b981', '#06b6d4', '#eab308', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 14 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} PA (${((ctx.raw / (s.total_pa || 451)) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '72%'
        }
      });
    }

    // Chart 3: Jenis Sewa Donut
    const ctxJenis = document.getElementById('chartJenisSewa')?.getContext('2d');
    if (ctxJenis) {
      destroyChart('jenisSewa');
      const jd = data.jenis_sewa_dist || [];
      const totalCnt = jd.reduce((acc, curr) => acc + curr.cnt, 0);
      charts.jenisSewa = new Chart(ctxJenis, {
        type: 'doughnut',
        data: {
          labels: jd.map(j => j.jenis),
          datasets: [{
            data: jd.map(j => j.cnt),
            backgroundColor: ['#06b6d4', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, padding: 10 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Sirkuit (${((ctx.raw / (totalCnt || 880)) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '70%'
        }
      });
    }

    // Chart 4: Expiration Donut
    const ctxExp = document.getElementById('chartExpirationDonut')?.getContext('2d');
    if (ctxExp) {
      destroyChart('expirationDonut');
      const ed = data.expiration_dist || [];
      const colorMap = {
        'CRITICAL': '#ef4444',
        'WARNING': '#f59e0b',
        'SAFE': '#10b981',
        'EXPIRED': '#64748b'
      };
      charts.expirationDonut = new Chart(ctxExp, {
        type: 'doughnut',
        data: {
          labels: ed.map(e => e.alert_category),
          datasets: [{
            data: ed.map(e => e.cnt),
            backgroundColor: ed.map(e => colorMap[e.alert_category] || '#94a3b8'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, padding: 10 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Sirkuit`
              }
            }
          },
          cutout: '70%'
        }
      });
    }

    // Chart 5: Monthly Trend
    const ctxTrend = document.getElementById('chartMonthlyTrend')?.getContext('2d');
    if (ctxTrend) {
      destroyChart('monthlyTrend');
      const trend = data.monthly_trend || [];
      const labels = trend.map(t => `Bln ${t.bulan}/${t.tahun}`);
      charts.monthlyTrend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              type: 'bar',
              label: 'Penugasan Masuk (Dispos)',
              data: trend.map(t => t.count_masuk),
              backgroundColor: 'rgba(6, 182, 212, 0.7)',
              borderRadius: 4
            },
            {
              type: 'line',
              label: 'Penyelesaian Selesai (Close)',
              data: trend.map(t => t.count_selesai),
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 2.5,
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: textColor } } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }

    // Chart 6: Efisiensi Tahunan (Grouped Bar)
    const ctxEff = document.getElementById('chartEfisiensiTahunan')?.getContext('2d');
    if (ctxEff) {
      destroyChart('efisiensiTahunan');
      const el = data.rekap_efisiensi_list || [];
      charts.efisiensiTahunan = new Chart(ctxEff, {
        type: 'bar',
        data: {
          labels: el.map(r => `Tahun ${r.tahun}`),
          datasets: [
            {
              label: 'Biaya Pengajuan Awal',
              data: el.map(r => r.nilai_awal),
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 4
            },
            {
              label: 'Realisasi Biaya Akhir',
              data: el.map(r => r.nilai_akhir),
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e6).toFixed(0) + ' Jt' } }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 2: DAFTAR LINK & FINANSIAL (MODUL A)
  // =========================================================================
  async function loadColloData() {
    const { status, jenisSewa, pengelola, search, sort, page, pageSize } = state.collo;
    const params = new URLSearchParams({
      status, jenis_sewa: jenisSewa, pengelola, search, sort, page, pageSize
    });

    try {
      const res = await fetch(`/api/collo?${params}`);
      if (!res.ok) throw new Error('Failed to fetch collo');
      const json = await res.json();
      state.collo.data = json.data;

      // Update summary bar
      document.getElementById('colloTableSummaryText').innerHTML = `Menampilkan <strong>${json.total}</strong> sirkuit (${status === 'ACTIVE' ? 'Default: ACTIVE' : status})`;
      document.getElementById('colloSumRev').textContent = formatRupiah(json.totals?.revenue);
      document.getElementById('colloSumBiaya').textContent = formatRupiah(json.totals?.biaya);
      document.getElementById('colloSumMargin').textContent = formatRupiah(json.totals?.margin);

      // Pagination info
      document.getElementById('colloPaginationInfo').textContent = `Halaman ${json.page} dari ${json.totalPages} (${json.total} data)`;
      document.getElementById('colloPrevPageBtn').disabled = json.page <= 1;
      document.getElementById('colloNextPageBtn').disabled = json.page >= json.totalPages;

      renderColloTable(json.data);

      if (!state.execData) {
        fetch('/api/executive/summary').then(r => r.json()).then(d => {
          state.execData = d;
          renderColloCharts();
        });
      } else {
        renderColloCharts();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderColloCharts() {
    if (!state.execData) return;
    const { textColor, gridColor } = getChartTheme();

    // Chart Collo 1: Status Dist (Active, Non-Active, Deaktivasi)
    const ctxStat = document.getElementById('chartColloStatusDist')?.getContext('2d');
    if (ctxStat) {
      destroyChart('colloStatusDist');
      const dist = state.execData.collo_status_dist || [];
      const total = dist.reduce((acc, curr) => acc + curr.cnt, 0);
      const colorMap = { 'ACTIVE': '#10b981', 'NON ACTIVE': '#64748b', 'DEACTIVASI': '#ef4444' };
      charts.colloStatusDist = new Chart(ctxStat, {
        type: 'doughnut',
        data: {
          labels: dist.map(d => d.status),
          datasets: [{
            data: dist.map(d => d.cnt),
            backgroundColor: dist.map(d => colorMap[d.status] || '#06b6d4'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${Number(ctx.raw).toLocaleString('id-ID')} sirkuit (${((ctx.raw / (total || 3123)) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart Collo 2: Top 8 Vendors
    const ctxVendors = document.getElementById('chartColloTopVendors')?.getContext('2d');
    if (ctxVendors) {
      destroyChart('colloTopVendors');
      const vendors = state.execData.top_collo_vendors || [];
      charts.colloTopVendors = new Chart(ctxVendors, {
        type: 'bar',
        data: {
          labels: vendors.map(v => v.pengelola.length > 18 ? v.pengelola.slice(0, 18) + '...' : v.pengelola),
          datasets: [{
            label: 'Jumlah Sirkuit Aktif',
            data: vendors.map(v => v.sirkuit_count),
            backgroundColor: 'rgba(6, 182, 212, 0.8)',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }
  }

  function renderColloTable(records) {
    const tbody = document.getElementById('colloTableBody');
    if (!tbody) return;

    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-10 text-slate-500">Tidak ada sirkuit yang sesuai filter.</td></tr>`;
      return;
    }

    let html = '';
    records.forEach((c, idx) => {
      const rowIdx = (state.collo.page - 1) * state.collo.pageSize + idx + 1;
      html += `
        <tr>
          <td class="font-mono text-xs text-slate-500">${rowIdx}</td>
          <td><strong>${escapeHtml(c.pengelola || '-')}</strong></td>
          <td>${escapeHtml(c.pelanggan || '-')}</td>
          <td>
            <div class="font-mono text-cyan-400 text-xs">${escapeHtml(c.sid || '-')}</div>
            <div class="text-[11px] text-slate-500">${escapeHtml(c.no_so || '-')}</div>
          </td>
          <td class="max-w-[200px] truncate" title="${escapeHtml(c.terminating)}">${escapeHtml(c.terminating || c.originating || '-')}</td>
          <td><span class="badge-pill bg-slate-800 text-slate-300">${escapeHtml(c.jenis_sewa || 'Colocation')}</span></td>
          <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(c.rev_sewa_tahun)}</td>
          <td class="text-right font-mono text-amber-400">${formatRupiah(c.biaya_sewa_tahun)}</td>
          <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(c.margin_rupiah)} <span class="text-[10px] text-slate-500">(${c.margin_persen}%)</span></td>
          <td class="text-center">${getStatusBadge(c.status)}</td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}" title="Quick Update Status"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn-action btn-view-detail" data-type="collo" data-id="${c.id}" title="Detail Rincian"><i class="fa-solid fa-eye"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  // =========================================================================
  // VIEW 3: REVENUE SHARING (MODUL A)
  // =========================================================================
  async function loadRevSharingData() {
    try {
      const q = encodeURIComponent(state.revSharing.search);
      const res = await fetch(`/api/collo/rev-sharing?search=${q}`);
      if (!res.ok) throw new Error('Failed to load rev sharing');
      const json = await res.json();

      // Cards
      const sum = json.summary || {};
      document.getElementById('revShareTotalLinks').textContent = sum.total_links || 0;
      document.getElementById('revShareTotalRev').textContent = formatRupiah(sum.total_rev);
      document.getElementById('revShareTotalFee').textContent = formatRupiah(sum.total_sharing);
      document.getElementById('revShareAvgPct').textContent = sum.avg_pct_display || '20.0%';

      // Top Pengelola Breakdown Table
      const tbPengelola = document.getElementById('revSharePengelolaTableBody');
      if (tbPengelola) {
        let phtml = '';
        (json.top_pengelola || []).forEach(p => {
          phtml += `
            <tr>
              <td><strong>${escapeHtml(p.pengelola)}</strong></td>
              <td class="text-center font-bold text-amber-400">${p.link_count} Link</td>
              <td class="text-right font-mono text-emerald-400">${formatRupiah(p.total_rev)}</td>
              <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(p.total_sharing)}</td>
              <td class="text-center font-mono">${roundPct(p.avg_pct)}%</td>
            </tr>
          `;
        });
        tbPengelola.innerHTML = phtml;
      }

      // Detailed Links Table
      const tbLinks = document.getElementById('revShareTableBody');
      if (tbLinks) {
        let lhtml = '';
        (json.data || []).slice(0, 50).forEach((c, idx) => {
          lhtml += `
            <tr>
              <td class="text-xs text-slate-500">${idx + 1}</td>
              <td><strong>${escapeHtml(c.pengelola)}</strong></td>
              <td>${escapeHtml(c.pelanggan)}</td>
              <td class="font-mono text-xs text-cyan-400">${escapeHtml(c.no_so || c.sid || '-')}</td>
              <td class="max-w-[180px] truncate" title="${escapeHtml(c.terminating)}">${escapeHtml(c.terminating || '-')}</td>
              <td class="text-right font-mono text-emerald-400">${formatRupiah(c.rev_sewa_tahun)}</td>
              <td class="text-center font-mono font-bold text-amber-400 bg-amber-500/10 rounded">${escapeHtml(c.rev_sharing_raw || `${roundPct(c.rev_sharing_pct)}%`)}</td>
              <td class="text-right font-mono font-bold text-cyan-400">${formatRupiah(c.biaya_rev_sharing)}</td>
              <td class="text-center">${getStatusBadge(c.status)}</td>
              <td class="text-center">
                <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}"><i class="fa-solid fa-pen-to-square"></i></button>
              </td>
            </tr>
          `;
        });
        tbLinks.innerHTML = lhtml;
      }

      renderRevShareCharts(json);

    } catch (e) {
      console.error(e);
    }
  }

  function renderRevShareCharts(json) {
    const { textColor, gridColor } = getChartTheme();
    const top7 = (json.top_pengelola || []).slice(0, 7);

    // Chart RevShare 1: Top Mitra Portfolio Donut
    const ctxMitra = document.getElementById('chartRevShareMitra')?.getContext('2d');
    if (ctxMitra && top7.length > 0) {
      destroyChart('revShareMitra');
      charts.revShareMitra = new Chart(ctxMitra, {
        type: 'doughnut',
        data: {
          labels: top7.map(m => m.pengelola.length > 16 ? m.pengelola.slice(0, 16) + '...' : m.pengelola),
          datasets: [{
            data: top7.map(m => m.total_rev),
            backgroundColor: ['#06b6d4', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, padding: 10 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart RevShare 2: Revenue vs Bagi Hasil (Side-by-side)
    const ctxComp = document.getElementById('chartRevShareCompare')?.getContext('2d');
    if (ctxComp && top7.length > 0) {
      destroyChart('revShareCompare');
      charts.revShareCompare = new Chart(ctxComp, {
        type: 'bar',
        data: {
          labels: top7.map(m => m.pengelola.length > 15 ? m.pengelola.slice(0, 15) + '...' : m.pengelola),
          datasets: [
            {
              label: 'Revenue Pelanggan',
              data: top7.map(m => m.total_rev),
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Biaya Bagi Hasil Mitra',
              data: top7.map(m => m.total_sharing),
              backgroundColor: 'rgba(6, 182, 212, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e9).toFixed(1) + 'M' } }
          }
        }
      });
    }
  }

  function roundPct(val) {
    if (!val) return 0;
    return Math.round(Number(val) * 1000) / 10;
  }

  // =========================================================================
  // VIEW 4: MONITORING JATUH TEMPO KONTRAK (MODUL A)
  // =========================================================================
  async function loadAlertsData() {
    const { category, search } = state.alerts;
    try {
      const res = await fetch(`/api/collo/expirations?category=${category}&search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('Failed to load alerts');
      const json = await res.json();

      // Counts
      const cnt = json.counts || {};
      document.getElementById('countAlertCritical').textContent = cnt.critical || 0;
      document.getElementById('countAlertWarning').textContent = cnt.warning || 0;
      document.getElementById('countAlertSafe').textContent = cnt.safe || 0;
      document.getElementById('countAlertExpired').textContent = cnt.expired || 0;

      // Table Title
      document.getElementById('alertTableTitle').textContent = `Daftar Kontrak: ${category} (${(json.data || []).length} sirkuit)`;

      // Table Body
      const tbody = document.getElementById('alertTableBody');
      if (tbody) {
        let html = '';
        (json.data || []).slice(0, 60).forEach((c, idx) => {
          html += `
            <tr>
              <td class="text-xs text-slate-500">${idx + 1}</td>
              <td><strong>${escapeHtml(c.pengelola)}</strong></td>
              <td>${escapeHtml(c.pelanggan)}</td>
              <td class="font-mono text-xs text-cyan-400">${escapeHtml(c.sid || c.no_so || '-')}</td>
              <td>${c.end_date || '-'}</td>
              <td class="text-center font-bold font-mono">${c.sisa_hari} Hari</td>
              <td class="text-center">${getAlertBadge(c.alert_category, c.sisa_hari)}</td>
              <td class="font-mono text-xs">${escapeHtml(c.spp || c.po_baru || c.ref_spp || '-')}</td>
              <td><span class="badge-pill bg-slate-800 text-slate-300 text-xs">${escapeHtml(c.proses_admin || 'Running')}</span></td>
              <td><strong>${escapeHtml(c.pic_admin || '-')}</strong></td>
              <td class="text-center">
                <button class="btn-action btn-quick-edit" data-type="collo" data-id="${c.id}" title="Update SPP / Status"><i class="fa-solid fa-pen-to-square"></i></button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderAlertsCharts(json);

    } catch (e) {
      console.error(e);
    }
  }

  function renderAlertsCharts(json) {
    const { textColor, gridColor } = getChartTheme();
    const cnt = json.counts || {};

    // Chart Alerts 1: Category Donut
    const ctxCat = document.getElementById('chartAlertsCategoryDonut')?.getContext('2d');
    if (ctxCat) {
      destroyChart('alertsCategoryDonut');
      charts.alertsCategoryDonut = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: ['CRITICAL (<30 Hari)', 'WARNING (30-60 Hari)', 'SAFE (>60 Hari)', 'EXPIRED / Overdue'],
          datasets: [{
            data: [cnt.critical || 0, cnt.warning || 0, cnt.safe || 0, cnt.expired || 0],
            backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Sirkuit`
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Chart Alerts 2: Remaining Days Bar
    const ctxDays = document.getElementById('chartAlertsSisaHari')?.getContext('2d');
    if (ctxDays) {
      destroyChart('alertsSisaHari');
      let overdue = 0, d0_30 = 0, d31_60 = 0, d61_90 = 0, d90plus = 0;
      (json.data || []).forEach(c => {
        const d = c.sisa_hari;
        if (d < 0) overdue++;
        else if (d <= 30) d0_30++;
        else if (d <= 60) d31_60++;
        else if (d <= 90) d61_90++;
        else d90plus++;
      });

      charts.alertsSisaHari = new Chart(ctxDays, {
        type: 'bar',
        data: {
          labels: ['Overdue (<0 Hari)', '0 - 30 Hari', '31 - 60 Hari', '61 - 90 Hari', '> 90 Hari'],
          datasets: [{
            label: 'Jumlah Sirkuit',
            data: [overdue, d0_30, d31_60, d61_90, d90plus],
            backgroundColor: ['#64748b', '#ef4444', '#f59e0b', '#38bdf8', '#10b981'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 5: MONITORING PERIZINAN PROYEK PA (MODUL B)
  // =========================================================================
  async function loadSitacData() {
    const { status, pic, year, aging, search, page, pageSize } = state.sitac;
    const params = new URLSearchParams({
      status, pic, year, aging, search, page, pageSize
    });

    try {
      const res = await fetch(`/api/sitac?${params}`);
      if (!res.ok) throw new Error('Failed to load SITAC');
      const json = await res.json();
      state.sitac.data = json.data;

      // Pagination
      document.getElementById('sitacPaginationInfo').textContent = `Halaman ${json.page} dari ${json.totalPages} (${json.total} data)`;
      document.getElementById('sitacPrevPageBtn').disabled = json.page <= 1;
      document.getElementById('sitacNextPageBtn').disabled = json.page >= json.totalPages;

      const tbody = document.getElementById('sitacTableBody');
      if (tbody) {
        let html = '';
        (json.data || []).forEach((s, idx) => {
          const rowIdx = (json.page - 1) * json.pageSize + idx + 1;
          html += `
            <tr>
              <td class="font-mono text-xs text-slate-500">${rowIdx}</td>
              <td class="font-mono font-bold text-cyan-400 text-xs">${escapeHtml(s.no_pa || '-')}</td>
              <td><strong>${escapeHtml(s.pelanggan || '-')}</strong></td>
              <td>${escapeHtml(s.pic_perijinan || '-')}</td>
              <td class="max-w-[200px] truncate" title="${escapeHtml(s.terminating)}">${escapeHtml(s.terminating || '-')}</td>
              <td class="text-right font-mono">${formatRupiah(s.biaya_permintaan_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(s.biaya_final)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(s.efisiensi_rupiah)}</td>
              <td class="text-center">${getStatusBadge(s.progress)}</td>
              <td class="text-center">${getAgingBadge(s.durasi_hari)}</td>
              <td class="text-xs text-slate-400">${s.date_dispos || '-'} s/d ${s.date_close || '-'}</td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-1">
                  <button class="btn-action btn-quick-edit" data-type="sitac" data-id="${s.id}" title="Update Status PA"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn-action btn-view-detail" data-type="sitac" data-id="${s.id}" title="Detail"><i class="fa-solid fa-eye"></i></button>
                </div>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      if (!state.execData) {
        fetch('/api/executive/summary').then(r => r.json()).then(d => {
          state.execData = d;
          renderSitacCharts();
        });
      } else {
        renderSitacCharts();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderSitacCharts() {
    if (!state.execData) return;
    const { textColor, gridColor } = getChartTheme();

    // Chart SITAC 1: SLA Aging
    const ctxAging = document.getElementById('chartSitacAging')?.getContext('2d');
    if (ctxAging) {
      destroyChart('sitacAging');
      const ag = state.execData.sitac_aging_dist || { green: 173, yellow: 82, red: 179 };
      charts.sitacAging = new Chart(ctxAging, {
        type: 'bar',
        data: {
          labels: ['Aman (<= 7 Hari)', 'Perhatian (8 - 14 Hari)', 'Kritis (> 14 Hari)'],
          datasets: [{
            label: 'Penugasan Perizinan (PA)',
            data: [ag.green || 0, ag.yellow || 0, ag.red || 0],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }

    // Chart SITAC 2: Status Breakdown
    const ctxStatDetail = document.getElementById('chartSitacStatusDetail')?.getContext('2d');
    if (ctxStatDetail) {
      destroyChart('sitacStatusDetail');
      const s = state.execData.sitac || {};
      charts.sitacStatusDetail = new Chart(ctxStatDetail, {
        type: 'doughnut',
        data: {
          labels: ['Finish', 'Ongoing', 'Hold', 'Cancel'],
          datasets: [{
            data: [s.finish_count || 373, s.ongoing_count || 10, s.hold_count || 5, s.cancel_count || 63],
            backgroundColor: ['#10b981', '#06b6d4', '#eab308', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} PA (${((ctx.raw / (s.total_pa || 451)) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '68%'
        }
      });
    }
  }

  // =========================================================================
  // VIEW 6: TIKET GANGGUAN DARURAT (MODUL B)
  // =========================================================================
  async function loadGangguanData() {
    const { status, search } = state.gangguan;
    try {
      const res = await fetch(`/api/gangguan?status=${status}&search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('Failed to load gangguan');
      const json = await res.json();
      state.gangguan.data = json.data;

      const tbody = document.getElementById('gangguanTableBody');
      if (tbody) {
        let html = '';
        (json.data || []).forEach((g, idx) => {
          const stBadge = g.is_selesai === 1 
            ? `<span class="status-badge status-finish"><i class="fa-solid fa-circle-check"></i> Selesai</span>`
            : `<span class="status-badge status-ongoing"><i class="fa-solid fa-clock"></i> Open / Proses</span>`;

          html += `
            <tr>
              <td class="font-mono text-xs text-slate-500">${idx + 1}</td>
              <td class="font-mono font-bold text-cyan-400 text-xs">${escapeHtml(g.no_tiket)}</td>
              <td>${g.tgl_dispos || '-'}</td>
              <td>${g.tgl_selesai || '-'}</td>
              <td class="max-w-[200px] truncate" title="${escapeHtml(g.terminating)}">${escapeHtml(g.terminating || '-')}</td>
              <td><span class="badge-pill bg-slate-800 text-slate-300 text-xs">${escapeHtml(g.jenis_gangguan || 'FO Cut')}</span></td>
              <td><strong>${escapeHtml(g.pic_perijinan || '-')}</strong></td>
              <td class="text-right font-mono text-amber-400">${formatRupiah(g.biaya_gangguan)}</td>
              <td class="text-center">${stBadge}</td>
              <td class="max-w-[220px] truncate text-xs text-slate-400" title="${escapeHtml(g.update_gangguan)}">${escapeHtml(g.update_gangguan || '-')}</td>
              <td class="text-center">
                <button class="btn-action btn-quick-edit" data-type="gangguan" data-id="${g.id}" title="Update Status Tiket"><i class="fa-solid fa-pen-to-square"></i></button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderGangguanCharts(json.data);

    } catch (e) {
      console.error(e);
    }
  }

  function renderGangguanCharts(records) {
    const { textColor, gridColor } = getChartTheme();
    if (!records || records.length === 0) return;

    // Chart Gangguan 1: Incident Types
    const ctxJenis = document.getElementById('chartGangguanJenis')?.getContext('2d');
    if (ctxJenis) {
      destroyChart('gangguanJenis');
      const counts = {};
      records.forEach(r => {
        let j = (r.jenis_gangguan || 'Lain-lain').trim();
        if (j.length > 25) j = j.slice(0, 25) + '...';
        counts[j] = (counts[j] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

      charts.gangguanJenis = new Chart(ctxJenis, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s[0]),
          datasets: [{
            label: 'Jumlah Kasus',
            data: sorted.map(s => s[1]),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }

    // Chart Gangguan 2: SLA Status Donut
    const ctxSla = document.getElementById('chartGangguanSla')?.getContext('2d');
    if (ctxSla) {
      destroyChart('gangguanSla');
      let selesai = 0, open = 0;
      records.forEach(r => {
        if (r.is_selesai === 1) selesai++;
        else open++;
      });
      charts.gangguanSla = new Chart(ctxSla, {
        type: 'doughnut',
        data: {
          labels: ['Selesai (Resolved)', 'Open / Dalam Penanganan'],
          datasets: [{
            data: [selesai, open],
            backgroundColor: ['#10b981', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.raw} Tiket (${((ctx.raw / records.length) * 100).toFixed(1)}%)`
              }
            }
          },
          cutout: '68%'
        }
      });
    }
  }

  // =========================================================================
  // VIEW 7: REKAP EFISIENSI (MODUL B)
  // =========================================================================
  async function loadEfisiensiData() {
    try {
      const res = await fetch('/api/rekap-efisiensi');
      if (!res.ok) throw new Error('Failed to load efisiensi');
      const rows = await res.json();
      state.efisiensi = rows || [];

      const tbody = document.getElementById('rekapEfisiensiTableBody');
      if (tbody) {
        let html = '';
        rows.forEach(r => {
          html += `
            <tr>
              <td><strong class="text-lg text-cyan-400 font-mono">${r.tahun}</strong></td>
              <td class="text-center font-bold">${r.total_disposisi}</td>
              <td class="text-center text-amber-400 font-bold">${r.ada_biaya}</td>
              <td class="text-center text-emerald-400 font-bold">${r.tidak_ada_biaya}</td>
              <td class="text-right font-mono">${formatRupiah(r.nilai_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(r.nilai_akhir)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(r.efisiensi_rupiah)}</td>
              <td class="text-center font-bold text-emerald-400 bg-emerald-500/10 rounded">${r.efisiensi_persen}%</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderEfisiensiCharts(rows);

    } catch (e) {
      console.error(e);
    }
  }

  function renderEfisiensiCharts(rows) {
    const { textColor, gridColor } = getChartTheme();
    if (!rows || rows.length === 0) return;

    // Chart Efisiensi 1: Awal vs Akhir
    const ctxComp = document.getElementById('chartEfisiensiCompare')?.getContext('2d');
    if (ctxComp) {
      destroyChart('efisiensiCompare');
      charts.efisiensiCompare = new Chart(ctxComp, {
        type: 'bar',
        data: {
          labels: rows.map(r => `Tahun ${r.tahun}`),
          datasets: [
            {
              label: 'Biaya Pengajuan Awal',
              data: rows.map(r => r.nilai_awal),
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 4
            },
            {
              label: 'Realisasi Biaya Akhir',
              data: rows.map(r => r.nilai_akhir),
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Nominal Penghematan',
              data: rows.map(r => r.efisiensi_rupiah),
              backgroundColor: 'rgba(6, 182, 212, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => 'Rp ' + (val/1e6).toFixed(0) + ' Jt' } }
          }
        }
      });
    }

    // Chart Efisiensi 2: Efficiency % Trend
    const ctxPct = document.getElementById('chartEfisiensiPct')?.getContext('2d');
    if (ctxPct) {
      destroyChart('efisiensiPct');
      charts.efisiensiPct = new Chart(ctxPct, {
        type: 'line',
        data: {
          labels: rows.map(r => `Tahun ${r.tahun}`),
          datasets: [{
            label: 'Efisiensi Negosiasi (%)',
            data: rows.map(r => r.efisiensi_persen),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 6,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor } },
            tooltip: {
              callbacks: {
                label: ctx => ` Efisiensi: ${ctx.raw}%`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => `${val}%` }, min: 0, max: 100 }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 8: PIC WORKLOAD MATRIX (MODUL B)
  // =========================================================================
  async function loadPicMatrixData() {
    try {
      const res = await fetch('/api/pic-performance');
      if (!res.ok) throw new Error('Failed to load pic performance');
      const rows = await res.json();
      state.picMatrix = rows || [];

      const tbody = document.getElementById('picMatrixTableBody');
      if (tbody) {
        let html = '';
        rows.forEach(p => {
          html += `
            <tr>
              <td><strong>${escapeHtml(p.pic)}</strong></td>
              <td class="text-center font-bold">${p.total_penugasan}</td>
              <td class="text-center font-bold text-emerald-400">${p.finish}</td>
              <td class="text-center text-amber-400">${p.ongoing + p.hold}</td>
              <td class="text-center text-rose-400">${p.cancel}</td>
              <td class="text-center font-mono font-bold text-emerald-400">${p.finish_rate}%</td>
              <td class="text-right font-mono">${formatRupiah(p.biaya_awal)}</td>
              <td class="text-right font-mono font-bold text-amber-400">${formatRupiah(p.biaya_final)}</td>
              <td class="text-right font-mono font-bold text-emerald-400">${formatRupiah(p.efisiensi_rupiah)}</td>
              <td class="text-center font-mono">${p.avg_sla_hari} Hari</td>
              <td class="text-center font-bold text-cyan-400">${p.gangguan_count}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }

      renderPicMatrixCharts(rows);

    } catch (e) {
      console.error(e);
    }
  }

  function renderPicMatrixCharts(rows) {
    const { textColor, gridColor } = getChartTheme();
    if (!rows || rows.length === 0) return;

    // Chart PIC 1: Stacked Bar Workload
    const ctxWork = document.getElementById('chartPicWorkload')?.getContext('2d');
    if (ctxWork) {
      destroyChart('picWorkload');
      charts.picWorkload = new Chart(ctxWork, {
        type: 'bar',
        data: {
          labels: rows.map(p => p.pic),
          datasets: [
            {
              label: 'Penugasan Perizinan (PA)',
              data: rows.map(p => p.total_penugasan),
              backgroundColor: 'rgba(6, 182, 212, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Tiket Gangguan Lapangan',
              data: rows.map(p => p.gangguan_count),
              backgroundColor: 'rgba(245, 158, 11, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} Tugas`
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }

    // Chart PIC 2: Finish Rate (%)
    const ctxRate = document.getElementById('chartPicFinishRate')?.getContext('2d');
    if (ctxRate) {
      destroyChart('picFinishRate');
      charts.picFinishRate = new Chart(ctxRate, {
        type: 'bar',
        data: {
          labels: rows.map(p => p.pic),
          datasets: [{
            label: 'Finish Rate (%)',
            data: rows.map(p => p.finish_rate),
            backgroundColor: rows.map(p => p.finish_rate >= 80 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.85)'),
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` Finish Rate: ${ctx.raw}%`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, callback: val => `${val}%` }, min: 0, max: 100 },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
          }
        }
      });
    }
  }

  // =========================================================================
  // VIEW 9: PETA SEBARAN (WEBGIS LEAFLET)
  // =========================================================================
  function setMapBaseLayer(layerKey) {
    if (!leafletMap || !mapBaseLayers[layerKey]) return;

    // Remove other base layers
    Object.keys(mapBaseLayers).forEach(k => {
      if (leafletMap.hasLayer(mapBaseLayers[k])) {
        leafletMap.removeLayer(mapBaseLayers[k]);
      }
    });

    // Add selected layer
    mapBaseLayers[layerKey].addTo(leafletMap);
    currentBaseLayer = layerKey;

    // Update active class on buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-layer') === layerKey);
    });

    // Trigger invalidateSize to ensure new tiles render seamlessly
    leafletMap.invalidateSize();
  }

  async function initWebgisMap() {
    const mapEl = document.getElementById('portalLeafletMap');
    if (!mapEl) return;

    if (!leafletMap) {
      leafletMap = L.map('portalLeafletMap', {
        center: [-6.2200, 106.8400],
        zoom: 11,
        zoomControl: true,
        preferCanvas: true
      });

      // Prepare multiple robust base map providers
      mapBaseLayers = {
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }),
        esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS',
          maxZoom: 18
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO &copy; OpenStreetMap',
          maxZoom: 19
        })
      };

      // Default to crisp OpenStreetMap (Peta Standar) for maximum visibility
      mapBaseLayers['osm'].addTo(leafletMap);
      currentBaseLayer = 'osm';

      mapMarkersLayer = L.layerGroup().addTo(leafletMap);

      // Auto-detect container size changes using ResizeObserver
      if (window.ResizeObserver && !mapResizeObserver) {
        mapResizeObserver = new ResizeObserver(() => {
          if (leafletMap) leafletMap.invalidateSize();
        });
        mapResizeObserver.observe(mapEl);
      }

      window.addEventListener('resize', () => {
        if (leafletMap && state.activeView === 'view-webgis') {
          leafletMap.invalidateSize();
        }
      });
    }

    // Force multiple invalidateSize steps to guarantee no blank/gray tiles
    leafletMap.invalidateSize();
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 350);

    await updateMapMarkers();
  }

  async function updateMapMarkers(filterStatus = 'ALL') {
    if (!leafletMap || !mapMarkersLayer) return;
    mapMarkersLayer.clearLayers();

    try {
      const res = await fetch(`/api/map-coordinates?status=${filterStatus}`);
      if (!res.ok) throw new Error('Failed to load map coords');
      const pins = await res.json();

      // Update counter pill
      const countEl = document.getElementById('mapPinCount');
      if (countEl) countEl.textContent = pins.length;

      const colors = {
        Finish: '#10b981',
        Ongoing: '#f59e0b',
        Hold: '#eab308',
        Cancel: '#ef4444'
      };

      const bounds = [];
      const coordCounts = {};

      pins.forEach(p => {
        if (!p.latitude || !p.longitude) return;

        // Micro-jitter to spread duplicate coordinates so all 451 points are visible
        const coordKey = `${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`;
        const count = coordCounts[coordKey] || 0;
        coordCounts[coordKey] = count + 1;

        let lat = Number(p.latitude);
        let lng = Number(p.longitude);
        if (count > 0) {
          const angle = count * 0.785398; // 45 deg step
          const ring = Math.floor((count - 1) / 8) + 1;
          const offset = 0.0016 * ring; // ~180m dispersion
          lat += offset * Math.sin(angle);
          lng += (offset * 1.3) * Math.cos(angle);
        }

        const markerColor = colors[p.progress] || '#06b6d4';
        const marker = L.circleMarker([lat, lng], {
          radius: 7,
          fillColor: markerColor,
          color: '#ffffff',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: 0.85
        });

        marker.bindPopup(`
          <div class="p-2 space-y-1 font-sans">
            <div class="flex justify-between items-center text-xs border-b border-white/10 pb-1 gap-2">
              <strong class="font-mono text-cyan-400 font-bold">${escapeHtml(p.no_pa || 'PA')}</strong>
              ${getStatusBadge(p.progress)}
            </div>
            <div class="font-bold text-sm text-slate-100 mt-1">${escapeHtml(p.pelanggan || 'Pelanggan')}</div>
            <div class="text-xs text-slate-400"><i class="fa-solid fa-location-dot text-rose-400"></i> ${escapeHtml(p.terminating || '-')}</div>
            <div class="text-xs text-slate-300">PIC: <strong>${escapeHtml(p.pic_perijinan || '-')}</strong></div>
            <div class="flex justify-between text-xs pt-1 border-t border-white/10 mt-1">
              <span>Biaya Final:</span>
              <strong class="text-amber-400 font-mono">${formatRupiah(p.biaya_final)}</strong>
            </div>
          </div>
        `);

        mapMarkersLayer.addLayer(marker);
        bounds.push([lat, lng]);
      });

      if (bounds.length > 0) {
        lastMapBounds = L.latLngBounds(bounds);
        leafletMap.fitBounds(lastMapBounds, { padding: [40, 40], maxZoom: 13 });
      }

      // Re-trigger invalidateSize after points render
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 200);
    } catch (e) {
      console.error('Error updating map markers:', e);
    }
  }

  // =========================================================================
  // INTERACTIVE CRUD MODALS (PATCH & POST)
  // =========================================================================

  function openQuickEditModal(type, id) {
    const overlay = document.getElementById('modalQuickEdit');
    const container = document.getElementById('quickEditDynamicFields');
    const title = document.getElementById('quickEditModalTitle');
    const sub = document.getElementById('quickEditModalSub');

    document.getElementById('quickEditTargetType').value = type;
    document.getElementById('quickEditTargetId').value = id;

    if (type === 'collo') {
      title.textContent = `Update Sirkuit Colocation #${id}`;
      sub.textContent = 'Perbarui status sirkuit, nomor SPP, atau catatan admin';
      container.innerHTML = `
        <div>
          <label class="form-label">Status Sirkuit *</label>
          <select name="status" class="filter-select w-full text-xs">
            <option value="ACTIVE">ACTIVE</option>
            <option value="NON ACTIVE">NON ACTIVE</option>
            <option value="DEACTIVASI">DEACTIVASI</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Nomor SPP</label>
            <input type="text" name="spp" class="filter-input w-full text-xs" placeholder="Nomor SPP">
          </div>
          <div>
            <label class="form-label">Nomor PO Baru</label>
            <input type="text" name="po_baru" class="filter-input w-full text-xs" placeholder="Nomor PO">
          </div>
        </div>
        <div>
          <label class="form-label">Status Proses Admin</label>
          <input type="text" name="proses_admin" class="filter-input w-full text-xs" placeholder="Contoh: Proses SPP / Running">
        </div>
        <div>
          <label class="form-label">Catatan Keterangan</label>
          <textarea name="keterangan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan..."></textarea>
        </div>
      `;
    } else if (type === 'sitac') {
      title.textContent = `Update Penugasan SITAC #${id}`;
      sub.textContent = 'Perbarui progress pengerjaan lapangan dan realisasi biaya final';
      container.innerHTML = `
        <div>
          <label class="form-label">Progress Pengerjaan *</label>
          <select name="progress" class="filter-select w-full text-xs">
            <option value="Finish">Finish</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Hold">Hold</option>
            <option value="Cancel">Cancel</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Realisasi Biaya Final (Rp)</label>
            <input type="number" name="biaya_final" class="filter-input w-full text-xs" placeholder="0">
          </div>
          <div>
            <label class="form-label">Tanggal Close / Selesai</label>
            <input type="date" name="date_close" class="filter-input w-full text-xs">
          </div>
        </div>
        <div>
          <label class="form-label">Update Pengerjaan Lapangan</label>
          <textarea name="update_pekerjaan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan progress fisik..."></textarea>
        </div>
      `;
    } else if (type === 'gangguan') {
      title.textContent = `Update Tiket Gangguan #${id}`;
      sub.textContent = 'Update status penyelesaian insiden dan catatan penanganan';
      container.innerHTML = `
        <div>
          <label class="form-label">Status Penyelesaian *</label>
          <select name="is_selesai" class="filter-select w-full text-xs">
            <option value="1">Selesai (Close Incident)</option>
            <option value="0">Proses / Open (Sedang Dikerjakan)</option>
          </select>
        </div>
        <div>
          <label class="form-label">Tanggal Selesai</label>
          <input type="date" name="tgl_selesai" class="filter-input w-full text-xs">
        </div>
        <div>
          <label class="form-label">Catatan Update Penanganan</label>
          <textarea name="update_gangguan" rows="2" class="filter-input w-full text-xs" placeholder="Catatan lapangan..."></textarea>
        </div>
      `;
    }

    overlay.style.display = 'flex';
  }

  async function handleQuickEditSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('quickEditTargetType').value;
    const id = document.getElementById('quickEditTargetId').value;
    const form = document.getElementById('formQuickEdit');
    const formData = new FormData(form);

    const payload = {};
    formData.forEach((val, key) => {
      if (val !== '') payload[key] = val;
    });

    try {
      const res = await fetch(`/api/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Perubahan berhasil disimpan ke database!');
        document.getElementById('modalQuickEdit').style.display = 'none';

        // Refresh active table
        if (state.activeView === 'view-collo-list') loadColloData();
        else if (state.activeView === 'view-collo-alerts') loadAlertsData();
        else if (state.activeView === 'view-collo-rev-sharing') loadRevSharingData();
        else if (state.activeView === 'view-sitac-pa') loadSitacData();
        else if (state.activeView === 'view-gangguan') loadGangguanData();
        else if (state.activeView === 'view-executive') loadExecutiveSummary();
      } else {
        alert(data.message || 'Gagal menyimpan perubahan');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan saat menyimpan.');
    }
  }

  async function handleAddFormSubmit(e, endpoint) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
    }

    const formData = new FormData(form);
    const payload = {};
    formData.forEach((val, key) => {
      payload[key] = typeof val === 'string' ? val.trim() : val;
    });

    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Data baru berhasil ditambahkan!');
        ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType'].forEach(id => {
          const m = document.getElementById(id);
          if (m) m.style.display = 'none';
        });

        // Refresh global state & meta
        await loadMetaOptions();
        await loadExecutiveSummary();

        // Refresh view data
        if (endpoint === 'gangguan') {
          await loadGangguanData();
          if (state.activeView !== 'view-gangguan') switchView('view-gangguan');
        } else if (endpoint === 'sitac') {
          await loadSitacData();
          if (state.activeView !== 'view-sitac-pa') switchView('view-sitac-pa');
        } else if (endpoint === 'collo') {
          await loadColloData();
          if (state.activeView !== 'view-collo-list') switchView('view-collo-list');
        }
      } else {
        alert(data.message || 'Gagal menambahkan data');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan atau server saat menyimpan data.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  function openDetailModal(type, id) {
    const overlay = document.getElementById('modalDetail');
    const content = document.getElementById('detailContent');
    const title = document.getElementById('detailTitle');
    const sub = document.getElementById('detailSubtitle');

    if (type === 'collo') {
      const rec = state.collo.data.find(c => c.id == id);
      if (!rec) return;

      title.textContent = `${rec.pengelola} - ${rec.pelanggan}`;
      sub.textContent = `SID: ${rec.sid || '-'} | NO SO: ${rec.no_so || '-'}`;
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Status</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.status)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Layanan</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.layanan || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Revenue Tahunan</span><span class="font-bold text-emerald-400 font-mono">${formatRupiah(rec.rev_sewa_tahun)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Biaya Mitra</span><span class="font-bold text-amber-400 font-mono">${formatRupiah(rec.biaya_sewa_tahun)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Margin</span><span class="font-bold text-cyan-400 font-mono">${formatRupiah(rec.margin_rupiah)} (${rec.margin_persen}%)</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Rev Sharing</span><span class="font-bold text-amber-400 font-mono">${escapeHtml(rec.rev_sharing_raw || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Masa Berlaku</span><span class="font-mono text-slate-200">${rec.start_date || '-'} s/d ${rec.end_date || '-'} (Sisa ${rec.sisa_hari} Hari)</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Originating / Terminating</span><span class="text-slate-200">${escapeHtml(rec.originating || '-')} &rarr; ${escapeHtml(rec.terminating || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Admin & Kontak</span><span class="text-slate-200">PIC Admin: ${escapeHtml(rec.pic_admin || '-')} | Rekanan: ${escapeHtml(rec.pic_rekanan || '-')} (${escapeHtml(rec.telp || '-')})</span></div>
        </div>
      `;
    } else if (type === 'sitac') {
      const rec = state.sitac.data.find(s => s.id == id);
      if (!rec) return;

      title.textContent = `Penugasan PA: ${rec.no_pa || '-'}`;
      sub.textContent = `${rec.pelanggan || '-'}`;
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Status</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.progress)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">PIC SITAC</span><span class="font-bold text-sm text-slate-100">${escapeHtml(rec.pic_perijinan || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Biaya Pengajuan</span><span class="font-bold text-slate-300 font-mono">${formatRupiah(rec.biaya_permintaan_awal)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5"><span class="text-slate-500 uppercase block">Realisasi Final</span><span class="font-bold text-amber-400 font-mono">${formatRupiah(rec.biaya_final)}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Penghematan Negosiasi</span><span class="font-bold text-emerald-400 font-mono text-sm">${formatRupiah(rec.efisiensi_rupiah)} (${rec.efisiensi_persen}%)</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Terminating</span><span class="text-slate-200">${escapeHtml(rec.terminating || '-')}</span></div>
          <div class="p-2.5 bg-slate-900 rounded border border-white/5 col-span-2"><span class="text-slate-500 uppercase block">Catatan Update Lapangan</span><span class="text-slate-200">${escapeHtml(rec.update_pekerjaan || 'Tidak ada catatan')}</span></div>
        </div>
      `;
    }

    overlay.style.display = 'flex';
  }

  // =========================================================================
  // EXPORT ENGINE (ROBUST CSV GENERATOR WITH UTF-8 BOM & PROPER ESCAPING)
  // =========================================================================
  function downloadCsvFile(filename, headers, rows) {
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      const sanitized = r.map(val => {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvRows.push(sanitized.join(','));
    });
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`File ${filename} berhasil diunduh!`);
  }

  async function exportPicMatrixCsv() {
    let records = state.picMatrix;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/pic-performance');
        if (res.ok) {
          records = await res.json();
          state.picMatrix = records;
        }
      } catch (e) {
        console.error('Failed to fetch pic performance for export', e);
      }
    }
    if (!records || records.length === 0) {
      return alert('Tidak ada data Beban Kerja PIC untuk diekspor!');
    }

    const filename = `rekap_beban_kerja_pic_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Nama PIC SITAC',
      'Total Penugasan (PA)',
      'Selesai (Finish)',
      'Sedang Berjalan (Ongoing/Hold)',
      'Dibatalkan (Cancel)',
      'Tingkat Penyelesaian (%)',
      'Biaya Pengajuan Awal (Rp)',
      'Realisasi Biaya Akhir (Rp)',
      'Total Penghematan / Efisiensi (Rp)',
      'Persentase Efisiensi (%)',
      'Rata-rata SLA (Hari)',
      'Tiket Gangguan Ditangani'
    ];

    const rows = records.map(p => [
      p.pic || '-',
      p.total_penugasan || 0,
      p.finish || 0,
      (p.ongoing || 0) + (p.hold || 0),
      p.cancel || 0,
      `${p.finish_rate || 0}%`,
      p.biaya_awal || 0,
      p.biaya_final || 0,
      p.efisiensi_rupiah || 0,
      `${p.efisiensi_persen || 0}%`,
      p.avg_sla_hari || 0,
      p.gangguan_count || 0
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  async function exportEfisiensiCsv() {
    let records = state.efisiensi;
    if (!records || records.length === 0) {
      try {
        const res = await fetch('/api/rekap-efisiensi');
        if (res.ok) {
          records = await res.json();
          state.efisiensi = records;
        }
      } catch (e) {
        console.error('Failed to fetch efisiensi for export', e);
      }
    }
    if (!records || records.length === 0) {
      return alert('Tidak ada data Efisiensi untuk diekspor!');
    }

    const filename = `rekap_efisiensi_biaya_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Tahun Anggaran',
      'Total Disposisi PA',
      'Pekerjaan Berbiaya',
      'Tanpa Biaya (Zero Cost)',
      'Biaya Pengajuan Awal (Rp)',
      'Realisasi Biaya Akhir (Rp)',
      'Nominal Penghematan (Rp)',
      'Persentase Efisiensi (%)'
    ];

    const rows = records.map(r => [
      r.tahun || '-',
      r.total_disposisi || 0,
      r.ada_biaya || 0,
      r.tidak_ada_biaya || 0,
      r.nilai_awal || 0,
      r.nilai_akhir || 0,
      r.efisiensi_rupiah || 0,
      `${r.efisiensi_persen || 0}%`
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  function exportCurrentView() {
    const view = state.activeView;

    if (view === 'view-pic-matrix') {
      return exportPicMatrixCsv();
    }
    if (view === 'view-efisiensi') {
      return exportEfisiensiCsv();
    }

    let filename = `telecom_${view}_${new Date().toISOString().slice(0, 10)}.csv`;
    let headers = [];
    let rows = [];

    if (view === 'view-collo-list' || view === 'view-collo-alerts' || view === 'view-collo-rev-sharing') {
      const records = view === 'view-collo-list' ? state.collo.data : (view === 'view-collo-rev-sharing' ? state.revSharing.data : state.alerts.data);
      if (!records || records.length === 0) return alert('Tidak ada data colocation untuk diekspor!');

      headers = ['ID', 'Pengelola', 'Pelanggan', 'No SO', 'SID', 'Jenis Sewa', 'Revenue Tahunan', 'Biaya Mitra', 'Margin Rp', 'Margin %', 'Rev Sharing', 'Status', 'Sisa Hari', 'SPP'];
      rows = records.map(c => [
        c.id, c.pengelola || '', c.pelanggan || '',
        c.no_so || '', c.sid || '', c.jenis_sewa || '',
        c.rev_sewa_tahun || 0, c.biaya_sewa_tahun || 0, c.margin_rupiah || 0, c.margin_persen || 0,
        c.rev_sharing_raw || '', c.status || '', c.sisa_hari || 0, c.spp || c.po_baru || ''
      ]);
    } else if (view === 'view-sitac-pa') {
      const records = state.sitac.data;
      if (!records || records.length === 0) return alert('Tidak ada data SITAC untuk diekspor!');

      headers = ['ID', 'No PA', 'Pelanggan', 'PIC SITAC', 'PTL', 'Terminating', 'Biaya Awal', 'Biaya Final', 'Penghematan', 'Status', 'Durasi SLA'];
      rows = records.map(s => [
        s.id, s.no_pa || '', s.pelanggan || '', s.pic_perijinan || '',
        s.ptl || '', s.terminating || '',
        s.biaya_permintaan_awal || 0, s.biaya_final || 0, s.efisiensi_rupiah || 0, s.progress || '', s.durasi_hari || ''
      ]);
    } else if (view === 'view-gangguan') {
      const records = state.gangguan.data;
      if (!records || records.length === 0) return alert('Tidak ada data gangguan untuk diekspor!');

      headers = ['ID', 'No Tiket', 'Tgl Dispos', 'Tgl Selesai', 'Lokasi', 'Jenis Gangguan', 'PIC', 'Biaya', 'Status'];
      rows = records.map(g => [
        g.id, g.no_tiket || '', g.tgl_dispos || '', g.tgl_selesai || '',
        g.terminating || '', g.jenis_gangguan || '',
        g.pic_perijinan || '', g.biaya_gangguan || 0, g.is_selesai ? 'Selesai' : 'Proses'
      ]);
    } else if (view === 'view-executive') {
      const ex = state.execData;
      if (!ex) return alert('Data executive belum dimuat!');
      filename = `rekap_executive_summary_${new Date().toISOString().slice(0, 10)}.csv`;
      headers = ['Kategori Indikator', 'Nilai Metrik', 'Keterangan'];
      const c = ex.collo || {};
      const s = ex.sitac || {};
      const g = ex.gangguan || {};
      rows = [
        ['Sirkuit Colocation Aktif', c.active_count || 0, 'Total sirkuit berstatus ACTIVE'],
        ['Total Revenue Sewa Tahunan', c.active_revenue || 0, 'Revenue aktif dalam Rupiah'],
        ['Total Biaya Mitra Tahunan', c.active_biaya || 0, 'Beban sewa ke mitra datacenter'],
        ['Gross Margin Finansial', c.active_margin || 0, `Persentase margin: ${c.margin_pct || 0}%`],
        ['Total Project Assignment (PA)', s.total_pa || 0, 'Semua penugasan perizinan FO'],
        ['PA Selesai (Finish)', s.finish_count || 0, `Finish rate: ${s.finish_count && s.total_pa ? (s.finish_count/s.total_pa*100).toFixed(1) : 0}%`],
        ['Total Penghematan Negosiasi', s.total_efisiensi_rupiah || 0, `Efisiensi biaya: ${s.efisiensi_pct || 0}%`],
        ['Total Tiket Gangguan Darurat', g.total_gangguan || 0, 'Total insiden dilaporkan'],
        ['Gangguan Dituntaskan', g.selesai_count || 0, `Resolution rate: ${g.resolution_rate || 0}%`]
      ];
    } else {
      return alert('Buka tabel spesifik untuk mengekspor data.');
    }

    downloadCsvFile(filename, headers, rows);
  }

  // =========================================================================
  // EVENT LISTENERS BINDING
  // =========================================================================
  function setupEventListeners() {
    // 0. Auth & Login Handlers
    document.getElementById('formLogin')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsername')?.value.trim();
      const p = document.getElementById('loginPassword')?.value;
      if (u && p) performLogin(u, p);
    });

    document.getElementById('btnQuickLoginLapangan')?.addEventListener('click', () => {
      performLogin('lapangan', 'lapangan123');
    });

    document.getElementById('btnQuickLoginAdmin')?.addEventListener('click', () => {
      performLogin('admin', 'admin123');
    });

    document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
      const pwInput = document.getElementById('loginPassword');
      const eyeIcon = document.getElementById('passwordEyeIcon');
      if (pwInput) {
        const isPass = pwInput.type === 'password';
        pwInput.type = isPass ? 'text' : 'password';
        if (eyeIcon) {
          eyeIcon.className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      }
    });

    document.getElementById('btnLogout')?.addEventListener('click', () => {
      performLogout();
    });

    // 1. Sidebar Nav Click
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        switchView(viewId);
      });
    });

    // 1b. Sidebar Submenu Dropdown Accordion Toggle
    document.querySelectorAll('.section-dropdown-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const group = btn.closest('.nav-section-group');
        if (group) {
          group.classList.toggle('collapsed');
        }
      });
    });

    // 1c. Mobile Sidebar Toggle Button
    document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
      document.getElementById('portalSidebar')?.classList.toggle('mobile-open');
    });

    // 2. Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('portal_theme', state.theme);
      initTheme();
      if (state.activeView === 'view-executive') loadExecutiveSummary();
      if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
        initWebgisMap();
      }
    });

    // 3. Quick Export Button & Module Header Export Buttons
    document.getElementById('btnQuickExport')?.addEventListener('click', exportCurrentView);
    document.getElementById('btnExportPicMatrix')?.addEventListener('click', exportPicMatrixCsv);
    document.getElementById('btnExportEfisiensi')?.addEventListener('click', exportEfisiensiCsv);

    // 4. View 2 (Collo) Controls
    document.querySelectorAll('.collo-status-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.collo-status-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.collo.status = btn.getAttribute('data-status');
        state.collo.page = 1;
        loadColloData();
      });
    });

    const colloSearch = document.getElementById('colloSearchInput');
    let colloSearchTimer = null;
    colloSearch?.addEventListener('input', (e) => {
      clearTimeout(colloSearchTimer);
      colloSearchTimer = setTimeout(() => {
        state.collo.search = e.target.value;
        state.collo.page = 1;
        loadColloData();
      }, 300);
    });

    document.getElementById('colloFilterJenis')?.addEventListener('change', (e) => {
      state.collo.jenisSewa = e.target.value;
      state.collo.page = 1;
      loadColloData();
    });

    document.getElementById('colloFilterPengelola')?.addEventListener('change', (e) => {
      state.collo.pengelola = e.target.value;
      state.collo.page = 1;
      loadColloData();
    });

    document.getElementById('colloSortSelect')?.addEventListener('change', (e) => {
      state.collo.sort = e.target.value;
      loadColloData();
    });

    document.getElementById('colloPrevPageBtn')?.addEventListener('click', () => {
      if (state.collo.page > 1) {
        state.collo.page--;
        loadColloData();
      }
    });
    document.getElementById('colloNextPageBtn')?.addEventListener('click', () => {
      state.collo.page++;
      loadColloData();
    });

    // 5. View 3 (Rev Sharing) Controls
    const rsSearch = document.getElementById('revShareSearchInput');
    let rsTimer = null;
    rsSearch?.addEventListener('input', (e) => {
      clearTimeout(rsTimer);
      rsTimer = setTimeout(() => {
        state.revSharing.search = e.target.value;
        loadRevSharingData();
      }, 300);
    });

    // 6. View 4 (Alerts) Controls
    document.querySelectorAll('.alert-filter-card').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-filter-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.alerts.category = btn.getAttribute('data-alert-cat');
        loadAlertsData();
      });
    });

    const alertSearch = document.getElementById('alertSearchInput');
    let alertTimer = null;
    alertSearch?.addEventListener('input', (e) => {
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        state.alerts.search = e.target.value;
        loadAlertsData();
      }, 300);
    });

    // 7. View 5 (SITAC) Controls
    document.querySelectorAll('.sitac-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sitac-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.sitac.status = btn.getAttribute('data-status');
        state.sitac.page = 1;
        loadSitacData();
      });
    });

    const sitacSearch = document.getElementById('sitacSearchInput');
    let sitacTimer = null;
    sitacSearch?.addEventListener('input', (e) => {
      clearTimeout(sitacTimer);
      sitacTimer = setTimeout(() => {
        state.sitac.search = e.target.value;
        state.sitac.page = 1;
        loadSitacData();
      }, 300);
    });

    document.getElementById('sitacFilterPic')?.addEventListener('change', (e) => {
      state.sitac.pic = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacFilterAging')?.addEventListener('change', (e) => {
      state.sitac.aging = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacFilterYear')?.addEventListener('change', (e) => {
      state.sitac.year = e.target.value;
      state.sitac.page = 1;
      loadSitacData();
    });
    document.getElementById('sitacPrevPageBtn')?.addEventListener('click', () => {
      if (state.sitac.page > 1) {
        state.sitac.page--;
        loadSitacData();
      }
    });
    document.getElementById('sitacNextPageBtn')?.addEventListener('click', () => {
      state.sitac.page++;
      loadSitacData();
    });

    // 8. View 6 (Gangguan) Controls
    document.querySelectorAll('.gangguan-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gangguan-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.gangguan.status = btn.getAttribute('data-status');
        loadGangguanData();
      });
    });

    const gSearch = document.getElementById('gangguanSearchInput');
    let gTimer = null;
    gSearch?.addEventListener('input', (e) => {
      clearTimeout(gTimer);
      gTimer = setTimeout(() => {
        state.gangguan.search = e.target.value;
        loadGangguanData();
      }, 300);
    });

    // 9. View 9 (WebGIS) Controls
    document.querySelectorAll('.map-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-tag-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const st = btn.getAttribute('data-status');
        updateMapMarkers(st);
      });
    });

    // Base Layer switcher buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layerKey = btn.getAttribute('data-layer');
        setMapBaseLayer(layerKey);
      });
    });

    // Fit Bounds button (zoom into all pins)
    document.getElementById('btnFitMapBounds')?.addEventListener('click', () => {
      if (leafletMap && lastMapBounds) {
        leafletMap.fitBounds(lastMapBounds, { padding: [40, 40], maxZoom: 13 });
      }
    });

    document.getElementById('btnResetWebgisView')?.addEventListener('click', () => {
      if (leafletMap) leafletMap.setView([-6.2200, 106.8400], 11);
    });

    // 10. Table Action Buttons Delegation (Quick Edit & Detail)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-quick-edit');
      if (editBtn) {
        const type = editBtn.getAttribute('data-type');
        const id = editBtn.getAttribute('data-id');
        openQuickEditModal(type, id);
      }

      const detailBtn = e.target.closest('.btn-view-detail');
      if (detailBtn) {
        const type = detailBtn.getAttribute('data-type');
        const id = detailBtn.getAttribute('data-id');
        openDetailModal(type, id);
      }
    });

    // Helper function to open modal with auto-fill date
    function openModalWithDate(modalId, dateInputId) {
      const today = new Date().toISOString().slice(0, 10);
      if (dateInputId) {
        const d = document.getElementById(dateInputId);
        if (d && !d.value) d.value = today;
      }
      const m = document.getElementById(modalId);
      if (m) m.style.display = 'flex';
    }

    // 11. Separated Add Data Modals (Gangguan, SITAC, Collo, and Smart Picker)
    // 11a. Direct button on Tiket Gangguan page
    document.getElementById('btnOpenAddGangguanDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
    });

    // 11b. Direct button on SITAC PA page
    document.getElementById('btnOpenAddSitacDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddSitac', 'addSitacDateDispos');
    });

    // 11c. Direct button on Colocation page
    document.getElementById('btnOpenAddColloDirect')?.addEventListener('click', () => {
      openModalWithDate('modalAddCollo');
    });

    // 11d. Topbar "+ Tambah Data" Smart Button
    document.getElementById('btnOpenAddModal')?.addEventListener('click', () => {
      // If currently looking at a specific view, open that form directly!
      if (state.activeView === 'view-gangguan') {
        openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
      } else if (state.activeView === 'view-sitac-pa') {
        openModalWithDate('modalAddSitac', 'addSitacDateDispos');
      } else if (state.activeView === 'view-collo-list' && state.currentUser?.role !== 'lapangan') {
        openModalWithDate('modalAddCollo');
      } else {
        // Open clean picker dialog so user can choose what to add without confusion
        const pickModal = document.getElementById('modalPickAddType');
        if (pickModal) pickModal.style.display = 'flex';
      }
    });

    // 11e. Picker Dialog Options
    document.getElementById('btnPickGangguan')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddGangguan', 'addGangguanDateDispos');
    });

    document.getElementById('btnPickSitac')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddSitac', 'addSitacDateDispos');
    });

    document.getElementById('btnPickCollo')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
      openModalWithDate('modalAddCollo');
    });

    // 11f. Close buttons for each modal
    document.getElementById('btnClosePickAdd')?.addEventListener('click', () => {
      document.getElementById('modalPickAddType').style.display = 'none';
    });
    document.getElementById('btnCloseAddGangguan')?.addEventListener('click', () => {
      document.getElementById('modalAddGangguan').style.display = 'none';
    });
    document.getElementById('btnCloseAddSitac')?.addEventListener('click', () => {
      document.getElementById('modalAddSitac').style.display = 'none';
    });
    document.getElementById('btnCloseAddCollo')?.addEventListener('click', () => {
      document.getElementById('modalAddCollo').style.display = 'none';
    });

    // Close modals on overlay backdrop click
    ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType', 'modalQuickEdit', 'modalDetail'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        if (e.target.id === id) {
          e.target.style.display = 'none';
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ['modalAddGangguan', 'modalAddSitac', 'modalAddCollo', 'modalPickAddType', 'modalQuickEdit', 'modalDetail', 'loginOverlay'].forEach(id => {
          if (id === 'loginOverlay' && !state.currentUser) return;
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
      }
    });

    // 12. Modal Quick Edit Close & Submit
    document.getElementById('btnCloseQuickEdit')?.addEventListener('click', () => {
      document.getElementById('modalQuickEdit').style.display = 'none';
    });
    document.getElementById('btnCancelQuickEdit')?.addEventListener('click', () => {
      document.getElementById('modalQuickEdit').style.display = 'none';
    });
    document.getElementById('formQuickEdit')?.addEventListener('submit', handleQuickEditSubmit);

    // 13. Modal Detail Close
    document.getElementById('btnCloseDetail')?.addEventListener('click', () => {
      document.getElementById('modalDetail').style.display = 'none';
    });

    // 14. Add Forms Submissions
    document.getElementById('formAddGangguan')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'gangguan'));
    document.getElementById('formAddSitac')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'sitac'));
    document.getElementById('formAddCollo')?.addEventListener('submit', (e) => handleAddFormSubmit(e, 'collo'));
  }

  // Launch on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
