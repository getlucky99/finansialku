/* ============================================
   FinansialKu – app.js  (Complete)
   ============================================ */
'use strict';

// ===== STATE =====
let currentUser = null;
let idleTimer   = null;
let cdTimer     = null;
let cdVal       = 10;
let chartTrend  = null;
let chartKat    = null;
let chartLapKat = null;
let confirmCallback = null;
let selectedNotaFile = null;

// ===== DEFAULTS =====
const DEF_USERS = [
  { username:'admin', fullname:'Administrator',   password:'admin123', role:'admin' },
  { username:'user',  fullname:'User Biasa',       password:'user123',  role:'user'  }
];
const DEF_KAT_MASUK  = ['Gaji','Side Job','Hibah / Pemberian','Bonus','Lain-lain'];
const DEF_KAT_KELUAR = ['Makan Keluarga','Makan Sendiri','Jajan Keluarga','Jajan Sendiri',
  'Transport','Pulsa - Paket Data Suami','Pulsa - Paket Data Istri',
  'Rekreasi','Listrik','Kebutuhan Rumah Tangga','Donasi','Lain-lain'];

const CHART_COLORS = ['#2D6A4F','#40916C','#74C69D','#1A6FA8','#D4860B','#C0392B',
  '#6D4FA0','#16A085','#E67E22','#2980B9','#8E44AD','#27AE60','#E74C3C','#F39C12'];

// ===== STORAGE =====
const ls  = (k,d) => { try{ const v=localStorage.getItem(k); return v!==null?JSON.parse(v):d; }catch{ return d; } };
const ss  = (k,v) => localStorage.setItem(k,JSON.stringify(v));

