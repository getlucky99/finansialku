/* ============================================
   FinansialKu – app.js  FINAL FIXED
   Versi Beta 0526.1 | Sang Petualang Corp
   ============================================ */
'use strict';

// ─── STATE ────────────────────────────────────
let currentUser    = null;
let idleTimer      = null;
let cdTimer        = null;
let cdVal          = 10;
let chartTrend     = null;
let chartKat       = null;
let chartLapKat    = null;
let confirmCB      = null;
let selectedFile   = null;   // file nota yang dipilih

// ─── KONSTANTA ────────────────────────────────
const DEF_USERS = [
  { username:'admin', fullname:'Administrator', password:'admin123', role:'admin' },
  { username:'user',  fullname:'User Biasa',    password:'user123',  role:'user'  }
];
const DEF_KAT_MASUK = ['Gaji','Side Job','Hibah / Pemberian','Bonus','Lain-lain'];
const DEF_KAT_KELUAR = [
  'Makan Keluarga','Makan Sendiri','Jajan Keluarga','Jajan Sendiri',
  'Transport','Pulsa - Paket Data Suami','Pulsa - Paket Data Istri',
  'Rekreasi','Listrik','Kebutuhan Rumah Tangga','Donasi','Lain-lain'
];
const CHART_COLORS = [
  '#2D6A4F','#40916C','#74C69D','#1A6FA8','#D4860B','#C0392B',
  '#6D4FA0','#16A085','#E67E22','#2980B9','#8E44AD','#27AE60',
  '#E74C3C','#F39C12','#1ABC9C'
];

// ─── STORAGE ──────────────────────────────────
function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; }
  catch { return d; }
}
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ─── DOM HELPERS ──────────────────────────────
const el  = id => document.getElementById(id);
const esc = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function txt(id, v) { const e = el(id); if (e) e.textContent = v; }
function show(id)   { const e = el(id); if (e) e.classList.remove('hidden'); }
function hide(id)   { const e = el(id); if (e) e.classList.add('hidden'); }
function pad2(n)    { return String(n).padStart(2,'0'); }

// ─── INIT ─────────────────────────────────────
function init() {
  // Seed data default jika belum ada
  if (!lsGet('fk_users',null))       lsSet('fk_users', DEF_USERS);
  if (!lsGet('fk_kat_masuk',null))   lsSet('fk_kat_masuk', DEF_KAT_MASUK);
  if (!lsGet('fk_kat_keluar',null))  lsSet('fk_kat_keluar', DEF_KAT_KELUAR);
  if (!lsGet('fk_pemasukan',null))   seedSampleData();
  if (!lsGet('fk_pengeluaran',null)) lsSet('fk_pengeluaran', []);

  // Enter key di login
  el('login-pass').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  el('login-user').addEventListener('keydown', e => { if (e.key==='Enter') el('login-pass').focus(); });

  // Tutup modal saat klik overlay
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
    if (!e.target.closest('.form-group') &&
        !e.target.classList.contains('cal-day') &&
        !e.target.classList.contains('cal-nav') &&
        !e.target.closest('.cal-wrap')) {
      document.querySelectorAll('.cal-wrap:not(.hidden)').forEach(w => w.classList.add('hidden'));
    }
  });

  updateTopbarDate();
  setInterval(updateTopbarDate, 30000);
}

