
/*
 * Laravel API bridge for Stowage Plan PPC.
 * Laravel API endpoint. Override window.STOWAGE_API_BASE before this file loads if needed.
 * Current ngrok tunnel:
 * https://wrench-regular-glitzy.ngrok-free.dev/api
 */
(() => {
  const API_BASE = (window.STOWAGE_API_BASE || 'https://wrench-regular-glitzy.ngrok-free.dev/api').replace(/\/$/, '');
  let activeVoyageId = null;
  let activePlanId = null;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let loadingPlan = false;
  let apiContainersByNumber = new Map();

  const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch (_) {
      throw new Error(`Respons API bukan JSON (HTTP ${response.status}, ${response.headers.get('content-type') || 'content-type tidak diketahui'}). Periksa route Laravel dan output PHP. Isi respons: ${raw.slice(0, 120)}`);
    }
    if (!response.ok || body.success === false) {
      const message = body.message || `HTTP ${response.status}`;
      const errors = body.errors ? ' ' + Object.values(body.errors).flat().join(' ') : '';
      throw new Error(message + errors);
    }
    return body;
  };

  const unwrap = (body) => Array.isArray(body?.data) ? body.data : (body?.data?.data || []);
  window.StowageAPI = {
    async createContainer(container) {
      const created = await apiRequest('/containers', {
        method: 'POST',
        body: JSON.stringify({
          container_no: container.number,
          size_ft: String(container.feet).includes('40') ? 40 : 20,
          container_type: container.type || 'DC',
          weight_ton: Number(String(container.weight || 0).replace(',', '.')),
          loading_port: container.loadingPort || null,
          destination_port: container.port || null,
          description: container.description || null,
          seal_no: container.seal || null,
          remarks: container.remarks || null,
          source: 'IMPORT'
        })
      });
      return mapApiContainer(created.data);
    }
  };

  const normalizeNo = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

  function ensureApiToolbar() {
    if (document.getElementById('apiConnectionToolbar')) return;
    const toolbar = document.createElement('section');
    toolbar.id = 'apiConnectionToolbar';
    toolbar.className = 'mx-auto mb-4 flex max-w-screen-2xl flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm';
    toolbar.innerHTML = `
      <div class="min-w-[170px] flex-1">
        <label class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Voyage API</label>
        <select id="apiVoyageSelect" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
          <option value="">Memuat voyage...</option>
        </select>
      </div>
      <div class="min-w-[170px] flex-1">
        <label class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Stowage Plan</label>
        <select id="apiPlanSelect" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" disabled>
          <option value="">Pilih voyage</option>
        </select>
      </div>
      <div class="flex min-w-[180px] flex-1 flex-col justify-end">
        <div id="apiConnectionStatus" class="text-[11px] font-semibold text-slate-600">Menghubungkan ke Laravel API...</div>
        <div class="mt-1 text-[10px] text-slate-400">API: ${API_BASE}</div>
      </div>
      <button id="apiReloadBtn" type="button" class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">Muat Ulang</button>
    `;
    const appRoot = document.querySelector('main') || document.body;
    appRoot.insertBefore(toolbar, appRoot.firstChild);
    document.getElementById('apiVoyageSelect').addEventListener('change', async (e) => {
      activeVoyageId = Number(e.target.value) || null;
      await loadPlansForVoyage();
    });
    document.getElementById('apiPlanSelect').addEventListener('change', async (e) => {
      activePlanId = Number(e.target.value) || null;
      if (activePlanId) await loadActivePlan();
    });
    document.getElementById('apiReloadBtn').addEventListener('click', async () => {
      await loadVoyages();
      if (activeVoyageId) await loadPlansForVoyage();
    });
  }

  function setApiStatus(message, isError = false) {
    const el = document.getElementById('apiConnectionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-[11px] font-semibold ${isError ? 'text-rose-700' : 'text-emerald-700'}`;
  }

  function mapApiContainer(c) {
    const size = Number(c.size_ft) === 40 ? '40 FT' : '20 FT';
    return {
      id: Number(c.id),
      index: Number(c.id),
      number: String(c.container_no || '').trim().toUpperCase(),
      feet: size,
      type: String(c.container_type || 'DC').toUpperCase(),
      weight: String(c.weight_ton ?? ''),
      loadingPort: String(c.loading_port || ''),
      port: String(c.destination_port || ''),
      description: c.description || '',
      seal: c.seal_no || '',
      remarks: c.remarks || '',
      source: c.source || 'API'
    };
  }

  async function loadContainerPool() {
    const body = await apiRequest('/containers');
    const rows = unwrap(body).map(mapApiContainer);
    databaseRows = rows;
    apiContainersByNumber = new Map(rows.map(c => [normalizeNo(c.number), c]));
    if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    if (typeof filterDatabase === 'function') filterDatabase();
    const status = document.getElementById('dbStatus');
    if (status) status.textContent = `${rows.length} kontainer dimuat dari Laravel API.`;
    return rows;
  }

  // Override the former SheetDB loader; all container choices now come from Laravel.
  window.loadDatabaseFromLaravel = async function(forceRefresh = false) {
    const status = document.getElementById('dbStatus');
    if (status) status.textContent = 'Mengambil daftar kontainer dari Laravel API...';
    try {
      await loadContainerPool();
    } catch (err) {
      setApiStatus(`Gagal mengambil kontainer: ${err.message}`, true);
      if (status) status.textContent = `Gagal memuat dari API: ${err.message}`;
      throw err;
    }
  };

  window.loadDatabase = window.loadDatabaseFromLaravel;

  // Prevent the old SheetDB sidebar loader from using stale browser cache.
  window.ensureSidebarDatabaseLoaded = async function(forceRefresh = false) {
    const cards = document.getElementById('availableContainerCards');
    const status = document.getElementById('availableDbStatus');
    if (cards) cards.innerHTML = '<div class="p-3 text-center text-xs text-slate-500">Memuat kontainer dari Laravel API...</div>';
    try {
      await loadContainerPool();
      if (status) status.textContent = `${databaseRows.length} kontainer dari Laravel API`;
      if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    } catch (err) {
      if (status) status.textContent = `API gagal: ${err.message}`;
      if (cards) cards.innerHTML = `<div class="p-3 text-xs text-rose-700">Gagal memuat API: ${err.message}</div>`;
    }
  };

  async function loadVoyages() {
    const body = await apiRequest('/voyages');
    const voyages = unwrap(body);
    const select = document.getElementById('apiVoyageSelect');
    select.innerHTML = voyages.length
      ? voyages.map(v => `<option value="${v.id}">${v.voyage_no} · ${v.loading_port || '-'} → ${v.destination_port || '-'}</option>`).join('')
      : '<option value="">Belum ada voyage</option>';
    if (!voyages.length) throw new Error('Belum ada voyage. Buat voyage terlebih dahulu melalui API.');
    const previous = activeVoyageId && voyages.some(v => Number(v.id) === Number(activeVoyageId));
    activeVoyageId = previous ? Number(activeVoyageId) : Number(voyages[0].id);
    select.value = String(activeVoyageId);
    const v = voyages.find(x => Number(x.id) === activeVoyageId);
    if (v) {
      if (document.getElementById('shipName')) document.getElementById('shipName').value = v.ship?.name || document.getElementById('shipName').value;
      if (document.getElementById('voyage')) document.getElementById('voyage').value = v.voyage_no || '';
      if (document.getElementById('stowageDate')) document.getElementById('stowageDate').value = v.stowage_date || '';
      if (document.getElementById('stowageLoadingPort')) document.getElementById('stowageLoadingPort').value = v.loading_port || '';
      if (document.getElementById('stowageDestinationPort')) document.getElementById('stowageDestinationPort').value = v.destination_port || '';
      if (typeof updateHeaderMeta === 'function') updateHeaderMeta();
      if (typeof updateStowageContext === 'function') updateStowageContext();
    }
    return voyages;
  }

  async function loadPlansForVoyage() {
    if (!activeVoyageId) return;
    const select = document.getElementById('apiPlanSelect');
    select.disabled = true;
    select.innerHTML = '<option value="">Memuat plan...</option>';
    try {
      const body = await apiRequest(`/voyages/${activeVoyageId}/plans`);
      let plans = unwrap(body);
      if (!plans.length) {
        const created = await apiRequest(`/voyages/${activeVoyageId}/plans`, {
          method: 'POST',
          body: JSON.stringify({ plan_name: 'Main Plan', version_no: 1 })
        });
        plans = created.data ? [created.data] : [];
      }
      if (!plans.length) throw new Error('Voyage ini belum memiliki Stowage Plan.');
      select.innerHTML = plans.map(p => `<option value="${p.id}">${p.plan_name} · v${p.version_no} · ${p.status}</option>`).join('');
      const match = activePlanId && plans.some(p => Number(p.id) === Number(activePlanId));
      activePlanId = match ? Number(activePlanId) : Number(plans[0].id);
      select.value = String(activePlanId);
      select.disabled = false;
      await loadActivePlan();
    } catch (err) {
      setApiStatus(`Gagal memuat plan: ${err.message}`, true);
      select.innerHTML = `<option value="">${err.message}</option>`;
    }
  }

  function mapPosition(p) {
    const c = p.container || {};
    return {
      id: String(p.id),
      containerId: Number(p.container_id || c.id),
      bay: Number(p.bay),
      slot: Number(p.slot),
      cellNo: String(p.cell_no || getCellNo(Number(p.bay), Number(p.slot))),
      number: String(c.container_no || ''),
      size: Number(c.size_ft) === 40 ? '40 FT' : '20 FT',
      type: String(c.container_type || 'DC').toUpperCase(),
      dir40: p.dir40 || null,
      port: c.destination_port || '',
      loadingPort: c.loading_port || '',
      weight: String(c.weight_ton ?? ''),
      mov: Number(p.mov || 1)
    };
  }

  async function loadActivePlan() {
    if (!activePlanId || loadingPlan) return;
    loadingPlan = true;
    setApiStatus('Mengambil posisi stowage dari database...');
    try {
      const body = await apiRequest(`/plans/${activePlanId}/positions`);
      const positions = body.data?.positions || [];
      records = positions.map(mapPosition);
      if (typeof render === 'function') render(false);
      if (typeof updateSummary === 'function') updateSummary();
      if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
      setApiStatus(`Terhubung · Voyage ${activeVoyageId} · Plan ${activePlanId} · ${records.length} posisi`);
    } catch (err) {
      setApiStatus(`Gagal memuat posisi: ${err.message}`, true);
    } finally {
      loadingPlan = false;
    }
  }

  async function ensureContainerId(record) {
    if (record.containerId) return Number(record.containerId);
    const key = normalizeNo(record.number);
    const known = apiContainersByNumber.get(key);
    if (known) {
      record.containerId = known.id;
      return known.id;
    }
    const created = await apiRequest('/containers', {
      method: 'POST',
      body: JSON.stringify({
        container_no: record.number,
        size_ft: record.size === '40 FT' ? 40 : 20,
        container_type: record.type || 'DC',
        weight_ton: Number(record.weight || 0),
        loading_port: record.loadingPort || null,
        destination_port: record.port || null,
        source: 'MANUAL'
      })
    });
    const c = created.data;
    if (!c?.id) throw new Error(`API tidak mengembalikan ID untuk kontainer ${record.number}`);
    const mapped = mapApiContainer(c);
    databaseRows.push(mapped);
    apiContainersByNumber.set(key, mapped);
    record.containerId = mapped.id;
    return mapped.id;
  }

  async function persistPositionsNow() {
    if (!activePlanId || loadingPlan) return;
    const payloadPositions = [];
    for (const record of records) {
      if (record.bay === 'AH') {
        throw new Error('Posisi AFTER HATCH (AH) belum didukung oleh skema API PPC saat ini.');
      }
      const layout = CELL_LAYOUT[Number(record.slot)];
      if (!layout) throw new Error(`Slot ${record.slot} tidak memiliki CELL_LAYOUT.`);
      const containerId = await ensureContainerId(record);
      payloadPositions.push({
        container_id: containerId,
        bay: Number(record.bay),
        slot: Number(record.slot),
        cell_no: String(record.cellNo || getCellNo(record.bay, record.slot)),
        row_no: Number(layout.row),
        tier: Number(layout.tier),
        dir40: record.size === '40 FT' ? (record.dir40 || null) : null,
        mov: Number(record.mov || 1)
      });
    }
    const body = await apiRequest(`/plans/${activePlanId}/positions`, {
      method: 'PUT',
      body: JSON.stringify({ positions: payloadPositions })
    });
    setApiStatus(`Tersimpan ke Laravel · snapshot ${body.data?.snapshot_no ?? '-'} · ${records.length} posisi`);
  }

  // Replace local-only save with a debounced API save. UI remains responsive while saving.
  window.save = function() {
    if (typeof updateHeaderMeta === 'function') updateHeaderMeta();
    if (typeof updateStowageContext === 'function') updateStowageContext();
    if (typeof updateSummary === 'function') updateSummary();
    if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveQueue = saveQueue.then(persistPositionsNow).catch(err => {
        setApiStatus(`Gagal menyimpan ke API: ${err.message}`, true);
      });
    }, 650);
  };

  async function initializeApiBridge() {
    ensureApiToolbar();
    setApiStatus(`Menghubungkan ke ${API_BASE}...`);
    try {
      await loadContainerPool();
      await loadVoyages();
      await loadPlansForVoyage();
    } catch (err) {
      setApiStatus(`Koneksi API gagal: ${err.message}`, true);
    }
  }

  // Initialize immediately so the legacy window-load handlers use the API loader.
  initializeApiBridge();
})();