// ===== INIT =====
function init() {
  if (!ls('fk_users',null))          ss('fk_users', DEF_USERS);
  if (!ls('fk_kat_masuk',null))       ss('fk_kat_masuk', DEF_KAT_MASUK);
  if (!ls('fk_kat_keluar',null))      ss('fk_kat_keluar', DEF_KAT_KELUAR);
  if (!ls('fk_pemasukan',null))       seedSampleData();
  // pengeluaran seeded inside seedSampleData

  // login enter
  q('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  q('login-user').addEventListener('keydown', e => { if(e.key==='Enter') q('login-pass').focus(); });

  // topbar date
  updateTopbarDate();
  setInterval(updateTopbarDate, 60000);

  loadConfig();
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = new Date().toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
}

// ===== LOGIN =====
function doLogin() {
  const u = q('login-user').value.trim();
  const p = q('login-pass').value;
  const users = ls('fk_users',[]);
  const found = users.find(x => x.username===u && x.password===p);
  if (!found) {
    show('login-error'); q('login-pass').value = ''; return;
  }
  hide('login-error');
  currentUser = found;
  hide('page-login'); unhide('page-app');
  setupUserUI();
  showPage('dashboard');
  startIdleTimer();
}
function doLogout() {
  currentUser = null; stopIdleTimer();
  unhide('page-login'); hide('page-app');
  q('login-user').value=''; q('login-pass').value='';
  closeSidebar();
}
function togglePassword() {
  const inp = q('login-pass');
  inp.type = inp.type==='password' ? 'text' : 'password';
}
function setupUserUI() {
  const isAdmin = currentUser.role==='admin';
  q('nav-username').textContent = currentUser.fullname || currentUser.username;
  q('nav-role').textContent = isAdmin ? 'Administrator' : 'User';
  q('nav-avatar').textContent = (currentUser.fullname||currentUser.username)[0].toUpperCase();
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
}

// ===== PAGES =====
function showPage(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const titles = { dashboard:'Dashboard', pemasukan:'Pendapatan', pengeluaran:'Pengeluaran',
                   laporan:'Laporan', setting:'Pengaturan', about:'Tentang' };
  if ((name==='pemasukan'||name==='setting') && currentUser.role!=='admin') {
    showToast('Hanya admin yang dapat mengakses halaman ini.','error'); return;
  }
  const sec = document.getElementById('section-'+name);
  if (!sec) return;
  sec.classList.remove('hidden');
  const nav = document.getElementById('nav-'+name);
  if (nav) nav.classList.add('active');
  q('topbar-title').textContent = titles[name]||name;

  if (name==='dashboard')   { renderDashboard(); }
  if (name==='pemasukan')   { populateKatSelect('in-masuk-kategori','masuk'); renderPemasukanTable(); updateSaldoSummary(); }
  if (name==='pengeluaran') { populateKatSelect('in-keluar-kategori','keluar'); populateFilterKat(); renderPengeluaranTable(); updatePengeluaranSummary(); }
  if (name==='laporan')     { setupLaporanFilters(); renderLaporan('pengeluaran-lap'); }
  if (name==='setting')     { renderUserTable(); loadConfig(); }

  closeSidebar();
  resetIdleTimer();
}

// ===== SIDEBAR =====
function toggleSidebar() { document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar(); }
function openSidebar()   { document.getElementById('sidebar').classList.add('open'); document.getElementById('sb-overlay').classList.add('active'); }
function closeSidebar()  { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sb-overlay').classList.remove('active'); }

// ===== IDLE TIMER =====
function startIdleTimer()  { resetIdleTimer(); }
function stopIdleTimer()   { clearTimeout(idleTimer); clearInterval(cdTimer); hideRefreshAnim(); }
function resetIdleTimer()  {
  clearTimeout(idleTimer); clearInterval(cdTimer); hideRefreshAnim();
  idleTimer = setTimeout(startCountdown, 10000);
}
function startCountdown() {
  cdVal = 10;
  showRefreshAnim(cdVal);
  cdTimer = setInterval(() => {
    cdVal--;
    if (cdVal<=0) { clearInterval(cdTimer); hideRefreshAnim(); manualRefresh(); }
    else showRefreshAnim(cdVal);
  },1000);
}
function showRefreshAnim(n) {
  const icon = document.getElementById('refresh-spin-icon');
  const cd   = document.getElementById('refresh-countdown');
  if (icon) icon.classList.add('spinning');
  if (cd)   cd.textContent = n+'s';
}
function hideRefreshAnim() {
  const icon = document.getElementById('refresh-spin-icon');
  const cd   = document.getElementById('refresh-countdown');
  if (icon) icon.classList.remove('spinning');
  if (cd)   cd.textContent = '';
}
['mousemove','keydown','touchstart','click','scroll'].forEach(ev =>
  document.addEventListener(ev, () => { if(currentUser) resetIdleTimer(); }, { passive:true })
);

function manualRefresh() {
  loadFromGoogleSheet();
  resetIdleTimer();
  const activeSec = document.querySelector('.section:not(.hidden)');
  if (activeSec) {
    const id = activeSec.id.replace('section-','');
    if(id==='dashboard')   renderDashboard();
    if(id==='pemasukan')   { renderPemasukanTable(); updateSaldoSummary(); }
    if(id==='pengeluaran') { renderPengeluaranTable(); updatePengeluaranSummary(); }
  }
  showToast('Data diperbarui','success');
}

// ===== GOOGLE INTEGRATION =====
function loadConfig() {
  const cfg = ls('fk_config',{});
  ['cfg-script-url','cfg-sheet-id','cfg-drive-id'].forEach(id => {
    const el = document.getElementById(id);
    const key = id.replace('cfg-','').replace('-','');
    if (el && cfg[key]) el.value = cfg[key];
  });
}
function saveConfig() {
  const cfg = {
    scripturl: q('cfg-script-url').value.trim(),
    sheetid:   q('cfg-sheet-id').value.trim(),
    driveid:   q('cfg-drive-id').value.trim()
  };
  ss('fk_config', cfg);
  showToast('Konfigurasi tersimpan','success');
}
async function testConnection() {
  const cfg = ls('fk_config',{});
  const statusEl = document.getElementById('conn-status');
  if (!cfg.scripturl) { showConnStatus('❌ URL Apps Script belum diisi.','err'); return; }
  showConnStatus('⏳ Menghubungkan...','');
  try {
    const res = await fetch(cfg.scripturl+'?action=test');
    const d   = await res.json();
    if (d.status==='ok') showConnStatus('✅ Koneksi berhasil! '+d.message,'ok');
    else showConnStatus('❌ Server merespons: '+(d.error||'Error tidak dikenal'),'err');
  } catch(e) { showConnStatus('❌ Gagal terhubung: '+e.message,'err'); }
}
function showConnStatus(msg, type) {
  const el = document.getElementById('conn-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'conn-status '+(type||'');
  el.classList.remove('hidden');
}
async function loadFromGoogleSheet() {
  const cfg = ls('fk_config',{});
  if (!cfg.scripturl) return;
  try {
    const res  = await fetch(cfg.scripturl+'?action=getAll');
    const data = await res.json();
    if (data.pemasukan)   ss('fk_pemasukan', data.pemasukan);
    if (data.pengeluaran) ss('fk_pengeluaran', data.pengeluaran);
    if (data.users)       ss('fk_users', data.users);
  } catch{}
}
async function saveToGS(type, record) {
  const cfg = ls('fk_config',{});
  if (!cfg.scripturl) return;
  try {
    await fetch(cfg.scripturl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add',type,record})});
  } catch{}
}
async function deleteFromGS(type, id) {
  const cfg = ls('fk_config',{});
  if (!cfg.scripturl) return;
  try {
    await fetch(cfg.scripturl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',type,id})});
  } catch{}
}
async function uploadToGDrive(file, recordId) {
  const cfg = ls('fk_config',{});
  if (!cfg.scripturl || !cfg.driveid) throw new Error('Config missing');
  const b64 = await fileToBase64(file);
  const res = await fetch(cfg.scripturl,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'uploadFile',folderId:cfg.driveid,
      fileName:'nota_'+recordId+'_'+file.name,fileData:b64,mimeType:file.type})});
  const d = await res.json();
  return d.url;
}
function fileToBase64(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
}

// ===== DASHBOARD =====
function renderDashboard() {
  // greeting
  const h = new Date().getHours();
  const greets = h<12?'Selamat Pagi':h<15?'Selamat Siang':h<18?'Selamat Sore':'Selamat Malam';
  q('dash-greeting').textContent = greets+', '+( currentUser.fullname||currentUser.username )+'!';

  // default filter to current month
  const mEl = document.getElementById('dash-filter-month');
  if (mEl && !mEl.value) mEl.value = nowMonth();

  const month = document.getElementById('dash-filter-month')?.value || nowMonth();

  const allMasuk  = ls('fk_pemasukan',[]).filter(r=>r.tanggal?.startsWith(month));
  const allKeluar = ls('fk_pengeluaran',[]).filter(r=>r.tanggal?.startsWith(month));
  const totalM = allMasuk.reduce((s,r)=>s+numVal(r.jumlah),0);
  const totalK = allKeluar.reduce((s,r)=>s+numVal(r.jumlah),0);
  const saldo  = totalM - totalK;

  const daysInMonth = new Date(month.split('-')[0], +month.split('-')[1], 0).getDate();
  const avgPerDay   = totalK / daysInMonth;

  q('kpi-masuk').textContent        = formatRp(totalM);
  q('kpi-masuk-count').textContent  = allMasuk.length+' transaksi';
  q('kpi-keluar').textContent       = formatRp(totalK);
  q('kpi-keluar-count').textContent = allKeluar.length+' transaksi';
  q('kpi-saldo').textContent        = formatRp(saldo);
  q('kpi-avg').textContent          = formatRp(Math.round(avgPerDay));

  const pct = totalM>0 ? Math.round((saldo/totalM)*100) : 0;
  q('kpi-saldo-pct').textContent = saldo>=0 ? (pct+'% dari pendapatan tersisa') : 'Defisit pengeluaran';

  const saldoCard = document.getElementById('kpi-saldo-card');
  const saldoIco  = document.getElementById('kpi-saldo-ico');
  if (saldoCard) saldoCard.className = 'kpi-card '+(saldo>=0?'kpi-green':'kpi-minus');
  if (saldoIco)  saldoIco.className  = 'kpi-ico '+(saldo>=0?'green':'red');
  if (saldoIco)  saldoIco.textContent = saldo>=0?'✓':'!';

  const warnEl = document.getElementById('dash-saldo-warning');
  if (warnEl) warnEl.classList.toggle('hidden', saldo>=0);

  renderTrendChart();
  renderKategoriChart(month, allKeluar, totalK);
  renderRecentTransactions();
}

function renderTrendChart() {
  const months = [];
  const dataMasuk = [];
  const dataKeluar = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    const m = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('id-ID',{month:'short'});
    months.push(label);
    dataMasuk.push( ls('fk_pemasukan',[]).filter(r=>r.tanggal?.startsWith(m)).reduce((s,r)=>s+numVal(r.jumlah),0) );
    dataKeluar.push( ls('fk_pengeluaran',[]).filter(r=>r.tanggal?.startsWith(m)).reduce((s,r)=>s+numVal(r.jumlah),0) );
  }
  const ctx = document.getElementById('chart-trend');
  if (!ctx) return;
  if (chartTrend) { chartTrend.destroy(); chartTrend=null; }
  chartTrend = new Chart(ctx, {
    type:'line',
    data:{ labels:months,
      datasets:[
        { label:'Pendapatan', data:dataMasuk,  borderColor:'#40916C', backgroundColor:'rgba(64,145,108,.08)', tension:.4, fill:true, pointBackgroundColor:'#40916C', pointRadius:4 },
        { label:'Pengeluaran',data:dataKeluar, borderColor:'#C0392B', backgroundColor:'rgba(192,57,43,.06)',  tension:.4, fill:true, pointBackgroundColor:'#C0392B', pointRadius:4 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:11} } } },
      scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>formatRpShort(v), font:{size:10} }, grid:{color:'rgba(0,0,0,.05)'} },
               x:{ ticks:{ font:{size:10} }, grid:{display:false} } }
    }
  });
}