function updateTopbarDate() {
  const e = el('topbar-date');
  if (e) e.textContent = new Date().toLocaleDateString('id-ID',
    { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

// ─── LOGIN ────────────────────────────────────
async function doLogin() {
  const u = el('login-user').value.trim();
  const p = el('login-pass').value;
  if (!u || !p) { show('login-error'); return; }

  // Tampilkan loading state
  const btn = el('btn-login');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Memverifikasi...'; }

  // ── Langkah 1: Coba sync users dari Google Sheets dulu ──────
  // Ini memastikan HP dan PC selalu pakai data user yang sama
  const cfg = lsGet('fk_config', {});
  if (cfg.scripturl) {
    try {
      const data = await gsFetch('getAll', {}, 8000);
      if (data && !data.error && Array.isArray(data.users) && data.users.length > 0) {
        // Update localStorage dengan data terbaru dari Sheets
        lsSet('fk_users', data.users);
        console.log('[Login] Users disync dari Sheets:', data.users.length, 'user');
      }
    } catch(e) {
      // Gagal sync → lanjut dengan localStorage (mode offline)
      console.warn('[Login] Sync users gagal, pakai localStorage:', e.message);
    }
  }

  // ── Langkah 2: Validasi dari localStorage (sudah tersync atau default) ──
  const users = lsGet('fk_users', []);
  
  // Pastikan DEF_USERS selalu ada sebagai fallback
  // (jika Sheets kosong atau belum dikonfigurasi)
  const allUsers = users.length > 0 ? users : DEF_USERS;
  
  const found = allUsers.find(x =>
    String(x.username).trim() === u &&
    String(x.password).trim() === p
  );

  // Reset tombol
  if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Masuk'; }

  if (!found) {
    show('login-error');
    el('login-pass').value = '';
    // Shake animation
    const card = document.querySelector('.login-card');
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
    return;
  }

  hide('login-error');
  currentUser = found;

  // Pastikan user ini juga tersimpan di localStorage
  if (users.length === 0) lsSet('fk_users', DEF_USERS);

  hide('page-login');
  show('page-app');
  setupUserUI();
  showPage('dashboard');
  startIdleTimer();

  // Sync data lain di background setelah login berhasil
  if (cfg.scripturl) {
    setTimeout(async () => {
      await syncFromGS();
      reRenderActivePage();
    }, 500);
  }
}

function doLogout() {
  currentUser = null;
  stopIdleTimer();
  show('page-login');
  hide('page-app');
  el('login-user').value = '';
  el('login-pass').value = '';
  closeSidebar();
}

function togglePassword() {
  const inp = el('login-pass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function setupUserUI() {
  const admin = currentUser.role === 'admin';
  txt('nav-username', currentUser.fullname || currentUser.username);
  txt('nav-role', admin ? 'Administrator' : 'User');
  txt('nav-avatar', (currentUser.fullname || currentUser.username)[0].toUpperCase());
  document.querySelectorAll('.admin-only').forEach(e => e.style.display = admin ? '' : 'none');
}

// ─── NAVIGASI ─────────────────────────────────
function showPage(name) {
  if ((name==='pemasukan'||name==='setting') && currentUser.role!=='admin') {
    showToast('Hanya Admin yang dapat mengakses halaman ini.','error'); return;
  }
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = el('section-'+name);
  const nav = el('nav-'+name);
  const titles = { dashboard:'Dashboard', pemasukan:'Pendapatan', pengeluaran:'Pengeluaran',
                   laporan:'Laporan', setting:'Pengaturan', about:'Tentang' };

  if (!sec) return;
  sec.classList.remove('hidden');
  if (nav) nav.classList.add('active');
  txt('topbar-title', titles[name] || name);

  switch(name) {
    case 'dashboard':
      renderDashboard(); break;
    case 'pemasukan':
      populateKatSel('in-masuk-kategori','masuk');
      renderPemasukanTable();
      updateSaldoSummary(); break;
    case 'pengeluaran':
      populateKatSel('in-keluar-kategori','keluar');
      populateFilterKat();
      renderPengeluaranTable();
      updatePengeluaranSummary(); break;
    case 'laporan':
      setupLaporanFilters();
      renderLaporan('pengeluaran-lap'); break;
    case 'setting':
      renderUserTable();
      loadConfig(); break;
  }
  closeSidebar();
  resetIdleTimer();
}

// ─── SIDEBAR ──────────────────────────────────
function toggleSidebar() {
  el('sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
}
function openSidebar() {
  el('sidebar').classList.add('open');
  el('sb-overlay').classList.add('active');
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('sb-overlay').classList.remove('active');
}

// ─── AUTO REFRESH (IDLE TIMER) ────────────────
function startIdleTimer()  { resetIdleTimer(); }
function stopIdleTimer()   { clearTimeout(idleTimer); clearInterval(cdTimer); hideRefreshAnim(); }
function resetIdleTimer()  {
  clearTimeout(idleTimer); clearInterval(cdTimer); hideRefreshAnim();
  idleTimer = setTimeout(startCountdown, 10000);
}
function startCountdown() {
  cdVal = 10; showRefreshAnim(cdVal);
  cdTimer = setInterval(() => {
    cdVal--;
    if (cdVal <= 0) { clearInterval(cdTimer); hideRefreshAnim(); doAutoRefresh(); }
    else showRefreshAnim(cdVal);
  }, 1000);
}
function showRefreshAnim(n) {
  const ic = el('refresh-spin-icon'), cd = el('refresh-countdown');
  if (ic) ic.classList.add('spinning');
  if (cd) cd.textContent = n + 's';
}
function hideRefreshAnim() {
  const ic = el('refresh-spin-icon'), cd = el('refresh-countdown');
  if (ic) ic.classList.remove('spinning');
  if (cd) cd.textContent = '';
}
['mousemove','keydown','touchstart','click','scroll'].forEach(ev =>
  document.addEventListener(ev, () => { if (currentUser) resetIdleTimer(); }, { passive:true })
);

async function doAutoRefresh() {
  resetIdleTimer();
  const changed = await syncFromGS();
  reRenderActivePage();
  if (changed) showToast('Data diperbarui dari Google Sheets','success');
}

function manualRefresh() {
  stopIdleTimer();
  doAutoRefresh();
}

function reRenderActivePage() {
  const sec = document.querySelector('.section:not(.hidden)');
  if (!sec) return;
  const id = sec.id.replace('section-','');
  switch(id) {
    case 'dashboard':   renderDashboard(); break;
    case 'pemasukan':   renderPemasukanTable(); updateSaldoSummary(); break;
    case 'pengeluaran': renderPengeluaranTable(); updatePengeluaranSummary(); break;
    case 'laporan':     renderLaporan(getActiveLaporanTab()); break;
  }
}

function getActiveLaporanTab() {
  const active = document.querySelector('.lap-content.active');
  return active ? active.id.replace('lap-','') : 'pengeluaran-lap';
}

// ═══════════════════════════════════════════════
//  GOOGLE SHEETS / DRIVE INTEGRATION
//  Semua write via GET params (hindari CORS preflight)
//  Upload file via POST dengan Content-Type text/plain
// ═══════════════════════════════════════════════

function getCfg() { return lsGet('fk_config', {}); }

function loadConfig() {
  const cfg = getCfg();
  if (el('cfg-script-url')) el('cfg-script-url').value = cfg.scripturl || '';
  if (el('cfg-sheet-id'))   el('cfg-sheet-id').value   = cfg.sheetid   || '';
  if (el('cfg-drive-id'))   el('cfg-drive-id').value   = cfg.driveid   || '';
}

function saveConfig() {
  lsSet('fk_config', {
    scripturl: (el('cfg-script-url').value || '').trim(),
    sheetid:   (el('cfg-sheet-id').value   || '').trim(),
    driveid:   (el('cfg-drive-id').value   || '').trim()
  });
  showToast('Konfigurasi tersimpan ✓','success');
}

// Buat URL GET ke Apps Script
// ── Kirim semua request ke Apps Script via POST text/plain ──────
// Alasan: POST text/plain tidak trigger CORS preflight,
// tidak ada masalah encoding karakter khusus (spasi, /, -, dll),
// dan Apps Script doPost menerima JSON dari postData.contents.
async function gsFetch(action, params, timeoutMs=15000) {
  const cfg = getCfg();
  if (!cfg.scripturl) return null;
  const base    = cfg.scripturl.split('?')[0];
  const payload = JSON.stringify(Object.assign({ action }, params || {}));
  const ctrl    = new AbortController();
  const tid     = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res  = await fetch(base, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    payload,
      signal:  ctrl.signal
    });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { console.warn('[GS] Respons bukan JSON:', text.slice(0,300)); return null; }
  } catch(e) {
    clearTimeout(tid);
    if (e.name !== 'AbortError') console.warn('[GS] fetch error ['+action+']:', e.message);
    return null;
  }
}

// TEST KONEKSI
async function testConnection() {
  const cfg = getCfg();
  if (!cfg.scripturl) {
    showConnStatus('❌ URL Apps Script belum diisi. Simpan konfigurasi dahulu.','err'); return;
  }
  showConnStatus('⏳ Mencoba koneksi...','');
  const d = await gsFetch('test', {}, 12000);
  if (!d) {
    showConnStatus('❌ Gagal terhubung. Periksa: (1) URL benar, (2) deployment aktif, (3) akses "Anyone".','err');
    return;
  }
  if (d.error) {
    showConnStatus('❌ Server error: ' + d.error,'err'); return;
  }
  if (d.status === 'ok') {
    showConnStatus('✅ ' + d.message + ' — Timestamp: ' + (d.ts||''),'ok');
    // Langsung sync setelah koneksi berhasil
    showToast('Menyinkronkan data dari Google Sheets...','info');
    const changed = await syncFromGS();
    reRenderActivePage();
    if (changed) showToast('Sinkronisasi selesai!','success');
  }
}

function showConnStatus(msg, type) {
  const e = el('conn-status');
  if (!e) return;
  e.textContent = msg;
  e.className   = 'conn-status ' + (type||'');
  e.classList.remove('hidden');
}

// SYNC: Tarik semua data dari Sheets → localStorage
async function syncFromGS() {
  const data = await gsFetch('getAll', {}, 20000);
  if (!data || data.error) {
    console.warn('syncFromGS gagal:', data);
    return false;
  }
  let changed = false;

  if (Array.isArray(data.pemasukan)) {
    const rows = data.pemasukan.map(r => ({ ...r, jumlah: Number(r.jumlah)||0 }));
    lsSet('fk_pemasukan', rows); changed = true;
  }
  if (Array.isArray(data.pengeluaran)) {
    const rows = data.pengeluaran.map(r => ({ ...r, jumlah: Number(r.jumlah)||0 }));
    lsSet('fk_pengeluaran', rows); changed = true;
  }
  if (Array.isArray(data.users) && data.users.length > 0) {
    // Normalisasi: trim whitespace di username & password
    const sheetUsers = data.users.map(u => ({
      ...u,
      username: String(u.username).trim(),
      password: String(u.password).trim(),
      fullname: String(u.fullname || '').trim(),
      role:     String(u.role || 'user').trim()
    }));
    // Jaga user aktif tetap ada (jika terhapus di Sheets)
    if (currentUser) {
      const inSheet = sheetUsers.find(u => u.username === currentUser.username);
      if (!inSheet) sheetUsers.push(currentUser);
    }
    lsSet('fk_users', sheetUsers);
    changed = true;
    console.log('[Sync] Users dari Sheets:', sheetUsers.length, 'user');
  } else if (!Array.isArray(data.users) || data.users.length === 0) {
    // Sheets belum punya data users → pastikan DEF_USERS tersimpan lokal
    if (lsGet('fk_users',[]).length === 0) {
      lsSet('fk_users', DEF_USERS);
    }
  }

  // ── Sync kategori dari sheet Kategori ──────────────
  // Sheets adalah sumber kebenaran; timpa localStorage
  if (Array.isArray(data.katMasuk) && data.katMasuk.length > 0) {
    lsSet('fk_kat_masuk', data.katMasuk); changed = true;
  }
  if (Array.isArray(data.katKeluar) && data.katKeluar.length > 0) {
    lsSet('fk_kat_keluar', data.katKeluar); changed = true;
  }

  return changed;
}

async function loadFromGoogleSheet() { return await syncFromGS(); }

// SIMPAN record ke Sheets (background, tidak blocking)
function saveToGS(type, record) {
  const cfg = getCfg();
  if (!cfg.scripturl) return;
  // Jalankan di background
  setTimeout(async () => {
    const d = await gsFetch('add', { type, record });
    if (d && d.status === 'ok') {
      console.log('[GS] Saved:', type, record.id || '');
    } else {
      console.warn('[GS] Save failed:', type, d);
    }
  }, 0);
}

// HAPUS record dari Sheets (background)
function deleteFromGS(type, id) {
  const cfg = getCfg();
  if (!cfg.scripturl) return;
  setTimeout(async () => {
    const d = await gsFetch('delete', { type, id });
    if (d && d.status === 'ok') console.log('[GS] Deleted:', type, id);
    else console.warn('[GS] Delete failed:', type, id, d);
  }, 0);
}

// UPLOAD file nota ke Google Drive (via POST text/plain)
async function uploadToGDrive(file, recordId) {
  const cfg = getCfg();
  if (!cfg.scripturl) throw new Error('URL Apps Script belum diisi di Pengaturan.');
  if (!cfg.driveid)   throw new Error('Google Drive Folder ID belum diisi di Pengaturan.');

  const b64      = await fileToBase64(file);
  const payload  = JSON.stringify({
    action:   'uploadFile',
    folderId: cfg.driveid,
    fileName: 'nota_' + recordId + '_' + file.name,
    fileData: b64,
    mimeType: file.type || 'application/octet-stream'
  });

  // Gunakan Content-Type text/plain agar Apps Script doPost tidak trigger CORS preflight
  const res = await fetch(cfg.scripturl.split('?')[0], {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    payload
  });

  if (!res.ok) throw new Error('HTTP ' + res.status + ' dari Apps Script');
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0,100)); }
  if (d.error) throw new Error('Drive error: ' + d.error);
  if (!d.url)  throw new Error('URL file tidak dikembalikan server');
  return d.url;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r   = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Gagal membaca file'));
    r.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  const h = new Date().getHours();
  const greet = h<12 ? 'Selamat Pagi' : h<15 ? 'Selamat Siang' : h<18 ? 'Selamat Sore' : 'Selamat Malam';
  txt('dash-greeting', greet + ', ' + (currentUser.fullname || currentUser.username) + '!');

  const mEl = el('dash-filter-month');
  if (mEl && !mEl.value) mEl.value = nowMonth();
  const month = (el('dash-filter-month') && el('dash-filter-month').value) || nowMonth();

  const allMasuk  = lsGet('fk_pemasukan', []).filter(r => r.tanggal && r.tanggal.startsWith(month));
  const allKeluar = lsGet('fk_pengeluaran', []).filter(r => r.tanggal && r.tanggal.startsWith(month));
  const totalM    = allMasuk.reduce((s,r) => s + toNum(r.jumlah), 0);
  const totalK    = allKeluar.reduce((s,r) => s + toNum(r.jumlah), 0);
  const saldo     = totalM - totalK;

  const [y, m] = month.split('-').map(Number);
  const days   = new Date(y, m, 0).getDate();

  txt('kpi-masuk',        fmtRp(totalM));
  txt('kpi-masuk-count',  allMasuk.length + ' transaksi');
  txt('kpi-keluar',       fmtRp(totalK));
  txt('kpi-keluar-count', allKeluar.length + ' transaksi');
  txt('kpi-saldo',        fmtRp(saldo));
  txt('kpi-avg',          fmtRp(Math.round(totalK / days)));
  txt('kpi-saldo-pct',    saldo >= 0
    ? (totalM > 0 ? Math.round(saldo/totalM*100) + '% dari pendapatan tersisa' : '—')
    : 'Defisit pengeluaran!');

  const saldoCard = el('kpi-saldo-card');
  const saldoIco  = el('kpi-saldo-ico');
  if (saldoCard) saldoCard.className = 'kpi-card ' + (saldo >= 0 ? 'kpi-green' : 'kpi-minus');
  if (saldoIco)  { saldoIco.className = 'kpi-ico ' + (saldo >= 0 ? 'green' : 'red'); saldoIco.textContent = saldo >= 0 ? '✓' : '!'; }

  const warn = el('dash-saldo-warning');
  if (warn) warn.classList.toggle('hidden', saldo >= 0);

  renderTrendChart();
  renderDonutChart(month, allKeluar, totalK);
  renderRecentTx();
}

