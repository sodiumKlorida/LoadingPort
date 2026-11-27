
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

  // Polling sinkronisasi antar user. Route yang dipakai tetap GET /plans/{plan}/positions.
  const POLL_INTERVAL_MS = 5000;
  let pollTimer = null;
  let pollingInFlight = false;
  let lastPlanSignature = null;
  let localDirty = false;
  let saveInFlight = false;

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
          size_ft: sizeFtFromLabel(container.feet),
          container_type: container.type || 'DC',
          weight_ton: Number(String(container.weight || 0).replace(',', '.')),
          loading_port: container.loadingPort || null,
          destination_port: container.destinationPort || container.port || null,
          description: container.description || null,
          seal_no: container.seal || null,
          remarks: container.remarks || null,
          source: 'IMPORT'
        })
      });
      return mapApiContainer(created.data);
    },
    async importContainers(containers) {
      const payload = containers.map((container) => ({
        container_no: container.number,
        size_ft: sizeFtFromLabel(container.feet),
        container_type: container.type || 'DC',
        weight_ton: Number(String(container.weight || 0).replace(',', '.')) || 0,
        loading_port: container.loadingPort || null,
        destination_port: container.destinationPort || container.port || null,
        description: container.description || null,
        seal_no: container.seal || null,
        remarks: container.remarks || null
      }));
      return apiRequest('/containers/import', {
        method: 'POST',
        body: JSON.stringify({ containers: payload })
      });
    }
  };

  const normalizeNo = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function ensureApiToolbar() {
    if (document.getElementById('apiConnectionToolbar')) return;
    const toolbar = document.createElement('section');
    toolbar.id = 'apiConnectionToolbar';
    toolbar.className = 'api-connection-toolbar flex w-full flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-sm';
    toolbar.innerHTML = `
      <div class="min-w-[170px] flex-1">
        <label class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Voyage</label>
        <select id="apiVoyageSelect" class="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30">
          <option value="">Memuat voyage...</option>
        </select>
      </div>
      <div class="min-w-[170px] flex-1">
        <label class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Stowage Plan</label>
        <select id="apiPlanSelect" class="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30" disabled>
          <option value="">Pilih voyage</option>
        </select>
      </div>
    `;
    // Voyage dan Stowage Plan adalah kontrol konfigurasi; tempatkan di sidebar kiri.
    // Workspace kanan tetap khusus untuk List Container dan Bay Content.
    const sidebarMenu = document.getElementById('sidebarMainMenu');
    const brandCard = sidebarMenu?.firstElementChild;
    if (sidebarMenu && brandCard) {
      brandCard.insertAdjacentElement('afterend', toolbar);
    } else {
      const sidebar = document.getElementById('appSidebar');
      (sidebar || document.body).prepend(toolbar);
    }
    document.getElementById('apiVoyageSelect').addEventListener('change', async (e) => {
      activeVoyageId = Number(e.target.value) || null;
      await loadPlansForVoyage();
    });
    document.getElementById('apiPlanSelect').addEventListener('change', async (e) => {
      activePlanId = Number(e.target.value) || null;
      if (activePlanId) await loadActivePlan();
    });
  }

  function setApiStatus(message, isError = false) {
    // Tidak menampilkan teks "Menghubungkan..." yang menetap di antarmuka.
    // Error tetap dicatat di console agar tidak mengganggu area kerja.
    if (isError) console.error('[Laravel API]', message);
  }

  function mapApiContainer(c) {
    const size = normalizeSizeLabel(c.size_ft ?? c.feet ?? c.size);
    return {
      id: Number(c.id),
      index: Number(c.id),
      number: String(c.container_no || '').trim().toUpperCase(),
      feet: size,
      type: String(c.container_type || 'DC').toUpperCase(),
      weight: String(c.weight_ton ?? ''),
      loadingPort: String(c.loading_port || c.loadingPort || ''),
      destinationPort: String(c.destination_port || c.destinationPort || c.port || ''),
      port: String(c.destination_port || c.destinationPort || c.port || ''),
      description: c.description || '',
      seal: c.seal_no || '',
      remarks: c.remarks || '',
      source: c.source || 'API'
    };
  }

  async function loadContainerPool() {
    // Ambil seluruh halaman paginator Laravel, bukan hanya halaman pertama.
    let page = 1;
    let lastPage = 1;
    const rows = [];
    do {
      const body = await apiRequest(`/containers?per_page=500&page=${page}`);
      const pageRows = unwrap(body);
      rows.push(...pageRows.map(mapApiContainer));
      const paginator = body?.data && !Array.isArray(body.data) ? body.data : body;
      lastPage = Math.max(1, Number(paginator?.last_page || paginator?.meta?.last_page || 1));
      page += 1;
    } while (page <= lastPage && page <= 100);

    // Deduplicate by database ID, then by normalized container number.
    const byNumber = new Map();
    rows.forEach((row) => byNumber.set(normalizeNo(row.number), row));
    databaseRows = Array.from(byNumber.values()).map((row, index) => ({ ...row, index: Number(row.index || row.id || index) }));
    apiContainersByNumber = new Map(databaseRows.map(c => [normalizeNo(c.number), c]));
    if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    if (typeof filterDatabase === 'function') filterDatabase();
    const status = document.getElementById('dbStatus');
    if (status) status.textContent = `${databaseRows.length} kontainer dimuat dari Laravel API.`;
    return databaseRows;
  }

  // Satu tombol refresh di dock memperbarui data kontainer dan pilihan voyage/plan.
  window.refreshAllLaravelData = async function () {
    if (typeof showContainerSkeleton === 'function') showContainerSkeleton();
    try {
      await loadVoyages();
      if (activeVoyageId) await loadPlansForVoyage();
      await loadContainerPool();
    } finally {
      if (typeof hideContainerSkeleton === 'function') hideContainerSkeleton();
    }
  };

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
    const status = document.getElementById('availableDbStatus');
    if (!forceRefresh && databaseRows.length > 0) {
      if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
      return;
    }
    if (typeof showContainerSkeleton === 'function') showContainerSkeleton();
    try {
      await loadContainerPool();
      if (status) status.textContent = `${databaseRows.length} kontainer dari Laravel API`;
    } catch (err) {
      if (status) status.textContent = `API gagal: ${err.message}`;
    } finally {
      if (typeof hideContainerSkeleton === 'function') hideContainerSkeleton();
      else if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
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
    const relation = p.container || p.containers || {};
    const positionNumber = relation.container_no || p.container_no || p.number || '';
    const wantedId = p.container_id ?? relation.id ?? p.containerId ?? null;
    const byId = wantedId == null ? null : databaseRows.find(row => Number(row.id) === Number(wantedId));
    const byNumber = positionNumber
      ? databaseRows.find(row => normalizeNo(row.number || row.container_no) === normalizeNo(positionNumber))
      : null;
    const master = byId || byNumber || {};
    // Jangan biarkan relasi posisi yang kosong/null menimpa data master Laravel.
    const c = { ...master };
    Object.entries(relation).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') c[key] = value;
    });
    const number = String(c.container_no || c.number || positionNumber || master.number || '');
    return {
      id: String(p.id),
      containerId: Number(p.container_id || c.id || master.id),
      bay: Number(p.bay),
      slot: Number(p.slot),
      cellNo: String(p.cell_no || getCellNo(Number(p.bay), Number(p.slot))),
      number,
      size: normalizeSizeLabel(c.size_ft ?? c.feet ?? c.size),
      type: String(c.container_type || c.type || 'DC').toUpperCase(),
      dir40: p.dir40 || null,
      port: String(c.destination_port || c.destinationPort || c.port || ''),
      destinationPort: String(c.destination_port || c.destinationPort || c.port || ''),
      loadingPort: String(c.loading_port || c.loadingPort || ''),
      weight: String(c.weight_ton ?? c.weight ?? ''),
      mov: Number(p.mov || 1)
    };
  }

  // Tanda tangan posisi dipakai agar polling tidak menggambar ulang Bay bila
  // respons dari Laravel sama dengan kondisi yang sedang ditampilkan.
  function getPlanSignature(body, positions) {
    const rows = JSON.stringify(positions.map((p) => [
      p.id ?? '', p.container_id ?? '', p.bay ?? '', p.slot ?? '',
      p.cell_no ?? '', p.mov ?? '', p.dir40 ?? ''
    ].join('|')).sort());
    const explicit = body?.data?.snapshot_no ?? body?.data?.version ?? body?.data?.updated_at
      ?? body?.snapshot_no ?? body?.version ?? body?.updated_at;
    if (explicit !== undefined && explicit !== null && explicit !== '') return `v:${explicit}:${rows}`;
    return rows;
  }

  function shouldSkipPolling() {
    if (!activePlanId || loadingPlan || pollingInFlight) return true;
    if (saveTimer || saveInFlight || localDirty) return true;
    if (typeof draggedItem !== 'undefined' && draggedItem) return true;
    const bays = document.getElementById('bays');
    if (bays && bays.dataset.skeleton === '1') return true;
    return false;
  }

  async function pollActivePlan() {
    if (shouldSkipPolling()) return;
    // Tidak perlu memenuhi server saat tab tidak terlihat.
    if (document.visibilityState === 'hidden') return;

    pollingInFlight = true;
    try {
      const body = await apiRequest(`/plans/${activePlanId}/positions`);
      const positions = body.data?.positions || [];
      const signature = getPlanSignature(body, positions);
      if (signature === lastPlanSignature) return;

      lastPlanSignature = signature;
      records = positions.map(mapPosition);
      if (typeof render === 'function') render(true);
      if (typeof updateSummary === 'function') updateSummary();
      if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
      setApiStatus(`Sinkron otomatis · ${records.length} posisi`);
    } catch (err) {
      // Polling berjalan terus; jangan memunculkan alert tiap beberapa detik.
      console.warn('[Stowage polling]', err.message);
    } finally {
      pollingInFlight = false;
    }
  }

  function startPlanPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(pollActivePlan, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pollActivePlan();
    });
  }

  async function loadActivePlan() {
    if (!activePlanId || loadingPlan) return;
    loadingPlan = true;
    setApiStatus('Mengambil posisi stowage dari database...');
    try {
      const body = await apiRequest(`/plans/${activePlanId}/positions`);
      const positions = body.data?.positions || [];
      lastPlanSignature = getPlanSignature(body, positions);
      localDirty = false;
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
        size_ft: sizeFtFromLabel(record.size),
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
    saveInFlight = true;
    try {
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
      localDirty = false;
      // Biarkan polling mengambil lagi kondisi kanonis setelah save berhasil.
      lastPlanSignature = null;
    } finally {
      saveInFlight = false;
    }
  }

  // Batasi debounce/save queue sebelum operasi reset agar posisi lama tidak
  // tertulis kembali ke server setelah Bay dikosongkan.
  async function waitForPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await saveQueue;
    } catch (_) {
      // saveQueue sudah memiliki handler .catch di window.save.
    }
    saveQueue = Promise.resolve();
  }

  // Kosongkan seluruh posisi plan aktif lewat endpoint yang sudah ada.
  window.clearBayPositions = async function () {
    if (!activePlanId) throw new Error('Plan aktif belum tersedia.');
    await waitForPendingSave();
    const body = await apiRequest(`/plans/${activePlanId}/positions`, {
      method: 'PUT',
      body: JSON.stringify({ positions: [] })
    });
    records = [];
    localDirty = false;
    lastPlanSignature = null;
    if (typeof render === 'function') render(false);
    if (typeof updateSummary === 'function') updateSummary();
    if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    setApiStatus(`Bay Content dikosongkan dari plan ${activePlanId}.`);
    return body;
  };

  // Hapus permanen SEMUA kontainer (import Excel + input manual) di database Laravel.
  // Route tetap memakai endpoint reset yang sudah ada; backend harus menghapus
  // seluruh baris containers, bukan hanya yang source = IMPORT.
  window.resetAllContainers = async function () {
    await waitForPendingSave();
    const body = await apiRequest('/containers/imported/reset', { method: 'DELETE' });
    setApiStatus('Semua kontainer (import Excel dan input manual) dihapus permanen dari database.');
    return body;
  };

  // Alias lama untuk kompatibilitas.
  window.resetImportedContainers = window.resetAllContainers;

  // Replace local-only save with a debounced API save. UI remains responsive while saving.
  window.save = function() {
    if (typeof updateHeaderMeta === 'function') updateHeaderMeta();
    if (typeof updateStowageContext === 'function') updateStowageContext();
    if (typeof updateSummary === 'function') updateSummary();
    if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    localDirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveQueue = saveQueue.then(persistPositionsNow).catch(err => {
        setApiStatus(`Gagal menyimpan ke API: ${err.message}`, true);
      });
    }, 650);
  };

  async function initializeApiBridge() {
    ensureApiToolbar();
    try {
      await loadContainerPool();
      await loadVoyages();
      await loadPlansForVoyage();
    } catch (err) {
      setApiStatus(`Koneksi API gagal: ${err.message}`, true);
    }
  }

  // Initialize immediately so the legacy window-load handlers use the API loader.
  // Skeleton ditampilkan oleh app.js sebelum script ini berjalan; tutup di sini
  // setelah container/voyage/plan selesai dimuat (atau gagal).
  window.syncStowageNow = pollActivePlan;

  window.__stowageInitializing = true;
  initializeApiBridge().finally(() => {
    window.__stowageInitializing = false;
    if (typeof hideAppSkeleton === 'function') hideAppSkeleton();
    // Mulai sinkronisasi otomatis antar user setelah data awal siap.
    startPlanPolling();
  });
})();