function renderKategoriChart(month, allKeluar, totalK) {
  const katMap = {};
  allKeluar.forEach(r => { katMap[r.kategori] = (katMap[r.kategori]||0)+numVal(r.jumlah); });
  const sorted = Object.entries(katMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const labels = sorted.map(x=>x[0]);
  const vals   = sorted.map(x=>x[1]);

  const ctx = document.getElementById('chart-kategori');
  const dc  = document.getElementById('donut-center');
  if (!ctx) return;
  if (chartKat) { chartKat.destroy(); chartKat=null; }

  if (!vals.length) {
    if (dc) dc.innerHTML = '<div class="donut-lbl">Tidak ada data</div>';
    return;
  }
  if (dc) dc.innerHTML = `<div class="donut-val">${formatRpShort(totalK)}</div><div class="donut-lbl">Total</div>`;

  const mLabel = new Date(month+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  const pLabel = document.getElementById('dash-chart-period');
  if (pLabel) pLabel.textContent = mLabel;

  chartKat = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data:vals, backgroundColor:CHART_COLORS.slice(0,labels.length), borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{ position:'right', labels:{ boxWidth:11, font:{size:10}, padding:8 } },
        tooltip:{ callbacks:{ label:c=>` ${c.label}: ${formatRp(c.raw)} (${Math.round(c.raw/totalK*100)}%)` } } }
    }
  });
}

function renderRecentTransactions() {
  const masuk  = ls('fk_pemasukan',[]).map(r=>({...r,_t:'masuk'}));
  const keluar = ls('fk_pengeluaran',[]).map(r=>({...r,_t:'keluar'}));
  const all = [...masuk,...keluar].sort((a,b)=>b.tanggal.localeCompare(a.tanggal)||b.ts-a.ts).slice(0,10);
  const tbody = document.getElementById('tbody-recent');
  if (!tbody) return;
  if (!all.length) { tbody.innerHTML='<tr><td colspan="5" class="empty-row">Belum ada transaksi</td></tr>'; return; }
  tbody.innerHTML = all.map(r=>`
    <tr>
      <td>${formatDate(r.tanggal)}</td>
      <td><span class="${r._t==='masuk'?'tipe-masuk':'tipe-keluar'}">${r._t==='masuk'?'↑ Pendapatan':'↓ Pengeluaran'}</span></td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:${r._t==='masuk'?'#27AE60':'#C0392B'}">${r._t==='masuk'?'+':'-'}${formatRp(numVal(r.jumlah))}</td>
    </tr>`).join('');
}

// ===== PEMASUKAN =====
function renderPemasukanTable() {
  let data = ls('fk_pemasukan',[]);
  const fm = document.getElementById('filter-pemasukan-month')?.value;
  if (fm) data = data.filter(r=>r.tanggal?.startsWith(fm));
  data.sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  const tbody = document.getElementById('tbody-pemasukan');
  const totalRow = document.getElementById('total-row-pemasukan');
  if (!data.length) {
    tbody.innerHTML='<tr><td colspan="5" class="empty-row">Belum ada data pendapatan</td></tr>';
    if (totalRow) totalRow.style.display='none';
    return;
  }
  const total = data.reduce((s,r)=>s+numVal(r.jumlah),0);
  tbody.innerHTML = data.map(r=>`
    <tr>
      <td>${formatDate(r.tanggal)}</td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:#27AE60">+${formatRp(numVal(r.jumlah))}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="editPemasukan('${r.id}')">Edit</button>
        <button class="btn-danger" onclick="confirmDelete('pemasukan','${r.id}','Hapus data pendapatan ini?')">Hapus</button>
      </div></td>
    </tr>`).join('');
  if (totalRow) { totalRow.textContent='Total: '+formatRp(total); totalRow.style.display='block'; }
  updateSaldoSummary();
}

function savePemasukan() {
  const tanggal   = q('in-masuk-tanggal').value;
  const kategori  = q('in-masuk-kategori').value;
  const keterangan= q('in-masuk-keterangan').value.trim();
  const jumlah    = parseAmount(q('in-masuk-jumlah').value);
  const editId    = q('edit-masuk-id').value;
  if (!tanggal||!kategori||jumlah<=0) { showToast('Lengkapi semua field yang wajib!','error'); return; }

  let data = ls('fk_pemasukan',[]);
  if (editId) {
    const idx = data.findIndex(r=>r.id===editId);
    if (idx>=0) { data[idx] = {...data[idx], tanggal, kategori, keterangan, jumlah}; }
    showToast('Data pendapatan diperbarui','success');
  } else {
    const rec = { id:uid(), tanggal, kategori, keterangan, jumlah, user:currentUser.username, ts:Date.now() };
    data.push(rec);
    saveToGS('pemasukan', rec);
    showToast('Pendapatan berhasil disimpan','success');
  }
  ss('fk_pemasukan', data);
  closeModal('modal-add-pemasukan');
  clearForm(['in-masuk-tanggal','in-masuk-keterangan','in-masuk-jumlah']); q('edit-masuk-id').value='';
  renderPemasukanTable(); updateSaldoSummary();
}

function editPemasukan(id) {
  const r = ls('fk_pemasukan',[]).find(x=>x.id===id);
  if (!r) return;
  q('modal-masuk-title').textContent = 'Edit Pendapatan';
  q('edit-masuk-id').value    = id;
  q('in-masuk-tanggal').value = r.tanggal;
  q('in-masuk-keterangan').value = r.keterangan||'';
  q('in-masuk-jumlah').value  = formatAmountDisplay(numVal(r.jumlah));
  populateKatSelect('in-masuk-kategori','masuk');
  q('in-masuk-kategori').value = r.kategori;
  openModal('modal-add-pemasukan');
}

function deletePemasukan(id) {
  let data = ls('fk_pemasukan',[]).filter(r=>r.id!==id);
  ss('fk_pemasukan', data);
  deleteFromGS('pemasukan', id);
  renderPemasukanTable(); updateSaldoSummary();
  showToast('Data dihapus','success');
}

function updateSaldoSummary() {
  const totalM = ls('fk_pemasukan',[]).reduce((s,r)=>s+numVal(r.jumlah),0);
  const totalK = ls('fk_pengeluaran',[]).reduce((s,r)=>s+numVal(r.jumlah),0);
  const saldo  = totalM - totalK;
  setTxt('total-pendapatan', formatRp(totalM));
  setTxt('total-pengeluaran-sum', formatRp(totalK));
  setTxt('saldo-bersih', formatRp(saldo));
  const card  = document.getElementById('saldo-card');
  const ico   = document.getElementById('saldo-icon');
  const warn  = document.getElementById('saldo-warning');
  if (card) card.className = 'sum-card '+(saldo>=0?'green':'minus');
  if (ico)  ico.textContent = saldo>=0?'≈':'!';
  if (warn) warn.classList.toggle('hidden', saldo>=0);
}