function renderTrendChart() {
  const labels = [], dM = [], dK = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.getFullYear() + '-' + pad2(d.getMonth()+1);
    labels.push(d.toLocaleDateString('id-ID', { month:'short' }));
    dM.push(lsGet('fk_pemasukan', []).filter(r=>r.tanggal?.startsWith(m)).reduce((s,r)=>s+toNum(r.jumlah),0));
    dK.push(lsGet('fk_pengeluaran',[]).filter(r=>r.tanggal?.startsWith(m)).reduce((s,r)=>s+toNum(r.jumlah),0));
  }
  const ctx = el('chart-trend'); if (!ctx) return;
  if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
  chartTrend = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[
      { label:'Pendapatan', data:dM, borderColor:'#40916C', backgroundColor:'rgba(64,145,108,.09)', tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#40916C' },
      { label:'Pengeluaran',data:dK, borderColor:'#C0392B', backgroundColor:'rgba(192,57,43,.07)',  tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#C0392B' }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:11} } } },
      scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>fmtRpShort(v), font:{size:10} }, grid:{ color:'rgba(0,0,0,.05)' } },
               x:{ ticks:{ font:{size:10} }, grid:{ display:false } } }
    }
  });
}

function renderDonutChart(month, allKeluar, totalK) {
  const ctx = el('chart-kategori'), dc = el('donut-center');
  if (!ctx) return;
  if (chartKat) { chartKat.destroy(); chartKat = null; }

  const katMap = {};
  allKeluar.forEach(r => { katMap[r.kategori] = (katMap[r.kategori]||0) + toNum(r.jumlah); });
  const sorted = Object.entries(katMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  if (!sorted.length) {
    if (dc) dc.innerHTML = '<div class="donut-lbl" style="font-size:.75rem;color:var(--text-l)">Tidak ada data</div>';
    return;
  }
  if (dc) dc.innerHTML = `<div class="donut-val">${fmtRpShort(totalK)}</div><div class="donut-lbl">Total</div>`;

  const mLabel = el('dash-chart-period');
  if (mLabel) mLabel.textContent = new Date(month+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'});

  chartKat = new Chart(ctx, {
    type:'doughnut',
    data:{ labels: sorted.map(x=>x[0]), datasets:[{ data: sorted.map(x=>x[1]), backgroundColor: CHART_COLORS.slice(0,sorted.length), borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{ position:'right', labels:{ boxWidth:11, font:{size:10}, padding:8 } },
        tooltip:{ callbacks:{ label:c=>' '+c.label+': '+fmtRp(c.raw)+' ('+Math.round(c.raw/totalK*100)+'%)' } } }
    }
  });
}

function renderRecentTx() {
  const masuk  = lsGet('fk_pemasukan', []).map(r=>({...r,_t:'masuk'}));
  const keluar = lsGet('fk_pengeluaran',[]).map(r=>({...r,_t:'keluar'}));
  const all    = [...masuk,...keluar]
    .sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||'') || (b.ts||0)-(a.ts||0))
    .slice(0,10);

  const tbody = el('tbody-recent'); if (!tbody) return;
  if (!all.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Belum ada transaksi</td></tr>'; return;
  }
  tbody.innerHTML = all.map(r => `
    <tr>
      <td>${fmtDate(r.tanggal)}</td>
      <td><span class="${r._t==='masuk'?'tipe-masuk':'tipe-keluar'}">${r._t==='masuk'?'↑ Pendapatan':'↓ Pengeluaran'}</span></td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:${r._t==='masuk'?'#27AE60':'#C0392B'};font-weight:600">
        ${r._t==='masuk'?'+':'-'}${fmtRp(toNum(r.jumlah))}
      </td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════
//  PENDAPATAN
// ═══════════════════════════════════════════════
function renderPemasukanTable() {
  let data = lsGet('fk_pemasukan', []);
  const fm = el('filter-pemasukan-month')?.value;
  if (fm) data = data.filter(r => r.tanggal && r.tanggal.startsWith(fm));
  data.sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||''));

  const tbody = el('tbody-pemasukan'), totalEl = el('total-row-pemasukan');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Belum ada data pendapatan</td></tr>';
    if (totalEl) totalEl.style.display = 'none'; return;
  }
  const total = data.reduce((s,r)=>s+toNum(r.jumlah),0);
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${fmtDate(r.tanggal)}</td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:#27AE60;font-weight:600">+${fmtRp(toNum(r.jumlah))}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit"   onclick="editPemasukan('${esc(r.id)}')">Edit</button>
          <button class="btn-danger" onclick="confirmDel('pemasukan','${esc(r.id)}','Hapus data pendapatan ini?')">Hapus</button>
        </div>
      </td>
    </tr>`).join('');
  if (totalEl) { totalEl.textContent = 'Total: ' + fmtRp(total); totalEl.style.display = 'block'; }
  updateSaldoSummary();
}

function updateSaldoSummary() {
  const totalM = lsGet('fk_pemasukan', []).reduce((s,r)=>s+toNum(r.jumlah),0);
  const totalK = lsGet('fk_pengeluaran',[]).reduce((s,r)=>s+toNum(r.jumlah),0);
  const saldo  = totalM - totalK;
  txt('total-pendapatan',    fmtRp(totalM));
  txt('total-pengeluaran-sum', fmtRp(totalK));
  txt('saldo-bersih',        fmtRp(saldo));
  const card = el('saldo-card'), ico = el('saldo-icon'), warn = el('saldo-warning');
  if (card) card.className = 'sum-card ' + (saldo>=0?'green':'minus');
  if (ico)  ico.textContent = saldo>=0 ? '≈' : '!';
  if (warn) warn.classList.toggle('hidden', saldo>=0);
}

function openAddPemasukan() {
  el('edit-masuk-id').value = '';
  txt('modal-masuk-title','Tambah Pendapatan');
  clearFields(['in-masuk-tanggal','in-masuk-keterangan','in-masuk-jumlah']);
  populateKatSel('in-masuk-kategori','masuk');
  setDefaultDate('in-masuk-tanggal');
  openModal('modal-add-pemasukan');
}

function editPemasukan(id) {
  const r = lsGet('fk_pemasukan',[]).find(x=>x.id===id);
  if (!r) return;
  el('edit-masuk-id').value      = id;
  txt('modal-masuk-title','Edit Pendapatan');
  el('in-masuk-tanggal').value   = r.tanggal||'';
  el('in-masuk-keterangan').value= r.keterangan||'';
  el('in-masuk-jumlah').value    = fmtAmountInput(toNum(r.jumlah));
  populateKatSel('in-masuk-kategori','masuk');
  el('in-masuk-kategori').value  = r.kategori||'';
  openModal('modal-add-pemasukan');
}

function savePemasukan() {
  const tanggal    = el('in-masuk-tanggal').value;
  const kategori   = el('in-masuk-kategori').value;
  const keterangan = el('in-masuk-keterangan').value.trim();
  const jumlah     = parseAmount(el('in-masuk-jumlah').value);
  const editId     = el('edit-masuk-id').value;

  if (!tanggal)   { showToast('Tanggal wajib diisi!','error'); return; }
  if (!kategori)  { showToast('Kategori wajib dipilih!','error'); return; }
  if (jumlah<=0)  { showToast('Jumlah harus lebih dari 0!','error'); return; }

  let data = lsGet('fk_pemasukan',[]);
  if (editId) {
    const idx = data.findIndex(r=>r.id===editId);
    if (idx >= 0) data[idx] = { ...data[idx], tanggal, kategori, keterangan, jumlah };
    lsSet('fk_pemasukan', data);
    // Update juga di GS: hapus lama, tambah baru
    deleteFromGS('pemasukan', editId);
    saveToGS('pemasukan', data[data.findIndex(r=>r.id===editId)]);
    showToast('Pendapatan diperbarui ✓','success');
  } else {
    const rec = { id: uid(), tanggal, kategori, keterangan, jumlah, user: currentUser.username, ts: Date.now() };
    data.push(rec);
    lsSet('fk_pemasukan', data);
    saveToGS('pemasukan', rec);
    showToast('Pendapatan disimpan ✓','success');
  }
  closeModal('modal-add-pemasukan');
  renderPemasukanTable();
  updateSaldoSummary();
}

function deletePemasukan(id) {
  lsSet('fk_pemasukan', lsGet('fk_pemasukan',[]).filter(r=>r.id!==id));
  deleteFromGS('pemasukan', id);
  renderPemasukanTable();
  updateSaldoSummary();
  showToast('Data dihapus','success');
}

// ═══════════════════════════════════════════════
//  PENGELUARAN
// ═══════════════════════════════════════════════
function populateFilterKat() {
  const sel = el('filter-pengeluaran-kat'); if (!sel) return;
  const cats = lsGet('fk_kat_keluar',[]);
  const cur  = sel.value;
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c=>`<option value="${esc(c)}" ${cur===c?'selected':''}>${esc(c)}</option>`).join('');
}

