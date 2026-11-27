// =========================================================================
// LIST CONTAINER TERSEDIA DI SIDEBAR (DRAGGABLE KE SLOT BAY)
// =========================================================================
async function ensureSidebarDatabaseLoaded(forceRefresh = false) {
    const statusEl = $('availableDbStatus');

    if (!forceRefresh && databaseRows.length > 0) {
        mergeImportedContainersIntoPool();
        renderAvailableContainerCards();
        return;
    }

    if (typeof showContainerSkeleton === 'function') showContainerSkeleton();
    try {
        await loadDatabase(forceRefresh);
        mergeImportedContainersIntoPool();
        if (statusEl && databaseRows.length === 0) {
            statusEl.textContent = 'Data container belum dapat dimuat / database kosong. Periksa koneksi Laravel API.';
        }
    } finally {
        if (typeof hideContainerSkeleton === 'function') hideContainerSkeleton();
        else renderAvailableContainerCards();
    }
}

function mergeImportedContainersIntoPool() {
    // Tidak ada gabungan data lokal. Semua container harus berasal dari Laravel API.
}

function renderAvailableContainerCards() {
    const cardsEl = $('availableContainerCards');
    const statusEl = $('availableDbStatus');
    if (!cardsEl) return;
    // Skeleton sedang aktif: placeholder tidak boleh ditimpa data lama.
    if (cardsEl.dataset.skeleton === '1') return;

    const loadedNumbers = new Set(
        records.map((r) => String(r.number || '').trim().toUpperCase())
    );

    const searchQuery = ($('sidebarContainerSearch')?.value || '').trim().toLowerCase();
    const clearBtn = $('clearSidebarContainerSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', searchQuery === '');

    const availableRows = databaseRows.filter(
        (r) => !loadedNumbers.has(String(r.number || '').trim().toUpperCase())
    );

    const filteredRows = availableRows.filter((r) => {
        if (
            sidebarSizeFilter !== 'ALL' &&
            sizeFtFromLabel(r.feet || r.size) !== Number(sidebarSizeFilter)
        ) return false;

        if (!searchQuery) return true;
        const haystack = String(r.number || '').toLowerCase();
        return haystack.includes(searchQuery);
    });

    if (statusEl) {
        statusEl.textContent = `${availableRows.length} tersedia dari ${databaseRows.length} unit`;
    }

    if (sidebarTonnageSort === 'asc' || sidebarTonnageSort === 'desc') {
        const direction = sidebarTonnageSort === 'asc' ? 1 : -1;
        filteredRows.sort((a, b) => {
            const aMissing = a.weight === null || a.weight === undefined || String(a.weight).trim() === '';
            const bMissing = b.weight === null || b.weight === undefined || String(b.weight).trim() === '';
            if (aMissing !== bMissing) return aMissing ? 1 : -1;
            if (aMissing && bMissing) return 0;
            return (Number(a.weight) - Number(b.weight)) * direction;
        });
    }

    if (filteredRows.length === 0) {
        cardsEl.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                ${databaseRows.length === 0 ? 'Data kontainer belum dapat dimuat atau database kosong. Periksa koneksi Laravel API.' : 'Tidak ada kontainer tersedia yang cocok.'}
            </div>
        `;
        return;
    }

    cardsEl.innerHTML = filteredRows
        .map((r) => {
            const sizeLabel = normalizeSizeLabel(r.feet || r.size);
            const is40 = sizeLabel === '40 FT';
            const is21 = sizeLabel === '21 FT';
            const cardBorder = is40
                ? 'border-amber-300 bg-amber-50/75 hover:border-amber-500'
                : is21
                    ? 'border-violet-300 bg-violet-50/75 hover:border-violet-500'
                    : 'border-sky-300 bg-sky-50/75 hover:border-sky-500';
            const badgeStyle = is40
                ? 'bg-amber-200 text-amber-950'
                : is21
                    ? 'bg-violet-200 text-violet-950'
                    : 'bg-sky-200 text-sky-950';

            return `
            <div draggable="true" data-pool-index="${r.index}"
                title="Seret (drag) kartu kontainer ini ke slot Bay"
                class="pool-container-card flex min-h-11 min-w-[165px] max-w-[240px] basis-[220px] shrink-0 cursor-grab flex-col justify-center rounded-lg border px-2 py-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${cardBorder}">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs font-black tracking-tight text-slate-900">${esc(r.number)}</span>
                    <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${badgeStyle}">${sizeLabel}</span>
                </div>
                <div class="mt-1.5 flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>${esc(r.loadingPort || $('stowageLoadingPort')?.value || '—')} &rarr; ${esc(r.port || $('stowageDestinationPort')?.value || '—')}</span>
                    <span class="font-extrabold text-slate-900">${esc(formatTon(r.weight))} TON</span>
                </div>
            </div>
            `;
        })
        .join('');
}

$('sidebarContainerSearch')?.addEventListener('input', renderAvailableContainerCards);
$('clearSidebarContainerSearchBtn')?.addEventListener('click', () => {
    $('sidebarContainerSearch').value = '';
    renderAvailableContainerCards();
    $('sidebarContainerSearch').focus();
});

$('refreshSidebarDbBtn')?.addEventListener('click', async () => {
    const btn = $('refreshSidebarDbBtn');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    try {
        if (typeof window.refreshAllLaravelData === 'function') await window.refreshAllLaravelData();
        else await ensureSidebarDatabaseLoaded(true);
        if (typeof renderAvailableContainerCards === 'function') renderAvailableContainerCards();
    } catch (err) {
        alert('Gagal memuat ulang data Laravel: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
});

$('sidebarSizeFilterSelect')?.addEventListener('change', (e) => {
    sidebarSizeFilter = e.target.value || 'ALL';
    renderAvailableContainerCards();
});

// Drag start dari List Container di Sidebar (samakan opacity ghost drag seperti drag pada bay)
$('availableContainerCards')?.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.pool-container-card[draggable="true"]');
    if (!card) {
        e.preventDefault();
        return;
    }

    const poolIndex = Number(card.dataset.poolIndex);
    const container = databaseRows.find((x) => x.index === poolIndex);
    if (!container) {
        e.preventDefault();
        return;
    }

    draggedItem = { source: 'pool', container };
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'pool:' + container.index);

        // Buat drag image solid ber-opacity penuh agar jelas & identik dengan kartu bay
        const ghost = card.cloneNode(true);
        ghost.style.width = `${card.offsetWidth}px`;
        ghost.style.opacity = '1';
        ghost.style.position = 'fixed';
        ghost.style.top = '-9999px';
        ghost.style.left = '-9999px';
        ghost.style.pointerEvents = 'none';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, Math.round(card.offsetWidth / 2), Math.round(card.offsetHeight / 2));
        requestAnimationFrame(() => ghost.remove());
    }

    // Pada tablet/mobile drawer, tutup backdrop sementara atau tetap terlihat saat drag ke kanan
    if (window.innerWidth < 1024) {
        closeMobileSidebar();
    }

    const spec = getDraggedSpec();
    requestAnimationFrame(() => {
        applyDragVisualHighlights(spec);
    });
});

$('availableContainerCards')?.addEventListener('dragend', () => {
    stopBayAutoScroll();
    hideTrashDropZone();
    clearDragVisualHighlights();
    draggedItem = null;
});


$('tonnageSort')?.addEventListener('change', (e) => { sidebarTonnageSort = e.target.value || 'none'; renderAvailableContainerCards(); });


// Import Loading List Excel: parser berdasarkan header sheet LL.
const normImportNo = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const importKey = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isIsoContainerNo = (v) => /^[A-Z]{4}\d{7}$/.test(normImportNo(v));

async function importLoadingList(file) {
    if (!window.XLSX) throw new Error('Library pembaca Excel belum termuat.');
    if (!window.StowageAPI?.importContainers) throw new Error('Endpoint import Laravel belum tersedia.');

    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'll');
    if (!sheetName) throw new Error('Sheet LL tidak ditemukan. Import dibatalkan agar tidak membaca sheet yang salah.');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const headerIndex = rows.findIndex(row =>
        row.some(cell => ['nocontainer', 'containerno', 'nomorcontainer'].includes(importKey(cell)))
    );
    if (headerIndex < 0) throw new Error('Header NO CONTAINER tidak ditemukan pada sheet LL.');

    const headers = rows[headerIndex].map(importKey);
    const findCol = (...keys) => headers.findIndex(h => keys.includes(h));
    const col = {
        no: findCol('nocontainer', 'containerno', 'nomorcontainer', 'nomorkontainer'),
        weight: findCol('tonase', 'weight', 'berat'),
        description: findCol('description', 'deskripsi'),
        seal: findCol('seal', 'sealno', 'nomorseal'),
        size20: findCol('20', '20ft', '20feet'),
        size21: findCol('21', '21ft', '21feet'),
        size40: findCol('40', '40ft', '40feet'),
        remarks: findCol('remarks', 'remark', 'keterangan')
    };
    if (col.no < 0) throw new Error('Kolom NO CONTAINER tidak ditemukan.');

    const containers = [];
    let ignoredNonContainer = 0;
    let invalidSize = 0;
    const seen = new Set();

    for (const row of rows.slice(headerIndex + 1)) {
        const rawNo = String(row[col.no] ?? '').trim();
        if (!rawNo) continue;
        const number = normImportNo(rawNo);
        if (!isIsoContainerNo(number)) { ignoredNonContainer++; continue; }

        const val20 = col.size20 >= 0 ? Number(String(row[col.size20] ?? '').replace(',', '.')) : 0;
        const val21 = col.size21 >= 0 ? Number(String(row[col.size21] ?? '').replace(',', '.')) : 0;
        const val40 = col.size40 >= 0 ? Number(String(row[col.size40] ?? '').replace(',', '.')) : 0;
        // Excel umumnya hanya punya kolom 20/40; kolom 21 FT dibaca bila tersedia.
        const sizeFt = val40 > 0 ? 40 : val21 > 0 ? 21 : val20 > 0 ? 20 : 0;
        if (!sizeFt) { invalidSize++; continue; }
        if (seen.has(number)) continue;
        seen.add(number);

        const weightText = col.weight >= 0 ? String(row[col.weight] ?? '').replace(',', '.').trim() : '';
        containers.push({
            number,
            feet: `${sizeFt} FT`,
            type: 'DC',
            weight: weightText && Number.isFinite(Number(weightText)) ? Number(weightText) : 0,
            description: col.description >= 0 ? String(row[col.description] ?? '').trim() : '',
            seal: col.seal >= 0 ? String(row[col.seal] ?? '').trim() : '',
            remarks: col.remarks >= 0 ? String(row[col.remarks] ?? '').trim() : '',
            loadingPort: normalizePort($('stowageLoadingPort')?.value || ''),
            port: normalizePort($('stowageDestinationPort')?.value || '')
        });
    }

    if (!containers.length) {
        throw new Error(`Tidak ada kontainer valid. Sheet: ${sheetName}; header di baris ${headerIndex + 1}; baris non-kontainer: ${ignoredNonContainer}; ukuran tidak terbaca: ${invalidSize}.`);
    }

    const preview = `Preview Import Loading List\nSheet: ${sheetName}\nKontainer valid: ${containers.length}\nBaris non-kontainer: ${ignoredNonContainer}\nUkuran tidak valid/kosong: ${invalidSize}\n\nLanjutkan simpan ke database Laravel?`;
    if (!window.confirm(preview)) return { cancelled: true, total: containers.length };

    const result = await window.StowageAPI.importContainers(containers);
    const counts = result.data || {};
    await window.loadDatabaseFromLaravel(true);
    renderAvailableContainerCards();

    const added = Number(counts.inserted || 0);
    const skipped = Number(counts.skipped_duplicates || 0);
    const failed = Number(counts.failed || 0);
    const summary = `Import selesai. Total valid: ${containers.length}; berhasil disimpan: ${added}; duplikat: ${skipped}; gagal: ${failed}; non-kontainer: ${ignoredNonContainer}; ukuran tidak valid: ${invalidSize}.`;
    if ($('availableDbStatus')) $('availableDbStatus').textContent = `${databaseRows.length} kontainer dimuat dari Laravel`;
    return { added, skipped, failed, ignoredNonContainer, invalidSize, total: containers.length, summary };
}

$('importContainerBtn')?.addEventListener('click', () => $('importContainerFile')?.click());
$('importContainerFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof showContainerSkeleton === 'function') showContainerSkeleton();
    try {
        const result = await importLoadingList(file);
        if (result.cancelled) return;
        alert(result.summary);
    } catch (error) {
        alert(`Import gagal: ${error.message}`);
        console.error('[Import Loading List]', error);
    } finally {
        if (typeof hideContainerSkeleton === 'function') hideContainerSkeleton();
        event.target.value = '';
    }
});