// ===== PENGELUARAN =====
function populateFilterKat() {
  const sel = document.getElementById('filter-pengeluaran-kat');
  if (!sel) return;
  const cats = ls('fk_kat_keluar',[]);
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c=>`<option value="${esc(c)}" ${cur===c?'selected':''}>${esc(c)}</option>`).join('');
}

function resetFilterPengeluaran() {
  const m = document.getElementById('filter-pengeluaran-month');
  const k = document.getElementById('filter-pengeluaran-kat');
  if (m) m.value=''; if (k) k.value='';
  renderPengeluaranTable();
}

function renderPengeluaranTable() {
  let data = ls('fk_pengeluaran',[]);
  const fm  = document.getElementById('filter-pengeluaran-month')?.value;
  const fk  = document.getElementById('filter-pengeluaran-kat')?.value;
  if (fm) data = data.filter(r=>r.tanggal?.startsWith(fm));
  if (fk) data = data.filter(r=>r.kategori===fk);
  data.sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  const tbody    = document.getElementById('tbody-pengeluaran');
  const totalRow = document.getElementById('total-row-pengeluaran');
  if (!data.length) {
    tbody.innerHTML='<tr><td colspan="6" class="empty-row">Belum ada data pengeluaran</td></tr>';
    if (totalRow) totalRow.style.display='none';
    updatePengeluaranSummary(); return;
  }
  const total = data.reduce((s,r)=>s+numVal(r.jumlah),0);
  const isAdmin = currentUser.role==='admin';
  tbody.innerHTML = data.map(r=>{
    const nota = r.notaUrl
      ? `<a href="${r.notaUrl}" target="_blank" class="nota-link">📎 ${esc(r.notaName||'Nota')}</a>`
      : '<span style="color:var(--text-l);font-size:.8rem">—</span>';
    const delBtn = isAdmin ? `<button class="btn-danger" onclick="confirmDelete('pengeluaran','${r.id}','Hapus data pengeluaran ini?')">Hapus</button>` : '';
    return `<tr>
      <td>${formatDate(r.tanggal)}</td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell" style="color:#C0392B">-${formatRp(numVal(r.jumlah))}</td>
      <td>${nota}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="editPengeluaran('${r.id}')">Edit</button>
        ${delBtn}
      </div></td>
    </tr>`;
  }).join('');
  if (totalRow) { totalRow.textContent='Total: '+formatRp(total); totalRow.style.display='block'; }
  updatePengeluaranSummary();
}

function updatePengeluaranSummary() {
  const now = new Date();
  const m   = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const monthData = ls('fk_pengeluaran',[]).filter(r=>r.tanggal?.startsWith(m));
  const total  = monthData.reduce((s,r)=>s+numVal(r.jumlah),0);
  const count  = monthData.length;
  const days   = new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const avg    = total/days;
  setTxt('pengeluaran-bulan-ini', formatRp(total));
  setTxt('pengeluaran-count', count);
  setTxt('pengeluaran-avg', formatRp(Math.round(avg)));
}

function savePengeluaran() {
  const tanggal    = q('in-keluar-tanggal').value;
  const kategori   = q('in-keluar-kategori').value;
  const keterangan = q('in-keluar-keterangan').value.trim();
  const jumlah     = parseAmount(q('in-keluar-jumlah').value);
  const editId     = q('edit-keluar-id').value;
  if (!tanggal||!kategori||jumlah<=0) { showToast('Lengkapi semua field yang wajib!','error'); return; }

  let data = ls('fk_pengeluaran',[]);
  if (editId) {
    const idx = data.findIndex(r=>r.id===editId);
    if (idx>=0) { data[idx] = {...data[idx], tanggal, kategori, keterangan, jumlah}; }
    ss('fk_pengeluaran', data);
    closeModal('modal-add-pengeluaran');
    clearPengeluaranForm();
    renderPengeluaranTable(); updatePengeluaranSummary();
    showToast('Data pengeluaran diperbarui','success');
  } else {
    const rec = { id:uid(), tanggal, kategori, keterangan, jumlah, user:currentUser.username, ts:Date.now() };
    if (selectedNotaFile) {
      uploadToGDrive(selectedNotaFile, rec.id)
        .then(url => { rec.notaUrl=url; rec.notaName=selectedNotaFile.name; })
        .catch(()  => { /* store locally without URL */ })
        .finally(() => {
          // Store base64 locally as fallback
          fileToBase64(selectedNotaFile).then(b64=>{
            if(!rec.notaUrl){ rec.notaLocalData='data:'+selectedNotaFile.type+';base64,'+b64; rec.notaName=selectedNotaFile.name; rec.notaUrl=rec.notaLocalData; }
            data.push(rec); ss('fk_pengeluaran', data);
            saveToGS('pengeluaran', rec);
            closeModal('modal-add-pengeluaran');
            clearPengeluaranForm();
            renderPengeluaranTable(); updatePengeluaranSummary();
            showToast('Pengeluaran berhasil disimpan','success');
          });
        });
      return;
    }
    data.push(rec); ss('fk_pengeluaran', data);
    saveToGS('pengeluaran', rec);
    closeModal('modal-add-pengeluaran');
    clearPengeluaranForm();
    renderPengeluaranTable(); updatePengeluaranSummary();
    showToast('Pengeluaran berhasil disimpan','success');
  }
}

function editPengeluaran(id) {
  const r = ls('fk_pengeluaran',[]).find(x=>x.id===id);
  if (!r) return;
  q('modal-keluar-title').textContent = 'Edit Pengeluaran';
  q('edit-keluar-id').value     = id;
  q('in-keluar-tanggal').value  = r.tanggal;
  q('in-keluar-keterangan').value = r.keterangan||'';
  q('in-keluar-jumlah').value   = formatAmountDisplay(numVal(r.jumlah));
  populateKatSelect('in-keluar-kategori','keluar');
  q('in-keluar-kategori').value = r.kategori;
  selectedNotaFile = null;
  const prev = document.getElementById('nota-preview');
  if (prev) { prev.classList.add('hidden'); }
  if (r.notaName) {
    prev.classList.remove('hidden');
    prev.textContent = '📎 '+r.notaName+' (sudah ada)';
  }
  openModal('modal-add-pengeluaran');
}

function deletePengeluaran(id) {
  let data = ls('fk_pengeluaran',[]).filter(r=>r.id!==id);
  ss('fk_pengeluaran', data);
  deleteFromGS('pengeluaran', id);
  renderPengeluaranTable(); updatePengeluaranSummary();
  showToast('Data dihapus','success');
}