function resetFilterPengeluaran() {
  if (el('filter-pengeluaran-month')) el('filter-pengeluaran-month').value = '';
  if (el('filter-pengeluaran-kat'))   el('filter-pengeluaran-kat').value   = '';
  renderPengeluaranTable();
}

function renderPengeluaranTable() {
  let data = lsGet('fk_pengeluaran',[]);
  const fm = el('filter-pengeluaran-month')?.value;
  const fk = el('filter-pengeluaran-kat')?.value;
  if (fm) data = data.filter(r => r.tanggal && r.tanggal.startsWith(fm));
  if (fk) data = data.filter(r => r.kategori === fk);
  data.sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||''));

  const tbody  = el('tbody-pengeluaran'), totalEl = el('total-row-pengeluaran');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Belum ada data pengeluaran</td></tr>';
    if (totalEl) totalEl.style.display = 'none';
    updatePengeluaranSummary(); return;
  }
  const total   = data.reduce((s,r)=>s+toNum(r.jumlah),0);
  const isAdmin = currentUser.role === 'admin';

  tbody.innerHTML = data.map(r => {
    const notaHtml = r.notaUrl && !r.notaUrl.startsWith('data:')
      ? `<a href="${r.notaUrl}" target="_blank" class="nota-link">📎 ${esc(r.notaName||'Lihat')}</a>`
      : r.notaUrl
      ? `<span class="nota-link" onclick="previewLocalNota('${esc(r.id)}')" style="cursor:pointer">📎 ${esc(r.notaName||'Nota')}</span>`
      : '<span style="color:var(--text-l);font-size:.8rem">—</span>';
    return `<tr>
      <td>${fmtDate(r.tanggal)}</td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:#C0392B;font-weight:600">-${fmtRp(toNum(r.jumlah))}</td>
      <td>${notaHtml}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editPengeluaran('${esc(r.id)}')">Edit</button>
          ${isAdmin ? `<button class="btn-danger" onclick="confirmDel('pengeluaran','${esc(r.id)}','Hapus data pengeluaran ini?')">Hapus</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  if (totalEl) { totalEl.textContent = 'Total: ' + fmtRp(total); totalEl.style.display = 'block'; }
  updatePengeluaranSummary();
}

function updatePengeluaranSummary() {
  const now  = new Date();
  const m    = now.getFullYear() + '-' + pad2(now.getMonth()+1);
  const mData= lsGet('fk_pengeluaran',[]).filter(r=>r.tanggal&&r.tanggal.startsWith(m));
  const total= mData.reduce((s,r)=>s+toNum(r.jumlah),0);
  const days = new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  txt('pengeluaran-bulan-ini', fmtRp(total));
  txt('pengeluaran-count',     mData.length);
  txt('pengeluaran-avg',       fmtRp(Math.round(total/days)));
}

function openAddPengeluaran() {
  el('edit-keluar-id').value = '';
  txt('modal-keluar-title','Tambah Pengeluaran');
  clearFields(['in-keluar-tanggal','in-keluar-keterangan','in-keluar-jumlah']);
  populateKatSel('in-keluar-kategori','keluar');
  setDefaultDate('in-keluar-tanggal');
  selectedFile = null;
  resetNotaPreview();
  openModal('modal-add-pengeluaran');
}

function editPengeluaran(id) {
  const r = lsGet('fk_pengeluaran',[]).find(x=>x.id===id);
  if (!r) return;
  el('edit-keluar-id').value       = id;
  txt('modal-keluar-title','Edit Pengeluaran');
  el('in-keluar-tanggal').value    = r.tanggal||'';
  el('in-keluar-keterangan').value = r.keterangan||'';
  el('in-keluar-jumlah').value     = fmtAmountInput(toNum(r.jumlah));
  populateKatSel('in-keluar-kategori','keluar');
  el('in-keluar-kategori').value   = r.kategori||'';
  selectedFile = null;
  resetNotaPreview();
  if (r.notaName) {
    const prev = el('nota-preview');
    if (prev) { prev.classList.remove('hidden'); prev.textContent = '📎 ' + r.notaName + ' (sudah ada)'; }
  }
  openModal('modal-add-pengeluaran');
}

function savePengeluaran() {
  const tanggal    = el('in-keluar-tanggal').value;
  const kategori   = el('in-keluar-kategori').value;
  const keterangan = el('in-keluar-keterangan').value.trim();
  const jumlah     = parseAmount(el('in-keluar-jumlah').value);
  const editId     = el('edit-keluar-id').value;

  if (!tanggal)  { showToast('Tanggal wajib diisi!','error'); return; }
  if (!kategori) { showToast('Kategori wajib dipilih!','error'); return; }
  if (jumlah<=0) { showToast('Jumlah harus lebih dari 0!','error'); return; }

  let data = lsGet('fk_pengeluaran',[]);

  if (editId) {
    const idx = data.findIndex(r=>r.id===editId);
    if (idx>=0) data[idx] = { ...data[idx], tanggal, kategori, keterangan, jumlah };
    lsSet('fk_pengeluaran', data);
    deleteFromGS('pengeluaran', editId);
    saveToGS('pengeluaran', data[data.findIndex(r=>r.id===editId)]);
    closeModal('modal-add-pengeluaran');
    renderPengeluaranTable();
    updatePengeluaranSummary();
    showToast('Pengeluaran diperbarui ✓','success');
    return;
  }

  const rec = {
    id: uid(), tanggal, kategori, keterangan, jumlah,
    user: currentUser.username, ts: Date.now(),
    notaUrl: '', notaName: ''
  };

  if (selectedFile) {
    // Tutup modal dulu, proses upload di background
    closeModal('modal-add-pengeluaran');
    showToast('Menyimpan & mengupload nota...','info');

    uploadToGDrive(selectedFile, rec.id)
      .then(url => {
        rec.notaUrl  = url;
        rec.notaName = selectedFile.name;
        showToast('Nota berhasil diupload ke Google Drive ✓','success');
      })
      .catch(async err => {
        // Fallback: simpan sebagai base64 lokal
        console.warn('GDrive upload gagal, simpan lokal:', err.message);
        try {
          const b64 = await fileToBase64(selectedFile);
          rec.notaUrl  = 'data:' + selectedFile.type + ';base64,' + b64;
          rec.notaName = selectedFile.name;
          showToast('Nota disimpan lokal (Drive tidak terhubung)','info');
        } catch {}
      })
      .finally(() => {
        data.push(rec);
        lsSet('fk_pengeluaran', data);
        saveToGS('pengeluaran', rec);
        renderPengeluaranTable();
        updatePengeluaranSummary();
      });

    selectedFile = null;
    return;
  }

  data.push(rec);
  lsSet('fk_pengeluaran', data);
  saveToGS('pengeluaran', rec);
  closeModal('modal-add-pengeluaran');
  renderPengeluaranTable();
  updatePengeluaranSummary();
  showToast('Pengeluaran disimpan ✓','success');
}

function deletePengeluaran(id) {
  lsSet('fk_pengeluaran', lsGet('fk_pengeluaran',[]).filter(r=>r.id!==id));
  deleteFromGS('pengeluaran', id);
  renderPengeluaranTable();
  updatePengeluaranSummary();
  showToast('Data dihapus','success');
}

// Preview nota lokal (base64)
function previewLocalNota(id) {
  const r = lsGet('fk_pengeluaran',[]).find(x=>x.id===id);
  if (!r || !r.notaUrl) return;
  const win = window.open();
  if (r.notaUrl.startsWith('data:image')) {
    win.document.write('<img src="'+r.notaUrl+'" style="max-width:100%">');
  } else {
    win.location = r.notaUrl;
  }
}

// ─── FILE UPLOAD ──────────────────────────────
function handleFileSelect(input) {
  if (input.files[0]) setSelectedFile(input.files[0]);
}
function handleDragOver(e)  { e.preventDefault(); el('upload-zone').classList.add('drag-over'); }
function handleDragLeave()  { el('upload-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  el('upload-zone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]);
}
function setSelectedFile(file) {
  if (file.size > 10 * 1024 * 1024) { showToast('Ukuran file maks 10 MB!','error'); return; }
  selectedFile = file;
  const prev = el('nota-preview');
  if (prev) { prev.classList.remove('hidden'); prev.textContent = '📎 ' + file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)'; }
}
function resetNotaPreview() {
  if (el('in-keluar-nota'))  el('in-keluar-nota').value = '';
  const prev = el('nota-preview');
  if (prev) prev.classList.add('hidden');
}

