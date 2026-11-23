// =========================================================================
// UI PILIHAN ARAH 40 FT DI DALAM MODAL (AUTO-DISABLE JIKA CELL TUJUAN TERISI)
// =========================================================================
function update40FtDirectionUI(preferredDir = null) {
    const container = $('dir40Container');
    if (!container) return;

    const size = $('fFeet').value;
    const type = $('fType').value;
    const bayRaw = $('fBay').value;
    const bay = bayRaw === 'AH' ? 'AH' : Number(bayRaw);
    const slot = Number($('fSlot').value);
    const recordId = $('recordId').value || null;

    if (size !== '40 FT') {
        container.classList.add('hidden');
        return;
    }

    const dirs = getValid40FtDirections(bay, slot, recordId);
    if (dirs.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const fwdDir = dirs.find((d) => d.dir === 'forward');
    const bwdDir = dirs.find((d) => d.dir === 'backward');

    const fwdRadio = $('dirForward');
    const bwdRadio = $('dirBackward');
    const fwdLabel = $('dirForwardLabel');
    const bwdLabel = $('dirBackwardLabel');

    // Arah Depan (Bow)
    if (fwdDir && fwdDir.available) {
        fwdRadio.disabled = false;
        fwdLabel.classList.remove('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        fwdLabel.classList.add('cursor-pointer', 'bg-white', 'border-amber-300');
        $('dirForwardText').textContent = `Ke Depan (Bay 01) → ${bayLabel(fwdDir.targetBay)} (${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)})`;
    } else {
        fwdRadio.disabled = true;
        fwdRadio.checked = false;
        fwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        fwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (fwdDir && fwdDir.occupiedBy) {
            $('dirForwardText').textContent = `Ke Depan → ${getCellNo(fwdDir.targetBay, fwdDir.targetSlot)} (Terisi: ${fwdDir.occupiedBy.number})`;
        } else {
            $('dirForwardText').textContent = 'Ke Depan menuju Bay 01 (Tidak tersedia)';
        }
    }

    // Arah Belakang (Stern)
    if (bwdDir && bwdDir.available) {
        bwdRadio.disabled = false;
        bwdLabel.classList.remove('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.add('cursor-pointer', 'bg-white', 'border-amber-300');
        $('dirBackwardText').textContent = `Ke Belakang (Bay 13) → ${bayLabel(bwdDir.targetBay)} (${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)})`;
    } else {
        bwdRadio.disabled = true;
        bwdRadio.checked = false;
        bwdLabel.classList.add('opacity-45', 'cursor-not-allowed', 'bg-slate-100', 'border-slate-300');
        bwdLabel.classList.remove('cursor-pointer', 'bg-white', 'border-amber-300');
        if (bwdDir && bwdDir.occupiedBy) {
            $('dirBackwardText').textContent = `Ke Belakang → ${getCellNo(bwdDir.targetBay, bwdDir.targetSlot)} (Terisi: ${bwdDir.occupiedBy.number})`;
        } else {
            $('dirBackwardText').textContent = 'Ke Belakang menuju Bay 13 (Tidak tersedia)';
        }
    }

    const fwdAvail = Boolean(fwdDir && fwdDir.available);
    const bwdAvail = Boolean(bwdDir && bwdDir.available);

    if (preferredDir === 'forward' && fwdAvail) {
        fwdRadio.checked = true;
    } else if (preferredDir === 'backward' && bwdAvail) {
        bwdRadio.checked = true;
    } else {
        if (bwdAvail && !fwdRadio.checked) bwdRadio.checked = true;
        else if (fwdAvail && !bwdRadio.checked) fwdRadio.checked = true;
    }

    update40FtPreviewText();
}

function update40FtPreviewText() {
    const preview = $('dir40Preview');
    if (!preview) return;

    const bayRaw = $('fBay').value;
    if (bayRaw === 'AH' || $('fFeet').value !== '40 FT') {
        preview.textContent = '';
        return;
    }

    const bay = Number(bayRaw);
    const slot = Number($('fSlot').value);
    const selectedDir = $('dirForward').checked ? 'forward' : $('dirBackward').checked ? 'backward' : null;
    if (!selectedDir) {
        preview.textContent = 'Semua cell pasangan depan/belakang sudah terisi.';
        return;
    }

    const target = getBlockedTarget(bay, slot, selectedDir);
    const w = Number($('fWeight').value || 0);
    const halfW = (w / 2).toFixed(2);

    if (target) {
        preview.textContent = `Mengisi ${bayLabel(bay)} (${getCellNo(bay, slot)}) & ${bayLabel(target.bay)} (${getCellNo(target.bay, target.slot)}) → ${halfW} Ton / bay.`;
    } else {
        preview.textContent = '';
    }
}

function openSlot(b, s) {
    const bayVal = b === 'AH' ? 'AH' : Number(b);
    const slotVal = Number(s);
    const blocker = getBlockingRecord(bayVal, slotVal);

    if (blocker) {
        openSlot(blocker.bay, blocker.slot);
        return;
    }

    const r = records.find((x) => String(x.bay) === String(bayVal) && Number(x.slot) === slotVal);

    $('recordId').value = r ? r.id : '';
    $('fBay').value = String(bayVal);
    $('fSlot').value = slotVal;
    $('fNumber').value = r?.number || '';
    $('fType').value = r?.type || 'DC';
    $('fFeet').value = r?.size || '20 FT';

    $('fWeight').value = r?.weight ?? '';

    $('modalBadge').textContent = `${bayLabel(bayVal)} · CELL ${getCellNo(bayVal, slotVal)}`;
    $('modalTitle').textContent = r ? 'Edit Data Kontainer' : `Isi Kontainer (${getCellNo(bayVal, slotVal)})`;

    selectedDatabaseRow = null;
    $('deleteBtn').classList.toggle('hidden', !r);

    $('dirForward').checked = false;
    $('dirBackward').checked = false;

    if (r) {
        showManual();
        update40FtDirectionUI(r.dir40 || null);
    } else {
        showDatabase();
        update40FtDirectionUI(null);
    }

    const modal = $('modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = $('modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function loadDatabase(forceRefresh = false) {
    const status = $('dbStatus');
    const select = $('dbSelect');

    if (!SHEETDB_API_URL) {
        if (status) status.textContent = 'URL SheetDB belum dikonfigurasi.';
        if (select) select.innerHTML = '<option value="">URL SheetDB belum dikonfigurasi</option>';
        return;
    }

    if (!forceRefresh) {
        const cached = sessionStorage.getItem(DB_CACHE_KEY);
        if (cached) {
            try {
                databaseRows = JSON.parse(cached);
                filterDatabase();
                if (status) status.textContent = `${databaseRows.length} data kontainer siap dipilih (cache).`;
                return;
            } catch (cacheError) {
                sessionStorage.removeItem(DB_CACHE_KEY);
            }
        }
    }

    if (status) status.textContent = 'Mengambil data dari SheetDB (CONTAINER_DATABASE)...';
    if (select) select.innerHTML = '<option value="">Memuat...</option>';

    try {
        // SheetDB mengembalikan JSON. mode:'cors' meminta browser memproses
        // header Access-Control-Allow-Origin dari server; jangan gunakan no-cors
        // karena respons opaque tidak bisa dibaca oleh JavaScript.
        const url = new URL(SHEETDB_API_URL);
        url.searchParams.set('sheet', 'CONTAINER_DATABASE');
        if (forceRefresh) url.searchParams.set('_', String(Date.now()));

        const response = await fetch(url.toString(), {
            method: 'GET',
            mode: 'cors',
            headers: { 'Accept': 'application/json' },
            cache: forceRefresh ? 'no-store' : 'default'
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`SheetDB HTTP ${response.status}${detail ? ': ' + detail.slice(0, 180) : ''}`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
            throw new Error('Format respons SheetDB tidak sesuai: seharusnya JSON berupa array baris.');
        }

        // Normalisasi nama kolom agar aman terhadap kapitalisasi/spasi header SheetDB.
        const getField = (row, names) => {
            const normalized = {};
            Object.keys(row || {}).forEach((key) => {
                normalized[String(key).trim().toLowerCase()] = row[key];
            });
            for (const name of names) {
                const value = normalized[name.toLowerCase()];
                if (value !== undefined && value !== null) return value;
            }
            return '';
        };

        const latestDatabaseRows = new Map();
        payload
            .map((row, i) => ({
                raw: row,
                index: i,
                number: String(getField(row, ['Nomor Container', 'Nomor Kontainer', 'Container Number'])).trim(),
                loadingPort: normalizePort(String(getField(row, ['Pelabuhan Awal', 'Loading Port'])).trim()),
                port: normalizePort(String(getField(row, ['Pelabuhan Tujuan', 'Port of Destination', 'Discharge Port'])).trim()),
                weight: String(getField(row, ['Berat', 'Weight'])).replace(',', '.').trim(),
                type: String(getField(row, ['Type', 'Tipe', 'Type Container', 'Jenis']) || 'DC').trim().toUpperCase(),
                feet: String(getField(row, ['Feet', 'Ukuran', 'Size']) || '20 FT').trim().toUpperCase()
            }))
            .filter((row) => row.number)
            .forEach((row) => latestDatabaseRows.set(String(row.number).replace(/\s+/g,'').toUpperCase(), row));
        databaseRows = [...latestDatabaseRows.values()];

        // Gabungkan data import lokal dan utamakan baris import terbaru untuk nomor yang sama.
        try {
            const imported = JSON.parse(safeStorageGet('stowageImportedContainersV1', '[]') || '[]');
            let nextIndex = databaseRows.reduce((m,r)=>Math.max(m,Number(r.index)||0),-1)+1;
            const latestImported = new Map();
            imported.forEach(r => {
                const key=String(r.number||'').replace(/\s+/g,'').toUpperCase();
                if(key) latestImported.set(key,r);
            });
            latestImported.forEach((r,key) => {
                const existingIndex=databaseRows.findIndex(x=>String(x.number||'').replace(/\s+/g,'').toUpperCase()==key);
                if(existingIndex>=0) databaseRows[existingIndex]={...databaseRows[existingIndex],...r,index:databaseRows[existingIndex].index};
                else databaseRows.push({...r,index:nextIndex++});
            });
        } catch (mergeError) { console.warn('Import lokal tidak dapat digabung:', mergeError); }
        sessionStorage.setItem(DB_CACHE_KEY, JSON.stringify(databaseRows));
        filterDatabase();
        if (status) status.textContent = `${databaseRows.length} data kontainer dimuat dari SheetDB.`;
    } catch (err) {
        console.error('SheetDB load error:', err);
        const message = err instanceof TypeError
            ? 'Gagal mengakses SheetDB. Periksa koneksi internet dan izin CORS dari SheetDB; jangan membuka file melalui mode no-cors.'
            : err.message;
        if (status) status.textContent = 'Gagal memuat: ' + message;
        if (select) select.innerHTML = '<option value="">Data tidak dapat dimuat</option>';
    }
}

function setSourceTabUI(mode) {
    const dbBtn = $('showDatabaseBtn');
    const manBtn = $('showManualBtn');
    if (mode === 'db') {
        dbBtn.className = 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition';
        manBtn.className = 'rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:text-slate-900';
    } else {
        manBtn.className = 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition';
        dbBtn.className = 'rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:text-slate-900';
    }
}

function showDatabase() {
    setSourceTabUI('db');
    $('manualPanel').classList.add('hidden');
    $('databasePanel').classList.remove('hidden');
    loadDatabase(false);
}

function showManual() {
    setSourceTabUI('man');
    $('databasePanel').classList.add('hidden');
    $('manualPanel').classList.remove('hidden');
    selectedDatabaseRow = null;
}

function filterDatabase() {
    const q = ($('dbSearch')?.value || '').toLowerCase();
    const filtered = databaseRows.filter((r) =>
        String(r.number || '').toLowerCase().includes(q)
    );
    if ($('dbSelect')) {
        $('dbSelect').innerHTML = filtered.length
            ? filtered
                .map(
                    (r) =>
                        `<option value="${r.index}">${esc(r.number)} · ${esc(r.loadingPort)} → ${esc(r.port)} · ${esc(r.weight)} ton · ${esc(r.type || 'DC')} (${esc(r.feet)})</option>`
                )
                .join('')
            : '<option value="">Tidak ada data yang cocok</option>';
    }
}

function selectDatabaseRecord() {
    const index = Number($('dbSelect').value);
    const r = databaseRows.find((x) => x.index === index);
    if (!r) return;

    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    const recordId = $('recordId').value || null;
    const is40Ft = r.feet.includes('40');

    if (is40Ft && !canLoad40Ft(bay, slot, recordId)) {
        alert('Kontainer 40 FT tidak dapat dimuat di sini (hanya Bay 01–11 dan cell pasangan depan/belakang harus kosong).');
        $('dbSelect').value = '';
        return;
    }

    selectedDatabaseRow = r;
    $('fNumber').value = r.number;

    $('fWeight').value = r.weight;
    $('fType').value = r.type || 'DC';
    $('fFeet').value = is40Ft ? '40 FT' : '20 FT';
    $('fType').value = r.type || 'DC';

    setSourceTabUI('man');
    $('databasePanel').classList.add('hidden');
    $('manualPanel').classList.remove('hidden');

    $('dirForward').checked = false;
    $('dirBackward').checked = false;
    update40FtDirectionUI(null);
}

function submitContainer(e) {
    if (e && e.preventDefault) e.preventDefault();

    const bay = $('fBay').value === 'AH' ? 'AH' : Number($('fBay').value);
    const slot = Number($('fSlot').value);
    const id = $('recordId').value;
    const loadingPort = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const port = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const number = $('fNumber').value.trim().toUpperCase();
    const weight = $('fWeight').value;
    const size = $('fFeet').value;
    const type = $('fType').value;

    if (
        (bay !== 'AH' && !BAY_IDS.includes(bay)) ||
        !slotsForBay(bay).includes(slot) ||
        (bay !== 'AH' && !CELL_LAYOUT[slot])
    ) {
        alert('Posisi tidak valid. Tutup form lalu pilih posisi yang tersedia.');
        return;
    }

    if (!number || weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0) {
        alert('Lengkapi nomor kontainer dan berat dengan benar. Pelabuhan mengikuti Main Menu.');
        return;
    }

    const selfBlocker = getBlockingRecord(bay, slot, id);
    if (selfBlocker) {
        alert(
            `Posisi ${getCellNo(bay, slot)} sudah terisi oleh kontainer 40 FT (${selfBlocker.number}) dari ${getCellNo(selfBlocker.bay, selfBlocker.slot)}.`
        );
        return;
    }

    if (records.some((r) => String(r.bay) === String(bay) && Number(r.slot) === slot && r.id !== id)) {
        alert('Posisi ini sudah terisi. Silakan pilih posisi lain.');
        return;
    }

    let dir40 = null;

    if (size === '40 FT') {
        if (!canLoad40Ft(bay, slot, id)) {
            alert('Kontainer 40 FT tidak dapat dimuat di sini (hanya Bay 01–11 dan cell pasangan depan/belakang harus kosong).');
            return;
        }

        if ($('dirForward').checked && !$('dirForward').disabled) dir40 = 'forward';
        else if ($('dirBackward').checked && !$('dirBackward').disabled) dir40 = 'backward';

        if (!dir40) {
            alert('Pilih arah penempatan kontainer 40 FT yang tersedia (ke Depan atau ke Belakang).');
            return;
        }

        const validDirs = getValid40FtDirections(bay, slot, id);
        const chosen = validDirs.find((d) => d.dir === dir40 && d.available);
        if (!chosen) {
            alert('Cell pasangan untuk kontainer 40 FT sudah terisi atau tidak tersedia.');
            return;
        }
    }

    const old = id ? records.find((x) => x.id === id) : null;
    const duplicate = records.find((x) => x.id !== id && String(x.number || '').trim().toUpperCase() === number);
    if (duplicate) {
        alert(`Kontainer ${number} sudah ditempatkan di ${bayLabel(duplicate.bay)} · ${getCellNo(duplicate.bay, duplicate.slot)}.`);
        return;
    }
    const item = {
        id: id || String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        bay,
        slot,
        cellNo: getCellNo(bay, slot),
        number,
        type,
        size,
        dir40: size === '40 FT' ? dir40 : null,
        port: normalizePort(port),
        loadingPort: normalizePort(loadingPort),
        weight,
        mov: old?.mov ?? 1
    };

    if (old) {
        records = records.map((r) => (r.id === id ? item : r));
    } else {
        records.push(item);
    }

    try {
        save();
        closeModal();
        handleContainerSearch(false);
    } catch (err) {
        console.error(err);
        alert('Data gagal disimpan di browser. Periksa izin penyimpanan browser.');
    }
}

function deleteRecord() {
    const id = $('recordId').value;
    if (id && confirm('Hapus data kontainer ini?')) {
        records = records.filter((r) => r.id !== id);
        save();
        closeModal();
        handleContainerSearch(false);
    }
}

function clearAll() {
    if (confirm('Hapus seluruh data kontainer dari browser ini?')) {
        records = [];
        save();
        handleContainerSearch(false);
    }
}

function openMobileSidebar() {
    $('appSidebar').classList.remove('-translate-x-full');
    $('sidebarBackdrop').classList.remove('hidden');
}

function closeMobileSidebar() {
    $('appSidebar').classList.add('-translate-x-full');
    $('sidebarBackdrop').classList.add('hidden');
}