function clearPengeluaranForm() {
  clearForm(['in-keluar-tanggal','in-keluar-keterangan','in-keluar-jumlah']);
  q('edit-keluar-id').value = '';
  q('modal-keluar-title').textContent = 'Tambah Pengeluaran';
  q('in-keluar-nota').value = '';
  selectedNotaFile = null;
  const prev = document.getElementById('nota-preview');
  if (prev) prev.classList.add('hidden');
}

// ===== FILE UPLOAD =====
function handleFileSelect(input) {
  if (input.files[0]) { selectedNotaFile = input.files[0]; showNotaPreview(input.files[0].name); }
}
function handleDragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function handleDragLeave(e){ document.getElementById('upload-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) { selectedNotaFile = file; showNotaPreview(file.name); }
}
function showNotaPreview(name) {
  const prev = document.getElementById('nota-preview');
  if (prev) { prev.classList.remove('hidden'); prev.textContent = '📎 '+name; }
}

// ===== KATEGORI =====
function populateKatSelect(selId, type) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cats = ls(type==='masuk'?'fk_kat_masuk':'fk_kat_keluar',[]);
  const cur  = sel.value;
  sel.innerHTML = cats.map(c=>`<option value="${esc(c)}" ${cur===c?'selected':''}>${esc(c)}</option>`).join('');
}
function renderKatList(type) {
  const listId = type==='masuk' ? 'list-kategori-masuk' : 'list-kategori-keluar';
  const key    = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const cats   = ls(key,[]);
  const isAdmin = currentUser.role==='admin';
  document.getElementById(listId).innerHTML = cats.map((c,i)=>`
    <li>
      <span>${esc(c)}</span>
      ${isAdmin?`<button class="btn-danger" onclick="deleteKategori('${type}',${i})">Hapus</button>`:''}
    </li>`).join('');
}
function addKategori(type) {
  const inpId = type==='masuk' ? 'new-kategori-masuk' : 'new-kategori-keluar';
  const key   = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const val   = document.getElementById(inpId).value.trim();
  if (!val) { showToast('Nama kategori tidak boleh kosong','error'); return; }
  const cats  = ls(key,[]);
  if (cats.includes(val)) { showToast('Kategori sudah ada','error'); return; }
  cats.push(val); ss(key, cats);
  document.getElementById(inpId).value='';
  renderKatList(type);
  showToast('Kategori ditambahkan','success');
}
function deleteKategori(type, idx) {
  const key  = type==='masuk' ? 'fk_kat_masuk' : 'fk_kat_keluar';
  const cats = ls(key,[]);
  cats.splice(idx,1); ss(key, cats);
  renderKatList(type);
  showToast('Kategori dihapus','success');
}

// ===== LAPORAN =====
function setupLaporanFilters() {
  const m = nowMonth();
  ['keluar','masuk','gab'].forEach(t => {
    const el = document.getElementById('lap-month-'+t);
    if (el && !el.value) el.value = m;
  });
}
function switchLaporan(btn, name) {
  document.querySelectorAll('.lap-content').forEach(el=>{ el.classList.remove('active'); el.style.display='none'; });
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const content = document.getElementById('lap-'+name);
  if (content) { content.classList.add('active'); content.style.display='block'; }
  btn.classList.add('active');
  renderLaporan(name);
}
function getLaporanFilter(name) {
  const suffix = name==='pengeluaran-lap'?'keluar': name==='pendapatan-lap'?'masuk':'gab';
  const type  = document.getElementById('lap-type-'+suffix)?.value||'bulanan';
  const date  = document.getElementById('lap-date-'+suffix)?.value;
  const month = document.getElementById('lap-month-'+suffix)?.value;
  const year  = document.getElementById('lap-year-'+suffix)?.value;
  // Show/hide filter inputs
  const dateEl  = document.getElementById('lap-date-'+suffix);
  const monthEl = document.getElementById('lap-month-'+suffix);
  const yearEl  = document.getElementById('lap-year-'+suffix);
  if (dateEl)  dateEl.style.display  = type==='harian'  ? '' : 'none';
  if (monthEl) monthEl.style.display = type==='bulanan' ? '' : 'none';
  if (yearEl)  yearEl.style.display  = type==='tahunan' ? '' : 'none';
  return { type, date, month, year };
}
function filterData(data, { type, date, month, year }) {
  if (type==='harian'  && date)  return data.filter(r=>r.tanggal===date);
  if (type==='bulanan' && month) return data.filter(r=>r.tanggal?.startsWith(month));
  if (type==='tahunan' && year)  return data.filter(r=>r.tanggal?.startsWith(year));
  return data;
}
function renderLaporan(name) {
  const f = getLaporanFilter(name);
  const masuk  = filterData(ls('fk_pemasukan',[]),  f).sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  const keluar = filterData(ls('fk_pengeluaran',[]),f).sort((a,b)=>a.tanggal.localeCompare(b.tanggal));

  if (name==='pengeluaran-lap') {
    renderLaporanTable('tbody-lap-keluar','lap-total-keluar', keluar, 'keluar');
    renderLapKatChart(keluar);
  }
  if (name==='pendapatan-lap') renderLaporanTable('tbody-lap-masuk','lap-total-masuk', masuk, 'masuk');
  if (name==='gabungan-lap') {
    const gab = [ ...masuk.map(r=>({...r,_t:'Pendapatan'})), ...keluar.map(r=>({...r,_t:'Pengeluaran'})) ]
      .sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    const tbody = document.getElementById('tbody-lap-gab');
    if (!gab.length) { tbody.innerHTML='<tr><td colspan="5" class="empty-row">Tidak ada data</td></tr>'; document.getElementById('lap-total-gab').innerHTML=''; return; }
    tbody.innerHTML = gab.map(r=>`<tr>
      <td>${formatDate(r.tanggal)}</td>
      <td><span class="${r._t==='Pendapatan'?'tipe-masuk':'tipe-keluar'}">${r._t}</span></td>
      <td><span class="kat-badge">${esc(r.kategori)}</span></td>
      <td>${esc(r.keterangan||'—')}</td>
      <td class="text-right amount-cell">${formatRp(numVal(r.jumlah))}</td>
    </tr>`).join('');
    const tm = masuk.reduce((s,r)=>s+numVal(r.jumlah),0);
    const tk = keluar.reduce((s,r)=>s+numVal(r.jumlah),0);
    const sl = tm-tk;
    document.getElementById('lap-total-gab').innerHTML =
      `<span>Pendapatan: ${formatRp(tm)}</span><span>Pengeluaran: ${formatRp(tk)}</span>` +
      `<span style="color:${sl>=0?'var(--primary)':'var(--danger)'}">Saldo: ${formatRp(sl)}</span>`;
  }
}
function renderLaporanTable(tbodyId, totalId, data, type) {
  const tbody   = document.getElementById(tbodyId);
  const totalEl = document.getElementById(totalId);
  if (!data.length) { tbody.innerHTML='<tr><td colspan="4" class="empty-row">Tidak ada data untuk filter ini</td></tr>'; if(totalEl)totalEl.textContent=''; return; }
  tbody.innerHTML = data.map(r=>`<tr>
    <td>${formatDate(r.tanggal)}</td>
    <td><span class="kat-badge">${esc(r.kategori)}</span></td>
    <td>${esc(r.keterangan||'—')}</td>
    <td class="text-right amount-cell">${formatRp(numVal(r.jumlah))}</td>
  </tr>`).join('');
  const total = data.reduce((s,r)=>s+numVal(r.jumlah),0);
  if (totalEl) totalEl.textContent = (type==='masuk'?'Total Pendapatan':'Total Pengeluaran')+': '+formatRp(total);
}
function renderLapKatChart(data) {
  const ctx = document.getElementById('lap-chart-kat-keluar');
  if (!ctx) return;
  if (chartLapKat) { chartLapKat.destroy(); chartLapKat=null; }
  const katMap = {};
  data.forEach(r=>{ katMap[r.kategori]=(katMap[r.kategori]||0)+numVal(r.jumlah); });
  const sorted = Object.entries(katMap).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) return;
  chartLapKat = new Chart(ctx,{
    type:'bar',
    data:{ labels:sorted.map(x=>x[0]), datasets:[{label:'Total',data:sorted.map(x=>x[1]),backgroundColor:CHART_COLORS.slice(0,sorted.length),borderRadius:6}] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>formatRp(c.raw)}} },
      scales:{ x:{ticks:{callback:v=>formatRpShort(v),font:{size:10}},grid:{color:'rgba(0,0,0,.05)'}}, y:{ticks:{font:{size:10}}} }
    }
  });
}