// ═══════════════════════════════════════════════
//  KATEGORI
// ═══════════════════════════════════════════════
function populateKatSel(selId, type) {
  const sel  = el(selId); if (!sel) return;
  const cats = lsGet(type==='masuk'?'fk_kat_masuk':'fk_kat_keluar',[]);
  const cur  = sel.value;
  sel.innerHTML = cats.map(c=>
    `<option value="${esc(c)}" ${cur===c?'selected':''}>${esc(c)}</option>`
  ).join('');
}

function renderKatList(type) {
  const listId  = type==='masuk' ? 'list-kategori-masuk' : 'list-kategori-keluar';
  const key     = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const cats    = lsGet(key,[]);
  const isAdmin = currentUser.role === 'admin';
  el(listId).innerHTML = cats.map((c,i) => `
    <li>
      <span>${esc(c)}</span>
      ${isAdmin ? `<button class="btn-danger" onclick="deleteKategori('${type}',${i})">Hapus</button>` : ''}
    </li>`).join('');
}

function addKategori(type) {
  const inpId = type==='masuk' ? 'new-kategori-masuk' : 'new-kategori-keluar';
  const key   = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const val   = el(inpId).value.trim();
  if (!val) { showToast('Nama kategori tidak boleh kosong','error'); return; }
  const cats = lsGet(key,[]);
  if (cats.map(c=>c.toLowerCase()).includes(val.toLowerCase())) {
    showToast('Kategori sudah ada!','error'); return;
  }
  cats.push(val);
  lsSet(key, cats);
  el(inpId).value = '';
  renderKatList(type);
  const cfg = getCfg();
  if (cfg.scripturl) {
    gsFetch('addKategori', { tipe: type, nama: val }).then(d => {
      if (d && d.status==='ok') console.log('[GS] Kategori ditambah:', type, val);
      else console.warn('[GS] addKategori gagal:', d);
    });
  }
  showToast('Kategori "' + val + '" ditambahkan ✓','success');
}

function deleteKategori(type, idx) {
  const key  = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const cats = lsGet(key,[]);
  const nama = cats[idx];
  if (!nama) return;
  cats.splice(idx, 1);
  lsSet(key, cats);
  renderKatList(type);
  const cfg = getCfg();
  if (cfg.scripturl) {
    gsFetch('deleteKategori', { tipe: type, nama }).then(d => {
      if (d && d.status==='ok') console.log('[GS] Kategori dihapus:', type, nama);
      else console.warn('[GS] deleteKategori gagal:', d);
    });
  }
  showToast('Kategori "' + nama + '" dihapus','success');
}

