// =========================================================================
// LIST CONTAINER TERSEDIA DI SIDEBAR (DRAGGABLE KE SLOT BAY)
// =========================================================================
async function ensureSidebarDatabaseLoaded(forceRefresh = false) {
    const statusEl = $('availableDbStatus');
    const cardsEl = $('availableContainerCards');

    if (!forceRefresh && databaseRows.length > 0) {
        renderAvailableContainerCards();
        return;
    }

    if (!forceRefresh) {
        const cached = sessionStorage.getItem(DB_CACHE_KEY);
        if (cached) {
            databaseRows = JSON.parse(cached);
            if (statusEl) statusEl.textContent = `${databaseRows.length} data tersedia (cache sesi).`;
            renderAvailableContainerCards();
            return;
        }
    }

    if (statusEl) statusEl.textContent = 'Mengambil data kontainer...';
    if (cardsEl) {
        cardsEl.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">Memuat daftar kontainer...</div>';
    }

    await loadDatabase(forceRefresh);
    if (statusEl && databaseRows.length === 0) {
        statusEl.textContent = 'Data container belum dapat dimuat / database kosong. Periksa koneksi dan SheetDB.';
    }
    renderAvailableContainerCards();
}

function renderAvailableContainerCards() {
    const cardsEl = $('availableContainerCards');
    const statusEl = $('availableDbStatus');
    if (!cardsEl) return;

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
        const is40 = r.feet.includes('40');
        if (sidebarSizeFilter === '20' && is40) return false;
        if (sidebarSizeFilter === '40' && !is40) return false;

        if (!searchQuery) return true;
        const haystack = String(r.number || '').toLowerCase();
        return haystack.includes(searchQuery);
    });

    if (statusEl) {
        statusEl.textContent = `${availableRows.length} tersedia dari ${databaseRows.length} unit`;
    }

    if (sidebarTonnageSort === 'asc') filteredRows.sort((a,b) => Number(a.weight || 0) - Number(b.weight || 0));
    else if (sidebarTonnageSort === 'desc') filteredRows.sort((a,b) => Number(b.weight || 0) - Number(a.weight || 0));

    if (filteredRows.length === 0) {
        cardsEl.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                ${databaseRows.length === 0 ? 'Data kontainer belum dapat dimuat atau database kosong. Periksa koneksi/API SheetDB.' : 'Tidak ada kontainer tersedia yang cocok.'}
            </div>
        `;
        return;
    }

    cardsEl.innerHTML = filteredRows
        .map((r) => {
            const is40 = r.feet.includes('40');
            const sizeLabel = is40 ? '40 FT' : '20 FT';
            const cardBorder = is40
                ? 'border-amber-300 bg-amber-50/75 hover:border-amber-500'
                : 'border-sky-300 bg-sky-50/75 hover:border-sky-500';
            const badgeStyle = is40
                ? 'bg-amber-200 text-amber-950'
                : 'bg-sky-200 text-sky-950';

            return `
            <div draggable="true" data-pool-index="${r.index}"
                title="Seret (drag) kartu kontainer ini ke slot Bay"
                class="pool-container-card cursor-grab active:cursor-grabbing rounded-xl border p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardBorder}">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs font-black tracking-tight text-slate-900">${esc(r.number)}</span>
                    <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${badgeStyle}">${sizeLabel}</span>
                </div>
                <div class="mt-1.5 flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>${esc(r.loadingPort || '—')} &rarr; ${esc(r.port || '—')}</span>
                    <span class="font-extrabold text-slate-900">${esc(r.weight || '0')} TON</span>
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

$('refreshSidebarDbBtn')?.addEventListener('click', () => {
    ensureSidebarDatabaseLoaded(true);
});

document.querySelectorAll('.sidebar-size-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
        sidebarSizeFilter = btn.dataset.sizeFilter || 'ALL';
        document.querySelectorAll('.sidebar-size-filter').forEach((b) => {
            const active = b.dataset.sizeFilter === sidebarSizeFilter;
            b.className = active
                ? 'sidebar-size-filter flex-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white transition'
                : 'sidebar-size-filter flex-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200';
        });
        renderAvailableContainerCards();
    });
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