// ===== USER MANAGEMENT =====
function renderUserTable() {
  const users = ls('fk_users',[]);
  document.getElementById('tbody-users').innerHTML = users.map((u,i)=>`
    <tr>
      <td>${i+1}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.fullname||'—')}</td>
      <td><span style="background:${u.role==='admin'?'var(--primary-xl)':'var(--surface2)'};color:${u.role==='admin'?'var(--primary)':'var(--text-m)'};padding:.15rem .5rem;border-radius:4px;font-size:.76rem;font-weight:600">${u.role==='admin'?'Admin':'User'}</span></td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="openResetPass('${esc(u.username)}')">Reset PW</button>
        ${u.username!==currentUser.username?`<button class="btn-danger" onclick="confirmDelete('user','${esc(u.username)}','Hapus user ${esc(u.username)}?')">Hapus</button>`:'<span style="font-size:.76rem;color:var(--text-l)">(Anda)</span>'}
      </div></td>
    </tr>`).join('');
}
function addUser() {
  const username = q('new-user-username').value.trim();
  const fullname = q('new-user-fullname').value.trim();
  const password = q('new-user-pass').value;
  const role     = q('new-user-role').value;
  if (!username||!password) { showToast('Username dan password wajib diisi','error'); return; }
  const users = ls('fk_users',[]);
  if (users.find(u=>u.username===username)) { showToast('Username sudah ada','error'); return; }
  users.push({username,fullname,password,role});
  ss('fk_users', users);
  closeModal('modal-add-user');
  ['new-user-username','new-user-fullname','new-user-pass'].forEach(id=>q(id).value='');
  renderUserTable();
  showToast('Pengguna berhasil ditambahkan','success');
}
function deleteUser(username) {
  let users = ls('fk_users',[]).filter(u=>u.username!==username);
  ss('fk_users', users);
  renderUserTable();
  showToast('Pengguna dihapus','success');
}
let resetTargetUser = null;
function openResetPass(username) {
  resetTargetUser = username;
  q('reset-target-user').textContent = username;
  q('reset-new-pass').value = '';
  openModal('modal-reset-pass');
}
function doResetPassword() {
  const np = q('reset-new-pass').value;
  if (!np) { showToast('Password baru tidak boleh kosong','error'); return; }
  const users = ls('fk_users',[]);
  const idx   = users.findIndex(u=>u.username===resetTargetUser);
  if (idx>=0) { users[idx].password=np; ss('fk_users', users); }
  closeModal('modal-reset-pass');
  showToast('Password berhasil direset','success');
}

// ===== CONFIRM DIALOG =====
function confirmDelete(type, id, msg) {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-title').textContent = 'Konfirmasi Hapus';
  confirmCallback = () => {
    if (type==='pemasukan')   deletePemasukan(id);
    if (type==='pengeluaran') deletePengeluaran(id);
    if (type==='user')        deleteUser(id);
    closeModal('modal-confirm');
  };
  openModal('modal-confirm');
}
function confirmOk() { if (confirmCallback) confirmCallback(); }

// ===== MODALS =====
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  if (id==='modal-manage-kategori-masuk')  renderKatList('masuk');
  if (id==='modal-manage-kategori-keluar') renderKatList('keluar');
  if (id==='modal-add-pemasukan') {
    populateKatSelect('in-masuk-kategori','masuk');
    if (!q('edit-masuk-id').value) { q('modal-masuk-title').textContent='Tambah Pendapatan'; setDefaultDate('in-masuk-tanggal'); }
  }
  if (id==='modal-add-pengeluaran') {
    populateKatSelect('in-keluar-kategori','keluar');
    if (!q('edit-keluar-id').value) { q('modal-keluar-title').textContent='Tambah Pengeluaran'; setDefaultDate('in-keluar-tanggal'); }
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
  // reset add forms on close
  if (id==='modal-add-pemasukan')   { q('edit-masuk-id').value=''; q('modal-masuk-title').textContent='Tambah Pendapatan'; }
  if (id==='modal-add-pengeluaran') { q('edit-keluar-id').value=''; q('modal-keluar-title').textContent='Tambah Pengeluaran'; selectedNotaFile=null; }
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  if (!e.target.closest('.form-group') && !e.target.classList.contains('cal-day') &&
      !e.target.classList.contains('cal-nav') && !e.target.classList.contains('cal-manual')) {
    document.querySelectorAll('.cal-wrap:not(.hidden)').forEach(el => el.classList.add('hidden'));
  }
});