// ═══════════════════════════════════════════════
//  LAPORAN
// ═══════════════════════════════════════════════
function setupLaporanFilters() {
  const m = nowMonth();
  ['keluar','masuk','gab'].forEach(t => {
    const mEl = el('lap-month-'+t);
    if (mEl && !mEl.value) mEl.value = m;
  });
}

function switchLaporan(btn, name) {
  document.querySelectorAll('.lap-content').forEach(e => { e.classList.remove('active'); e.style.display = 'none'; });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const content = el('lap-'+name);
  if (content) { content.classList.add('active'); content.style.display = 'block'; }
  btn.classList.add('active');
  renderLaporan(name);
}

function getLapFilter(name) {
  const s = name==='pengeluaran-lap'?'keluar': name==='pendapatan-lap'?'masuk':'gab';
  const type  = el('lap-type-'+s)?.value  || 'bulanan';
  const date  = el('lap-date-'+s)?.value  || '';
  const month = el('lap-month-'+s)?.value || '';
  const year  = el('lap-year-'+s)?.value  || '';

  // Tampilkan input yang sesuai
  const dateEl  = el('lap-date-'+s);
  const monthEl = el('lap-month-'+s);
  const yearEl  = el('lap-year-'+s);
  if (dateEl)  dateEl.style.display  = type==='harian'  ? '' : 'none';
  if (monthEl) monthEl.style.display = type==='bulanan' ? '' : 'none';
  if (yearEl)  yearEl.style.display  = type==='tahunan' ? '' : 'none';

  return { type, date, month, year };
}

function applyLapFilter(data, f) {
  if (f.type==='harian'  && f.date)  return data.filter(r => r.tanggal === f.date);
  if (f.type==='bulanan' && f.month) return data.filter(r => r.tanggal?.startsWith(f.month));
  if (f.type==='tahunan' && f.year)  return data.filter(r => r.tanggal?.startsWith(f.year));
  return data;
}

function renderLaporan(name) {
  const f      = getLapFilter(name);
  const masuk  = applyLapFilter(lsGet('fk_pemasukan', []),  f).sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  const keluar = applyLapFilter(lsGet('fk_pengeluaran',[]), f).sort((a,b)=>a.tanggal.localeCompare(b.tanggal));

  if (name==='pengeluaran-lap') {
    renderLapTable('tbody-lap-keluar', 'lap-total-keluar', keluar, 'Pengeluaran');
    renderLapBarChart(keluar);
  }
  if (name==='pendapatan-lap') {
    renderLapTable('tbody-lap-masuk', 'lap-total-masuk', masuk, 'Pendapatan');
  }
  if (name==='gabungan-lap') {
    const gab = [
      ...masuk.map(r=>({...r,_t:'Pendapatan'})),
      ...keluar.map(r=>({...r,_t:'Pengeluaran'}))
    ].sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    const tbody = el('tbody-lap-gab'), totEl = el('lap-total-gab');
    if (!gab.length) {
      tbody.innerHTML='<tr><td colspan="5" class="empty-row">Tidak ada data</td></tr>';
      if (totEl) totEl.innerHTML=''; return;
    }
    tbody.innerHTML = gab.map(r=>`
      <tr>
        <td>${fmtDate(r.tanggal)}</td>
        <td><span class="${r._t==='Pendapatan'?'tipe-masuk':'tipe-keluar'}">${r._t}</span></td>
        <td><span class="kat-badge">${esc(r.kategori)}</span></td>
        <td>${esc(r.keterangan||'—')}</td>
        <td class="text-right amount-cell">${fmtRp(toNum(r.jumlah))}</td>
      </tr>`).join('');
    const tM = masuk.reduce((s,r)=>s+toNum(r.jumlah),0);
    const tK = keluar.reduce((s,r)=>s+toNum(r.jumlah),0);
    const sl = tM - tK;
    if (totEl) totEl.innerHTML =
      `<span>Pendapatan: ${fmtRp(tM)}</span>`+
      `<span>Pengeluaran: ${fmtRp(tK)}</span>`+
      `<span style="color:${sl>=0?'var(--primary)':'var(--danger)'}">Saldo: ${fmtRp(sl)}</span>`;
  }
}

function renderLapTable(tbodyId, totId, data, label) {
  const tbody = el(tbodyId), totEl = el(totId);
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Tidak ada data untuk filter ini</td></tr>';
    if (totEl) totEl.textContent = ''; return;
  }
  tbody.innerHTML = data.map(r=>`
    <tr>
      <td>${fmtDate(r.tanggal)}</td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell">${fmtRp(toNum(r.jumlah))}</td>
    </tr>`).join('');
  const total = data.reduce((s,r)=>s+toNum(r.jumlah),0);
  if (totEl) totEl.textContent = 'Total ' + label + ': ' + fmtRp(total);
}

function renderLapBarChart(data) {
  const ctx = el('lap-chart-kat-keluar'); if (!ctx) return;
  if (chartLapKat) { chartLapKat.destroy(); chartLapKat = null; }
  const katMap = {};
  data.forEach(r => { katMap[r.kategori] = (katMap[r.kategori]||0) + toNum(r.jumlah); });
  const sorted = Object.entries(katMap).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) return;
  chartLapKat = new Chart(ctx, {
    type:'bar',
    data:{ labels: sorted.map(x=>x[0]), datasets:[{
      label:'Total', data: sorted.map(x=>x[1]),
      backgroundColor: CHART_COLORS.slice(0,sorted.length), borderRadius:5
    }]},
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>fmtRp(c.raw) } } },
      scales:{ x:{ ticks:{ callback:v=>fmtRpShort(v), font:{size:10} }, grid:{ color:'rgba(0,0,0,.05)' } },
               y:{ ticks:{ font:{size:10} } } }
    }
  });
}

// ═══════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════
function getExportRows(type) {
  if (type==='pemasukan') {
    let d = lsGet('fk_pemasukan',[]);
    const m = el('filter-pemasukan-month')?.value;
    if (m) d = d.filter(r=>r.tanggal?.startsWith(m));
    d.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:d.map(r=>[fmtDate(r.tanggal),r.kategori,r.keterangan||'',toNum(r.jumlah)]), title:'Pendapatan' };
  }
  let d = lsGet('fk_pengeluaran',[]);
  const m = el('filter-pengeluaran-month')?.value;
  const k = el('filter-pengeluaran-kat')?.value;
  if (m) d = d.filter(r=>r.tanggal?.startsWith(m));
  if (k) d = d.filter(r=>r.kategori===k);
  d.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  return { headers:['Tanggal','Kategori','Keterangan','Jumlah','Nota URL'], rows:d.map(r=>[fmtDate(r.tanggal),r.kategori,r.keterangan||'',toNum(r.jumlah),(r.notaUrl&&!r.notaUrl.startsWith('data:'))?r.notaUrl:'']), title:'Pengeluaran' };
}

function getLapRows(name) {
  const f = getLapFilter(name);
  const masuk  = applyLapFilter(lsGet('fk_pemasukan', []),  f);
  const keluar = applyLapFilter(lsGet('fk_pengeluaran',[]), f);
  if (name==='pengeluaran-lap') return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:keluar.map(r=>[fmtDate(r.tanggal),r.kategori,r.keterangan||'',toNum(r.jumlah)]), title:'Laporan Pengeluaran' };
  if (name==='pendapatan-lap')  return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:masuk.map(r=>[fmtDate(r.tanggal),r.kategori,r.keterangan||'',toNum(r.jumlah)]),  title:'Laporan Pendapatan' };
  const gab = [...masuk.map(r=>({...r,_t:'Pendapatan'})),...keluar.map(r=>({...r,_t:'Pengeluaran'}))].sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  return { headers:['Tanggal','Tipe','Kategori','Keterangan','Jumlah'], rows:gab.map(r=>[fmtDate(r.tanggal),r._t,r.kategori,r.keterangan||'',toNum(r.jumlah)]), title:'Laporan Gabungan' };
}

