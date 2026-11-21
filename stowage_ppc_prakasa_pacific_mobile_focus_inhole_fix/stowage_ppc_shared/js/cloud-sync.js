// Sinkronisasi posisi kontainer ke tab Google Sheets melalui SheetDB.
// Sheet tab wajib bernama STOWAGE_POSITIONS dan memiliki header sesuai README.
const STOWAGE_SHEET_URL = 'https://sheetdb.io/api/v1/uk78l777buob7?sheet=STOWAGE_POSITIONS';
const CLOUD_POLL_MS = 7000;
let cloudReady = false;
let cloudBusy = false;
let cloudDirty = false;
let cloudSnapshot = [];
let cloudPollHandle = null;

const CLOUD_COLUMNS = [
  'id','nomor_container','feet','bay','row','tier','cell_no',
  'type','dir40','loading_port','destination_port','weight_ton','mov','stowage_loading_port','stowage_destination_port','ship_name','voyage','stowage_date'
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
    stowage_date: String($('stowageDate')?.value || '')
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
    mov: Number(row.mov || 1)
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
  const mapped = rows.map(sheetRowToRecord).filter(Boolean);
  if (rows.length) applyCloudStowageMeta(rows[0]);
  records = mapped;
  cloudSnapshot = mapped.map(recordToSheetRow);
  safeStorageSet('stowageRecords', JSON.stringify(records));
  render(false);
  cloudReady = true;
  cloudStatus(`Tersinkron · ${records.length} posisi · cek tiap 7 detik`);
}

async function queueCloudSave() {
  if (!cloudReady) { cloudDirty = true; return; }
  cloudDirty = true;
  if (cloudBusy) return;
  cloudBusy = true;
  try {
    while (cloudDirty) {
      cloudDirty = false;
      const current = records.map(recordToSheetRow);
      const before = new Map(cloudSnapshot.map(r => [r.id, r]));
      const after = new Map(current.map(r => [r.id, r]));

      for (const [id] of before) {
        if (!after.has(id)) {
          const url = new URL(STOWAGE_SHEET_URL);
          url.pathname = `${url.pathname}/id/${encodeURIComponent(id)}`;
          await cloudFetch(url.toString(), 'DELETE');
        }
      }
      for (const [id, row] of after) {
        const old = before.get(id);
        if (!old) {
          await cloudFetch(STOWAGE_SHEET_URL, 'POST', { data: [row] });
        } else if (JSON.stringify(old) !== JSON.stringify(row)) {
          const url = new URL(STOWAGE_SHEET_URL);
          url.pathname = `${url.pathname}/id/${encodeURIComponent(id)}`;
          await cloudFetch(url.toString(), 'PUT', { data: row });
        }
      }
      cloudSnapshot = current;
      cloudStatus(`Tersimpan ke server · ${current.length} posisi`);
    }
  } catch (err) {
    console.error('Sinkronisasi posisi gagal:', err);
    cloudStatus(`Gagal sinkron: ${err.message}. Periksa konfigurasi SheetDB.`, true);
    cloudDirty = true;
  } finally {
    cloudBusy = false;
  }
}

async function pollCloudPositions() {
  if (!cloudReady || cloudBusy || cloudDirty) return;
  try {
    const rows = await cloudFetch(STOWAGE_SHEET_URL);
    if (rows.length) applyCloudStowageMeta(rows[0]);
    const remote = rows.map(sheetRowToRecord).filter(Boolean);
    const remoteRows = remote.map(recordToSheetRow);
    if (JSON.stringify(remoteRows) !== JSON.stringify(cloudSnapshot)) {
      records = remote;
      cloudSnapshot = remoteRows;
      safeStorageSet('stowageRecords', JSON.stringify(records));
      render(false);
      cloudStatus(`Update diterima · ${records.length} posisi`);
    }
  } catch (err) {
    cloudStatus(`Koneksi server terganggu: ${err.message}`, true);
  }
}

async function initCloudSync() {
  cloudStatus('Menghubungkan ke database posisi...');
  try {
    await loadCloudPositions();
  } catch (err) {
    console.error('Gagal inisialisasi sinkronisasi:', err);
    cloudStatus(`Database posisi belum siap: ${err.message}`, true);
    cloudReady = true;
    cloudSnapshot = records.map(recordToSheetRow);
    if (cloudDirty) queueCloudSave();
  }
  if (cloudPollHandle) clearInterval(cloudPollHandle);
  cloudPollHandle = setInterval(pollCloudPositions, CLOUD_POLL_MS);
}

// Dipanggil setelah seluruh skrip aplikasi siap.
window.addEventListener('load', () => { initCloudSync(); });