// ===== DATE PICKER =====
const calState = {};
function showDatePicker(input) {
  // hide others first
  document.querySelectorAll('.cal-wrap').forEach(el => el.classList.add('hidden'));
  const calId = 'cal-'+input.id;
  const wrap  = document.getElementById(calId);
  if (!wrap) return;
  wrap.classList.remove('hidden');
  if (!calState[input.id]) {
    const now = new Date();
    calState[input.id] = { year: now.getFullYear(), month: now.getMonth() };
  }
  renderCal(input.id);
}
function renderCal(inputId) {
  const wrap = document.getElementById('cal-'+inputId);
  if (!wrap) return;
  const { year, month } = calState[inputId];
  const sel = q(inputId).value;
  const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DAYS   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const first  = new Date(year, month, 1).getDay();
  const total  = new Date(year, month+1, 0).getDate();
  const today  = new Date();
  const todayStr = fmt(today.getFullYear())+'-'+fmt(today.getMonth()+1)+'-'+fmt(today.getDate());
  let cells = '';
  for (let i=0;i<first;i++) cells += '<div class="cal-day empty"></div>';
  for (let d=1;d<=total;d++) {
    const ds = fmt(year)+'-'+fmt(month+1)+'-'+fmt(d);
    const cls = [
      'cal-day',
      ds===sel  ? 'selected' : '',
      ds===todayStr ? 'today' : ''
    ].filter(Boolean).join(' ');
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
    <input type="text" class="cal-manual" placeholder="YYYY-MM-DD" value="${sel}"
      onchange="manualDate('${inputId}',this.value)" oninput="manualDate('${inputId}',this.value)">`;
}
function calNav(inputId, dir, e) {
  e.stopPropagation();
  calState[inputId].month += dir;
  if (calState[inputId].month>11) { calState[inputId].month=0; calState[inputId].year++; }
  if (calState[inputId].month<0)  { calState[inputId].month=11; calState[inputId].year--; }
  renderCal(inputId);
}
function selectDate(inputId, ds) {
  q(inputId).value = ds;
  document.getElementById('cal-'+inputId).classList.add('hidden');
}
function manualDate(inputId, val) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    q(inputId).value = val;
    const d = new Date(val);
    calState[inputId] = { year:d.getFullYear(), month:d.getMonth() };
    renderCal(inputId);
  }
}
function setDefaultDate(inputId) {
  const el = q(inputId);
  if (el && !el.value) {
    const n = new Date();
    el.value = fmt(n.getFullYear())+'-'+fmt(n.getMonth()+1)+'-'+fmt(n.getDate());
  }
}

// ===== AMOUNT INPUT =====
function formatAmountInput(input) {
  const raw = input.value.replace(/\D/g,'');
  input.value = raw ? Number(raw).toLocaleString('id-ID') : '';
}
function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g,'').replace(/,/g,'.')) || 0;
}
function formatAmountDisplay(n) { return Math.round(n).toLocaleString('id-ID'); }

// ===== EXPORT =====
function getExportRows(type) {
  if (type==='pemasukan') {
    let d = ls('fk_pemasukan',[]);
    const m = document.getElementById('filter-pemasukan-month')?.value;
    if (m) d = d.filter(r=>r.tanggal?.startsWith(m));
    d.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:d.map(r=>[formatDate(r.tanggal),r.kategori,r.keterangan||'',numVal(r.jumlah)]), title:'Pendapatan' };
  }
  if (type==='pengeluaran') {
    let d = ls('fk_pengeluaran',[]);
    const m = document.getElementById('filter-pengeluaran-month')?.value;
    const k = document.getElementById('filter-pengeluaran-kat')?.value;
    if (m) d = d.filter(r=>r.tanggal?.startsWith(m));
    if (k) d = d.filter(r=>r.kategori===k);
    d.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    return { headers:['Tanggal','Kategori','Keterangan','Jumlah','Nota'], rows:d.map(r=>[formatDate(r.tanggal),r.kategori,r.keterangan||'',numVal(r.jumlah),r.notaUrl&&!r.notaUrl.startsWith('data:')?r.notaUrl:'']), title:'Pengeluaran' };
  }
  return { headers:[], rows:[], title:'' };
}
function exportData(type, fmt) {
  const { headers, rows, title } = getExportRows(type);
  doExport(headers, rows, title, fmt);
}
function getLaporanRows(name) {
  const f = getLaporanFilter(name);
  const masuk  = filterData(ls('fk_pemasukan',[]),  f);
  const keluar = filterData(ls('fk_pengeluaran',[]),f);
  if (name==='pengeluaran-lap') return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:keluar.map(r=>[formatDate(r.tanggal),r.kategori,r.keterangan||'',numVal(r.jumlah)]), title:'Laporan Pengeluaran' };
  if (name==='pendapatan-lap')  return { headers:['Tanggal','Kategori','Keterangan','Jumlah'], rows:masuk.map(r=>[formatDate(r.tanggal),r.kategori,r.keterangan||'',numVal(r.jumlah)]),  title:'Laporan Pendapatan' };
  const gab = [...masuk.map(r=>({...r,_t:'Pendapatan'})),...keluar.map(r=>({...r,_t:'Pengeluaran'}))].sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
  return { headers:['Tanggal','Tipe','Kategori','Keterangan','Jumlah'], rows:gab.map(r=>[formatDate(r.tanggal),r._t,r.kategori,r.keterangan||'',numVal(r.jumlah)]), title:'Laporan Gabungan' };
}
function exportLaporan(name, f) { const { headers, rows, title } = getLaporanRows(name); doExport(headers, rows, title, f); }
function printLaporan(name)     { const { headers, rows, title } = getLaporanRows(name); doPrint(headers, rows.map(r=>r.map((c,i)=>i===r.length-1?formatRp(c):c)), title); }
function printData(type)        { const { headers, rows, title } = getExportRows(type);  doPrint(headers, rows.map(r=>r.map((c,i)=>i===r.length-1&&typeof c==='number'?formatRp(c):c)), title); }

function doExport(headers, rows, title, format) {
  if (format==='excel') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers,...rows]), title);
    XLSX.writeFile(wb, title+'_'+today()+'.xlsx');
    showToast('File Excel berhasil diunduh','success');
  }
  if (format==='csv') {
    const lines = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','));
    downloadBlob(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}), title+'_'+today()+'.csv');
    showToast('File CSV berhasil diunduh','success');
  }
  if (format==='pdf') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('FinansialKu – '+title, 14, 16);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text('Dicetak: '+new Date().toLocaleString('id-ID'), 14, 22);
    doc.autoTable({startY:26, head:[headers], body:rows, theme:'grid',
      headStyles:{fillColor:[45,106,79],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[240,248,243]}, styles:{fontSize:8,cellPadding:2}});
    doc.save(title+'_'+today()+'.pdf');
    showToast('File PDF berhasil diunduh','success');
  }
}
function doPrint(headers, rows, title) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#1C2E24}
  h2{color:#2D6A4F;margin-bottom:6px}p{font-size:9px;color:#666;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#2D6A4F;color:white;padding:6px 8px;text-align:left;font-size:10px}
  td{padding:5px 8px;border-bottom:1px solid #E0EAE5;font-size:10px}
  tr:nth-child(even){background:#F0FAF4}
  .footer{margin-top:16px;font-size:9px;color:#888;border-top:1px solid #ccc;padding-top:8px}
  @media print{body{padding:10px}}</style></head><body>
  <h2>${title}</h2><p>Dicetak: ${new Date().toLocaleString('id-ID')} &bull; Oleh: ${currentUser.fullname||currentUser.username}</p>
  <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <div class="footer">FinansialKu &copy; 2026 Sang Petualang Corp &bull; Beta 0526.1</div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 400);
}

// ===== HELPERS =====
const q   = id => document.getElementById(id);
const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n  => String(n).padStart(2,'0');
const show   = id => { const el=q(id); if(el) el.classList.remove('hidden'); };
const hide   = id => { const el=q(id); if(el) el.classList.add('hidden'); };
const unhide = id => show(id);
const setTxt = (id,v) => { const el=q(id); if(el) el.textContent=v; };

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function numVal(v) { return parseFloat(v)||0; }
function nowMonth() { const n=new Date(); return n.getFullYear()+'-'+fmt(n.getMonth()+1); }
function today() { const n=new Date(); return fmt(n.getFullYear())+fmt(n.getMonth()+1)+fmt(n.getDate()); }

function formatRp(n) { return 'Rp '+Math.round(numVal(n)).toLocaleString('id-ID'); }
function formatRpShort(n) {
  n = numVal(n);
  if (n>=1e9) return 'Rp '+(n/1e9).toFixed(1)+' M';
  if (n>=1e6) return 'Rp '+(n/1e6).toFixed(1)+' jt';
  if (n>=1e3) return 'Rp '+(n/1e3).toFixed(0)+' rb';
  return 'Rp '+n;
}
function formatDate(d) {
  if (!d) return '—';
  const [y,mo,dd] = d.split('-');
  const MONTHS = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${dd} ${MONTHS[+mo]||mo} ${y}`;
}
function clearForm(ids) { ids.forEach(id=>{ const el=q(id); if(el) el.value=''; }); }
function downloadBlob(blob, name) {
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function clearFilter(id, cb) { const el=q(id); if(el) el.value=''; cb(); }

function showToast(msg, type) {
  const t = q('toast');
  if (!t) return;
  t.textContent=msg; t.className='toast '+(type||''); t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.add('hidden'), 2800);
}

// ===== BOOT =====
window.addEventListener('DOMContentLoaded', init);

// ===== SAMPLE DATA SEEDER =====
function seedSampleData() {
  const now = new Date();
  const y  = now.getFullYear();
  const m  = String(now.getMonth()+1).padStart(2,'0');
  const pm = String(now.getMonth()===0 ? 12 : now.getMonth()).padStart(2,'0');
  const py = now.getMonth()===0 ? y-1 : y;

  const masuk = [
    {id:'sm01',tanggal:`${y}-${m}-01`,kategori:'Gaji',keterangan:'Gaji bulan ini',jumlah:5000000,user:'admin',ts:Date.now()-20000},
    {id:'sm02',tanggal:`${y}-${m}-10`,kategori:'Side Job',keterangan:'Freelance desain logo',jumlah:800000,user:'admin',ts:Date.now()-19000},
    {id:'sm03',tanggal:`${y}-${m}-15`,kategori:'Bonus',keterangan:'Bonus kinerja triwulan',jumlah:1200000,user:'admin',ts:Date.now()-18000},
    {id:'sm04',tanggal:`${py}-${pm}-01`,kategori:'Gaji',keterangan:'Gaji bulan lalu',jumlah:5000000,user:'admin',ts:Date.now()-17000},
    {id:'sm05',tanggal:`${py}-${pm}-14`,kategori:'Side Job',keterangan:'Proyek website',jumlah:1500000,user:'admin',ts:Date.now()-16000},
    {id:'sm06',tanggal:`${py}-${pm}-20`,kategori:'Hibah / Pemberian',keterangan:'Hadiah ulang tahun',jumlah:300000,user:'admin',ts:Date.now()-15000},
  ];

  const keluar = [
    {id:'sk01',tanggal:`${y}-${m}-01`,kategori:'Makan Keluarga',keterangan:'Makan malam bersama',jumlah:185000,user:'admin',ts:Date.now()-14000},
    {id:'sk02',tanggal:`${y}-${m}-02`,kategori:'Transport',keterangan:'Bensin + parkir',jumlah:75000,user:'user',ts:Date.now()-13000},
    {id:'sk03',tanggal:`${y}-${m}-03`,kategori:'Pulsa - Paket Data Suami',keterangan:'Paket internet 30 hari',jumlah:75000,user:'user',ts:Date.now()-12000},
    {id:'sk04',tanggal:`${y}-${m}-05`,kategori:'Listrik',keterangan:'Tagihan PLN',jumlah:320000,user:'admin',ts:Date.now()-11000},
    {id:'sk05',tanggal:`${y}-${m}-06`,kategori:'Kebutuhan Rumah Tangga',keterangan:'Belanja pasar & supermarket',jumlah:450000,user:'user',ts:Date.now()-10000},
    {id:'sk06',tanggal:`${y}-${m}-08`,kategori:'Makan Sendiri',keterangan:'Makan siang kantor',jumlah:35000,user:'user',ts:Date.now()-9000},
    {id:'sk07',tanggal:`${y}-${m}-09`,kategori:'Jajan Keluarga',keterangan:'Kafe akhir pekan',jumlah:95000,user:'user',ts:Date.now()-8000},
    {id:'sk08',tanggal:`${y}-${m}-12`,kategori:'Donasi',keterangan:'Infaq jumat',jumlah:50000,user:'admin',ts:Date.now()-7000},
    {id:'sk09',tanggal:`${y}-${m}-14`,kategori:'Rekreasi',keterangan:'Tiket wahana anak',jumlah:150000,user:'admin',ts:Date.now()-6000},
    {id:'sk10',tanggal:`${y}-${m}-15`,kategori:'Pulsa - Paket Data Istri',keterangan:'Paket bulanan',jumlah:55000,user:'user',ts:Date.now()-5000},
    {id:'sk11',tanggal:`${py}-${pm}-03`,kategori:'Makan Keluarga',keterangan:'Makan restoran',jumlah:220000,user:'admin',ts:Date.now()-4000},
    {id:'sk12',tanggal:`${py}-${pm}-10`,kategori:'Transport',keterangan:'Grab & bensin',jumlah:120000,user:'user',ts:Date.now()-3000},
    {id:'sk13',tanggal:`${py}-${pm}-18`,kategori:'Kebutuhan Rumah Tangga',keterangan:'Detergen & sabun',jumlah:85000,user:'user',ts:Date.now()-2000},
    {id:'sk14',tanggal:`${py}-${pm}-22`,kategori:'Listrik',keterangan:'Tagihan PLN bulan lalu',jumlah:295000,user:'admin',ts:Date.now()-1000},
  ];

  ss('fk_pemasukan', masuk);
  ss('fk_pengeluaran', keluar);
}