function exportData(type, fmt)    { const {headers,rows,title} = getExportRows(type); doExport(headers,rows,title,fmt); }
function exportLaporan(name, fmt) { const {headers,rows,title} = getLapRows(name);    doExport(headers,rows,title,fmt); }
function printData(type)          { const {headers,rows,title} = getExportRows(type); doPrint(headers,rows.map(r=>r.map((c,i)=>i===r.length-1&&typeof c==='number'?fmtRp(c):c)),title); }
function printLaporan(name)       { const {headers,rows,title} = getLapRows(name);    doPrint(headers,rows.map(r=>r.map((c,i)=>typeof c==='number'&&i===r.length-1?fmtRp(c):c)),title); }

function doExport(headers, rows, title, format) {
  if (format==='excel') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers,...rows]), title.slice(0,31));
    XLSX.writeFile(wb, title+'_'+todayStr()+'.xlsx');
    showToast('File Excel diunduh ✓','success');
  } else if (format==='csv') {
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    dlBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}), title+'_'+todayStr()+'.csv');
    showToast('File CSV diunduh ✓','success');
  } else if (format==='pdf') {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('FinansialKu – '+title, 14, 16);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text('Dicetak: '+new Date().toLocaleString('id-ID')+' | Oleh: '+(currentUser.fullname||currentUser.username), 14, 22);
    doc.autoTable({ startY:27, head:[headers], body:rows, theme:'grid',
      headStyles:{fillColor:[45,106,79],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[240,248,243]}, styles:{fontSize:8,cellPadding:2},
      columnStyles: headers.length>0 ? {[headers.length-1]:{halign:'right'}} : {}
    });
    doc.save(title+'_'+todayStr()+'.pdf');
    showToast('File PDF diunduh ✓','success');
  }
}

function doPrint(headers, rows, title) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#1C2E24}
    h2{color:#2D6A4F;margin-bottom:4px}p{font-size:9px;color:#666;margin-bottom:14px}
    table{width:100%;border-collapse:collapse}
    th{background:#2D6A4F;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
    td{padding:5px 8px;border-bottom:1px solid #E0EAE5;font-size:10px}
    tr:nth-child(even){background:#F0FAF4}
    .footer{margin-top:16px;font-size:9px;color:#888;border-top:1px solid #ccc;padding-top:8px}
    @page{margin:1.5cm}
  </style></head><body>
  <h2>${title}</h2>
  <p>Dicetak: ${new Date().toLocaleString('id-ID')} &bull; Pengguna: ${esc(currentUser.fullname||currentUser.username)}</p>
  <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <div class="footer">FinansialKu &copy; 2026 Sang Petualang Corp &bull; Beta 0526.1</div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 400);
}

// ═══════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════
function renderUserTable() {
  const users = lsGet('fk_users',[]);
  el('tbody-users').innerHTML = users.map((u,i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.fullname||'—')}</td>
      <td>
        <span class="role-badge ${u.role==='admin'?'role-admin':'role-user'}">${u.role==='admin'?'Admin':'User'}</span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="openResetPass('${esc(u.username)}')">Reset PW</button>
          ${u.username!==currentUser.username
            ? `<button class="btn-danger" onclick="confirmDel('user','${esc(u.username)}','Hapus pengguna ${esc(u.username)}?')">Hapus</button>`
            : '<span style="font-size:.76rem;color:var(--text-l)">(Anda)</span>'}
        </div>
      </td>
    </tr>`).join('');
}

function addUser() {
  const username = el('new-user-username').value.trim();
  const fullname = el('new-user-fullname').value.trim();
  const password = el('new-user-pass').value;
  const role     = el('new-user-role').value;
  if (!username) { showToast('Username wajib diisi!','error'); return; }
  if (!password) { showToast('Password wajib diisi!','error'); return; }
  const users = lsGet('fk_users',[]);
  if (users.find(u=>u.username===username)) { showToast('Username sudah digunakan!','error'); return; }
  const newUser = { username, fullname, password, role };
  users.push(newUser);
  lsSet('fk_users', users);
  // Simpan ke GS
  gsFetch('addUser', { user: newUser });
  closeModal('modal-add-user');
  clearFields(['new-user-username','new-user-fullname','new-user-pass']);
  renderUserTable();
  showToast('Pengguna berhasil ditambahkan ✓','success');
}

function deleteUser(username) {
  lsSet('fk_users', lsGet('fk_users',[]).filter(u=>u.username!==username));
  gsFetch('deleteUser', { username });
  renderUserTable();
  showToast('Pengguna dihapus','success');
}

let resetTarget = null;
function openResetPass(username) {
  resetTarget = username;
  txt('reset-target-user', username);
  el('reset-new-pass').value = '';
  openModal('modal-reset-pass');
}
function doResetPassword() {
  const np = el('reset-new-pass').value;
  if (!np) { showToast('Password baru tidak boleh kosong!','error'); return; }
  const users = lsGet('fk_users',[]);
  const idx   = users.findIndex(u=>u.username===resetTarget);
  if (idx>=0) { users[idx].password = np; lsSet('fk_users', users); }
  gsFetch('resetPass', { username: resetTarget, newPassword: np });
  closeModal('modal-reset-pass');
  showToast('Password berhasil direset ✓','success');
}

// ═══════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════
function openModal(id) {
  const m = el(id); if (!m) return;
  m.classList.remove('hidden');
  if (id==='modal-manage-kategori-masuk')  renderKatList('masuk');
  if (id==='modal-manage-kategori-keluar') renderKatList('keluar');
}
function closeModal(id) {
  const m = el(id); if (!m) return;
  m.classList.add('hidden');
}

// Confirm dialog
function confirmDel(type, id, msg) {
  txt('confirm-msg', msg);
  txt('confirm-title','Konfirmasi Hapus');
  confirmCB = () => {
    closeModal('modal-confirm');
    if (type==='pemasukan')   deletePemasukan(id);
    if (type==='pengeluaran') deletePengeluaran(id);
    if (type==='user')        deleteUser(id);
  };
  openModal('modal-confirm');
}
function confirmOk() { if (confirmCB) confirmCB(); }

// ═══════════════════════════════════════════════
//  DATE PICKER
// ═══════════════════════════════════════════════
const calSt = {};
function showDatePicker(input) {
  document.querySelectorAll('.cal-wrap').forEach(w => w.classList.add('hidden'));
  const calId = 'cal-' + input.id;
  const wrap  = el(calId); if (!wrap) return;
  wrap.classList.remove('hidden');
  if (!calSt[input.id]) {
    const now = new Date();
    calSt[input.id] = { year: now.getFullYear(), month: now.getMonth() };
  }
  renderCal(input.id);
}

function renderCal(inputId) {
  const wrap = el('cal-'+inputId); if (!wrap) return;
  const { year, month } = calSt[inputId];
  const selVal  = el(inputId)?.value || '';
  const now     = new Date();
  const todayS  = now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  const MONTHS  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DAYS    = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const first   = new Date(year, month, 1).getDay();
  const total   = new Date(year, month+1, 0).getDate();

  let cells = '';
  for (let i=0; i<first; i++) cells += '<div class="cal-day empty"></div>';
  for (let d=1; d<=total; d++) {
    const ds  = year+'-'+pad2(month+1)+'-'+pad2(d);
    const cls = ['cal-day', ds===selVal?'selected':'', ds===todayS?'today':''].filter(Boolean).join(' ');
    cells += `<div class="${cls}" onclick="selectDate('${inputId}','${ds}')">${d}</div>`;
  }

  wrap.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" onclick="calNav('${inputId}',-1,event)">‹</button>
      <span>${MONTHS[month]} ${year}</span>
      <button class="cal-nav" onclick="calNav('${inputId}',1,event)">›</button>
    </div>
    <div class="cal-grid">
      ${DAYS.map(d=>`<div class="cal-day-lbl">${d}</div>`).join('')}
      ${cells}
    </div>
    <input type="text" class="cal-manual" placeholder="YYYY-MM-DD" value="${selVal}"
      oninput="manualDate('${inputId}',this.value)">`;
}

function calNav(inputId, dir, e) {
  e.stopPropagation();
  calSt[inputId].month += dir;
  if (calSt[inputId].month > 11) { calSt[inputId].month=0;  calSt[inputId].year++; }
  if (calSt[inputId].month < 0)  { calSt[inputId].month=11; calSt[inputId].year--; }
  renderCal(inputId);
}

function selectDate(inputId, ds) {
  el(inputId).value = ds;
  el('cal-'+inputId).classList.add('hidden');
}

function manualDate(inputId, val) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    el(inputId).value = val;
    const d = new Date(val);
    calSt[inputId] = { year: d.getFullYear(), month: d.getMonth() };
    renderCal(inputId);
  }
}

function setDefaultDate(inputId) {
  const e = el(inputId);
  if (e && !e.value) {
    const n = new Date();
    e.value = n.getFullYear()+'-'+pad2(n.getMonth()+1)+'-'+pad2(n.getDate());
  }
}

// ═══════════════════════════════════════════════
//  AMOUNT INPUT
// ═══════════════════════════════════════════════
function formatAmountInput(input) {
  const raw = input.value.replace(/\D/g,'');
  if (!raw) { input.value=''; return; }
  input.value = Number(raw).toLocaleString('id-ID');
}
function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.]/g,'')) || 0;
}
function fmtAmountInput(n) {
  return Math.round(toNum(n)).toLocaleString('id-ID');
}

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function toNum(v)   { return parseFloat(v) || 0; }
function nowMonth() { const n=new Date(); return n.getFullYear()+'-'+pad2(n.getMonth()+1); }
function todayStr() { const n=new Date(); return n.getFullYear()+''+pad2(n.getMonth()+1)+''+pad2(n.getDate()); }

