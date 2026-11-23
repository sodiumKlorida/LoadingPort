// Sinkronisasi posisi kontainer ke tab Google Sheets melalui SheetDB.
// Sheet tab wajib bernama STOWAGE_POSITIONS dan memiliki header sesuai README.
const STOWAGE_SHEET_URL = '/api/sheetdb?sheet=STOWAGE_POSITIONS';
let cloudReady = false;
let cloudBusy = false;
let cloudDirty = false;
let cloudSnapshot = [];
let cloudLocalDirty = false;

const CLOUD_COLUMNS = [
  'id','nomor_container','feet','bay','row','tier','cell_no',
  'type','dir40','loading_port','destination_port','weight_ton','mov','stowage_loading_port','stowage_destination_port','ship_name','voyage','stowage_date','remarks','snapshot_id','record_kind','snapshot_time'
];

function cloudStatus(message, isError = false) {
  const el = document.getElementById('cloudSyncStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `text-[10px] font-semibold ${isError ? 'text-rose-700' : 'text-emerald-700'}`;
}

function recordToSheetRow(r) {
  const layout = r.bay === 'AH' ? null : CELL_LAYOUT[Number(r.slot)];
  return {
    id: String(r.id),
    nomor_container: String(r.number || ''),
    feet: String(r.size || ''),
    bay: String(r.bay),
    row: layout ? String(layout.row) : (Number(r.slot) === 4 ? '4' : '3'),
    tier: layout ? String(layout.tier) : '82',
    cell_no: String(r.cellNo || getCellNo(r.bay, Number(r.slot))),
    type: String(r.type || 'DC'),
    dir40: String(r.dir40 || ''),
    loading_port: String(r.loadingPort || ''),
    destination_port: String(r.port || ''),
    weight_ton: String(r.weight ?? ''),
    mov: String(r.mov ?? 1),
    stowage_loading_port: String($('stowageLoadingPort')?.value || ''),
    stowage_destination_port: String($('stowageDestinationPort')?.value || ''),
    ship_name: String($('shipName')?.value || 'PRAKASA PACIFIC'),
    voyage: String($('voyage')?.value || ''),
    stowage_date: String($('stowageDate')?.value || ''),
    remarks: String(r.remarks || ''),
    snapshot_id: '',
    record_kind: 'CONTAINER',
    snapshot_time: ''
  };
}

function sheetRowToRecord(row) {
  const bayRaw = String(row.bay || '').trim().toUpperCase();
  const bay = bayRaw === 'AH' ? 'AH' : Number(bayRaw);
  const rowNo = Number(row.row);
  const tier = Number(row.tier);
  let slot = null;
  for (const [key, value] of Object.entries(CELL_LAYOUT)) {
    if (value.row === rowNo && value.tier === tier) { slot = Number(key); break; }
  }
  if (bay === 'AH') slot = tier === 82 ? 4 : 3;
  if (!Number.isFinite(bay) && bay !== 'AH') return null;
  if (slot === null || !slotsForBay(bay).includes(slot)) return null;
  return {
    id: String(row.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    bay, slot, cellNo: String(row.cell_no || getCellNo(bay, slot)),
    number: String(row.nomor_container || '').trim().toUpperCase(),
    size: String(row.feet || '20 FT').toUpperCase(),
    type: String(row.type || 'DC').toUpperCase(),
    dir40: row.dir40 === 'forward' || row.dir40 === 'backward' ? row.dir40 : null,
    loadingPort: normalizePort(row.loading_port),
    port: normalizePort(row.destination_port),
    weight: String(row.weight_ton ?? ''),
    mov: Number(row.mov || 1),
    remarks: String(row.remarks || '')
  };
}

async function cloudFetch(url, method = 'GET', body = null) {
  const options = { method, headers: { 'Accept': 'application/json' } };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`SheetDB HTTP ${response.status}`);
  if (method === 'DELETE') return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

function applyCloudStowageMeta(row) {
  if (!row) return;
  if ($('stowageLoadingPort')) $('stowageLoadingPort').value = row.stowage_loading_port || '';
  if ($('stowageDestinationPort')) $('stowageDestinationPort').value = row.stowage_destination_port || '';
  if ($('shipName')) $('shipName').value = row.ship_name || $('shipName').value;
  if ($('voyage')) $('voyage').value = row.voyage || '';
  if ($('stowageDate')) $('stowageDate').value = row.stowage_date || '';
  safeStorageSet('stowageLoadingPort', $('stowageLoadingPort')?.value || '');
  safeStorageSet('stowageDestinationPort', $('stowageDestinationPort')?.value || '');
  safeStorageSet('stowageShip', $('shipName')?.value || 'PRAKASA PACIFIC');
  safeStorageSet('stowageVoyage', $('voyage')?.value || '');
  safeStorageSet('stowageDate', $('stowageDate')?.value || '');
  updateHeaderMeta();
  updateStowageContext();
}

async function loadCloudPositions() {
  const rows = await cloudFetch(STOWAGE_SHEET_URL);
  const markers = rows.filter(r => String(r.record_kind || '').toUpperCase() === 'SNAPSHOT' && r.snapshot_id);
  let selectedRows = rows;
  if (markers.length) {
    const latestMarker = markers[markers.length - 1];
    selectedRows = rows.filter(r => String(r.snapshot_id || '') === String(latestMarker.snapshot_id) &&
      String(r.record_kind || '').toUpperCase() === 'CONTAINER');
    applyCloudStowageMeta(latestMarker);
  } else if (rows.length) {
    // Kompatibilitas dengan data lama sebelum snapshot batch diperkenalkan.
    selectedRows = rows.filter(r => !r.record_kind || String(r.record_kind).toUpperCase() === 'CONTAINER');
    applyCloudStowageMeta(rows[0]);
  }
  const mapped = selectedRows.map(sheetRowToRecord).filter(Boolean);
  records = uniqueStowageRecords(mapped);
  cloudSnapshot = records.map(recordToSheetRow);
  safeStorageSet('stowageRecords', JSON.stringify(records));
  render(false);
  cloudReady = true;
  const duplicatesRemoved = mapped.length - records.length;
  cloudStatus(`Data server dimuat · ${records.length} posisi${duplicatesRemoved ? ` · ${duplicatesRemoved} duplikat diabaikan` : ''}. Unggah manual setelah mengubah stowage.`);
}

// Perubahan disimpan lokal terlebih dahulu. Tidak ada request ke SheetDB
// sampai pengguna menekan tombol Sinkronkan.
function queueCloudSave() {
  cloudLocalDirty = true;
  safeStorageSet('stowageCloudDirty', '1');
  if (cloudReady) {
    cloudStatus('Ada perubahan lokal belum dikirim · tekan Unggah', true);
  }
}

function setSyncButtonBusy(isBusy) {
  const btn = $('manualCloudSyncBtn');
  if (!btn) return;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? 'Memproses...' : '↥ Unggah';
  btn.classList.toggle('opacity-60', isBusy);
  btn.classList.toggle('cursor-not-allowed', isBusy);
}

async function pushLocalChanges() {
  // Satu klik sinkron = satu POST berisi seluruh posisi (bulk snapshot).
  // Snapshot lama tidak dihapus agar sinkronisasi tidak berisiko mengosongkan sheet
  // jika koneksi terputus di tengah proses.
  const snapshotId = `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshotTime = new Date().toISOString();
  const meta = {
    id: snapshotId,
    nomor_container: '',
    feet: '',
    bay: '',
    row: '',
    tier: '',
    cell_no: '',
    type: '',
    dir40: '',
    loading_port: '',
    destination_port: '',
    weight_ton: '',
    mov: '',
    stowage_loading_port: String($('stowageLoadingPort')?.value || ''),
    stowage_destination_port: String($('stowageDestinationPort')?.value || ''),
    ship_name: String($('shipName')?.value || 'PRAKASA PACIFIC'),
    voyage: String($('voyage')?.value || ''),
    stowage_date: String($('stowageDate')?.value || ''),
    remarks: '',
    snapshot_id: snapshotId,
    record_kind: 'SNAPSHOT',
    snapshot_time: snapshotTime
  };
  const rows = [
    meta,
    ...records.map(r => ({
      ...recordToSheetRow(r),
      snapshot_id: snapshotId,
      record_kind: 'CONTAINER',
      snapshot_time: snapshotTime
    }))
  ];
  await cloudFetch(STOWAGE_SHEET_URL, 'POST', { data: rows });
  cloudSnapshot = records.map(recordToSheetRow);
  cloudLocalDirty = false;
  safeStorageSet('stowageCloudDirty', '0');
  cloudStatus(`Berhasil sinkron · ${records.length} kontainer · 1 request`);
}
async function pullLatestChanges() {
  await loadCloudPositions();
  cloudLocalDirty = false;
  safeStorageSet('stowageCloudDirty', '0');
  cloudStatus(`Data terbaru diterima · ${records.length} kontainer · 1 request`);
}
async function manualCloudSync() {
  if (!cloudReady || cloudBusy) return;
  cloudBusy = true;
  setSyncButtonBusy(true);
  try {
    if (cloudLocalDirty || safeStorageGet('stowageCloudDirty') === '1') {
      await pushLocalChanges();
    } else {
      await pullLatestChanges();
    }
  } catch (err) {
    console.error('Sinkronisasi manual gagal:', err);
    cloudLocalDirty = true;
    safeStorageSet('stowageCloudDirty', '1');
    cloudStatus(`Gagal sinkron: ${err.message}. Coba lagi beberapa saat.`, true);
  } finally {
    cloudBusy = false;
    setSyncButtonBusy(false);
  }
}

async function initCloudSync() {
  cloudStatus('Menghubungkan ke database posisi...');
  try {
    await loadCloudPositions();
    // Bila ada perubahan lokal yang tersimpan dari sesi sebelumnya,
    // jangan langsung mengirimnya. Pengguna menentukan kapan sinkron.
    cloudLocalDirty = safeStorageGet('stowageCloudDirty') === '1';
    if (cloudLocalDirty) {
      cloudStatus('Ada perubahan lokal belum dikirim · tekan Unggah', true);
    }
  } catch (err) {
    console.error('Gagal inisialisasi sinkronisasi:', err);
    cloudStatus(`Belum dapat memuat data server: ${err.message} · tekan Unggah untuk mencoba lagi`, true);
    cloudReady = true;
    cloudSnapshot = [];
    cloudLocalDirty = safeStorageGet('stowageCloudDirty') === '1' || records.length > 0;
    if (cloudLocalDirty) safeStorageSet('stowageCloudDirty', '1');
  }
  const btn = $('manualCloudSyncBtn');
  if (btn) btn.disabled = !cloudReady;
}

$('manualCloudSyncBtn')?.addEventListener('click', manualCloudSync);

// Dipanggil setelah seluruh skrip aplikasi siap.
window.addEventListener('load', () => { initCloudSync(); });