function fmtRp(n) {
  return 'Rp ' + Math.round(toNum(n)).toLocaleString('id-ID');
}
function fmtRpShort(n) {
  n = toNum(n);
  if (n >= 1e9) return 'Rp '+(n/1e9).toFixed(1)+' M';
  if (n >= 1e6) return 'Rp '+(n/1e6).toFixed(1)+' jt';
  if (n >= 1e3) return 'Rp '+(n/1e3).toFixed(0)+' rb';
  return 'Rp '+n;
}
function fmtDate(d) {
  if (!d) return '—';
  const [y,mo,dd] = String(d).split('-');
  const M = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${dd||'?'} ${M[+mo]||mo} ${y}`;
}

function clearFields(ids) { ids.forEach(id=>{ const e=el(id); if(e) e.value=''; }); }
function dlBlob(blob, name) { const u=URL.createObjectURL(blob),a=document.createElement('a'); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u); }
function clearFilter(id, cb) { const e=el(id); if(e) e.value=''; if(cb) cb(); }

function showToast(msg, type) {
  const t = el('toast'); if (!t) return;
  t.textContent = msg;
  t.className   = 'toast ' + (type||'');
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.add('hidden'), 3000);
}

// ═══════════════════════════════════════════════
//  SAMPLE DATA
// ═══════════════════════════════════════════════
function seedSampleData() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = pad2(now.getMonth()+1);
  const pm  = pad2(now.getMonth()===0 ? 12 : now.getMonth());
  const py  = now.getMonth()===0 ? y-1 : y;

  lsSet('fk_pemasukan', [
    {id:'sm01',tanggal:`${y}-${m}-01`,kategori:'Gaji',            keterangan:'Gaji bulan ini',          jumlah:5000000,user:'admin',ts:Date.now()-20000},
    {id:'sm02',tanggal:`${y}-${m}-10`,kategori:'Side Job',        keterangan:'Freelance desain logo',   jumlah:800000, user:'admin',ts:Date.now()-19000},
    {id:'sm03',tanggal:`${y}-${m}-15`,kategori:'Bonus',           keterangan:'Bonus kinerja triwulan',  jumlah:1200000,user:'admin',ts:Date.now()-18000},
    {id:'sm04',tanggal:`${py}-${pm}-01`,kategori:'Gaji',          keterangan:'Gaji bulan lalu',         jumlah:5000000,user:'admin',ts:Date.now()-17000},
    {id:'sm05',tanggal:`${py}-${pm}-14`,kategori:'Side Job',      keterangan:'Proyek website',          jumlah:1500000,user:'admin',ts:Date.now()-16000},
    {id:'sm06',tanggal:`${py}-${pm}-20`,kategori:'Hibah / Pemberian',keterangan:'Hadiah',               jumlah:300000, user:'admin',ts:Date.now()-15000},
  ]);

  lsSet('fk_pengeluaran', [
    {id:'sk01',tanggal:`${y}-${m}-01`,kategori:'Makan Keluarga',     keterangan:'Makan malam',          jumlah:185000, user:'admin',ts:Date.now()-14000,notaUrl:'',notaName:''},
    {id:'sk02',tanggal:`${y}-${m}-02`,kategori:'Transport',          keterangan:'Bensin + parkir',       jumlah:75000,  user:'user', ts:Date.now()-13000,notaUrl:'',notaName:''},
    {id:'sk03',tanggal:`${y}-${m}-03`,kategori:'Pulsa - Paket Data Suami',keterangan:'Internet 30 hari',jumlah:75000,  user:'user', ts:Date.now()-12000,notaUrl:'',notaName:''},
    {id:'sk04',tanggal:`${y}-${m}-05`,kategori:'Listrik',            keterangan:'Tagihan PLN',           jumlah:320000, user:'admin',ts:Date.now()-11000,notaUrl:'',notaName:''},
    {id:'sk05',tanggal:`${y}-${m}-06`,kategori:'Kebutuhan Rumah Tangga',keterangan:'Belanja pasar',      jumlah:450000, user:'user', ts:Date.now()-10000,notaUrl:'',notaName:''},
    {id:'sk06',tanggal:`${y}-${m}-08`,kategori:'Makan Sendiri',      keterangan:'Makan siang kantor',    jumlah:35000,  user:'user', ts:Date.now()-9000, notaUrl:'',notaName:''},
    {id:'sk07',tanggal:`${y}-${m}-09`,kategori:'Jajan Keluarga',     keterangan:'Kafe akhir pekan',      jumlah:95000,  user:'user', ts:Date.now()-8000, notaUrl:'',notaName:''},
    {id:'sk08',tanggal:`${y}-${m}-12`,kategori:'Donasi',             keterangan:'Infaq jumat',           jumlah:50000,  user:'admin',ts:Date.now()-7000, notaUrl:'',notaName:''},
    {id:'sk09',tanggal:`${y}-${m}-14`,kategori:'Rekreasi',           keterangan:'Tiket wahana anak',     jumlah:150000, user:'admin',ts:Date.now()-6000, notaUrl:'',notaName:''},
    {id:'sk10',tanggal:`${y}-${m}-15`,kategori:'Pulsa - Paket Data Istri',keterangan:'Paket bulanan',   jumlah:55000,  user:'user', ts:Date.now()-5000, notaUrl:'',notaName:''},
    {id:'sk11',tanggal:`${py}-${pm}-03`,kategori:'Makan Keluarga',   keterangan:'Makan restoran',        jumlah:220000, user:'admin',ts:Date.now()-4000, notaUrl:'',notaName:''},
    {id:'sk12',tanggal:`${py}-${pm}-10`,kategori:'Transport',        keterangan:'Grab & bensin',         jumlah:120000, user:'user', ts:Date.now()-3000, notaUrl:'',notaName:''},
    {id:'sk13',tanggal:`${py}-${pm}-18`,kategori:'Kebutuhan Rumah Tangga',keterangan:'Sabun & deterjen', jumlah:85000,  user:'user', ts:Date.now()-2000, notaUrl:'',notaName:''},
    {id:'sk14',tanggal:`${py}-${pm}-22`,kategori:'Listrik',          keterangan:'Tagihan PLN bulan lalu',jumlah:295000, user:'admin',ts:Date.now()-1000, notaUrl:'',notaName:''},
  ]);
}

// ─── BOOT ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
