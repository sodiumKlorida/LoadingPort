// Satu kontrol toggle ditempatkan di sebelah kiri judul LIST CONTAINER.
function updateDockSidebarToggle() {
    const btn = $('sidebarDockToggle');
    const collapsed = $('appSidebar')?.classList.contains('lg:hidden') || false;
    if (!btn) return;
    btn.innerHTML = collapsed
        ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>';
    btn.title = collapsed ? 'Tampilkan panel samping' : 'Sembunyikan panel samping';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', String(!collapsed));
}
$('sidebarDockToggle')?.addEventListener('click', () => {
    if (window.innerWidth >= 900) {
        $('appSidebar')?.classList.toggle('lg:hidden');
        updateDockSidebarToggle();
    } else {
        const isOpen = !$('appSidebar')?.classList.contains('-translate-x-full');
        if (isOpen) closeMobileSidebar(); else openMobileSidebar();
    }
});
window.addEventListener('resize', updateDockSidebarToggle);
updateDockSidebarToggle();

function printStowage() {
    // Bangun halaman cetak sebelum dialog dibuka; beforeprint tetap menjadi fallback.
    if (typeof window.buildStowagePrintPreview === 'function') {
        window.buildStowagePrintPreview();
    }
    window.setTimeout(() => window.print(), 80);
}

// =========================================================================
// ORIENTASI CETAK: Portrait / Landscape
// =========================================================================
function setPrintOrientation(mode, options = {}) {
    const orientation = mode === 'landscape' ? 'landscape' : 'portrait';
    window.printOrientation = orientation;
    document.documentElement.classList.toggle('print-landscape', orientation === 'landscape');

    // @page tidak bisa memakai selector class, jadi aturannya ditulis ulang di style khusus.
    const style = document.getElementById('printOrientationStyle');
    if (style) style.textContent = `@page { size: A4 ${orientation}; margin: 8mm; }`;

    const portraitBtn = $('printPortraitBtn');
    const landscapeBtn = $('printLandscapeBtn');
    [portraitBtn, landscapeBtn].forEach((btn) => {
        if (!btn) return;
        const active = btn === (orientation === 'landscape' ? landscapeBtn : portraitBtn);
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('text-slate-900', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-slate-500', !active);
        btn.setAttribute('aria-pressed', String(active));
    });

    const label = orientation === 'landscape' ? 'Landscape' : 'Portrait';
    if ($('printPdfBtnLabel')) $('printPdfBtnLabel').textContent = `Cetak / Simpan PDF (${label})`;
    $('mobilePrintBtn')?.setAttribute('title', `Cetak / Simpan PDF (${label})`);

    try {
        localStorage.setItem('stowagePrintOrientation', orientation);
    } catch (_) {
        // Penyimpanan bisa diblokir; orientasi tetap berlaku selama sesi ini.
    }

    if (!options.silent && document.getElementById('printPages') &&
        typeof window.buildStowagePrintPreview === 'function') {
        window.buildStowagePrintPreview();
    }
    return orientation;
}
window.setPrintOrientation = setPrintOrientation;

$('printPortraitBtn')?.addEventListener('click', () => setPrintOrientation('portrait'));
$('printLandscapeBtn')?.addEventListener('click', () => setPrintOrientation('landscape'));

let savedPrintOrientation = 'portrait';
try {
    savedPrintOrientation = localStorage.getItem('stowagePrintOrientation') || 'portrait';
} catch (_) {
    savedPrintOrientation = 'portrait';
}
setPrintOrientation(savedPrintOrientation, { silent: true });

// =========================================================================
// SKELETON LOADING (daftar kontainer + area Bay)
// =========================================================================
const CONTAINER_SKELETON_CARD = `
  <div class="min-w-[165px] basis-[220px] shrink-0 animate-pulse rounded-lg border border-slate-200 bg-white p-2">
    <div class="flex items-center justify-between gap-2">
      <div class="h-3 w-24 rounded bg-slate-200"></div>
      <div class="h-3 w-9 rounded bg-slate-200"></div>
    </div>
    <div class="mt-2 flex items-center justify-between gap-2">
      <div class="h-2.5 w-20 rounded bg-slate-200"></div>
      <div class="h-2.5 w-10 rounded bg-slate-200"></div>
    </div>
  </div>`;

// Counter membuat skeleton aman bila beberapa proses (load + import/reset)
// berjalan bersamaan: skeleton hanya hilang setelah pemilik terakhir selesai.
function showContainerSkeleton(count = 6) {
    const el = $('availableContainerCards');
    if (!el) return;
    const active = Number(el.dataset.skeletonCount || 0);
    el.dataset.skeletonCount = String(active + 1);
    if (active > 0) return;
    el.dataset.skeleton = '1';
    el.innerHTML = Array.from({ length: count }, () => CONTAINER_SKELETON_CARD).join('');
    const status = $('availableDbStatus');
    if (status) status.textContent = 'Memuat data kontainer...';
}

function hideContainerSkeleton() {
    const el = $('availableContainerCards');
    if (!el || !el.dataset.skeletonCount) return;
    const remaining = Number(el.dataset.skeletonCount || 0) - 1;
    if (remaining > 0) {
        el.dataset.skeletonCount = String(remaining);
        return;
    }
    delete el.dataset.skeletonCount;
    delete el.dataset.skeleton;
    if (typeof renderAvailableContainerCards === 'function') {
        renderAvailableContainerCards();
    } else {
        el.innerHTML = '';
        const status = $('availableDbStatus');
        if (status) status.textContent = '';
    }
}

function showBaySkeleton() {
    const host = $('bays');
    if (!host) return;
    const active = Number(host.dataset.skeletonCount || 0);
    host.dataset.skeletonCount = String(active + 1);
    if (active > 0) return;
    host.dataset.skeleton = '1';

    const bayCard = `
      <article class="min-h-[300px] w-full shrink-0 animate-pulse rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div class="h-4 w-24 rounded bg-slate-200"></div>
        <div class="mt-3 grid grid-cols-4 gap-2">
          ${Array.from({ length: 18 }, () => '<div class="h-14 rounded-lg bg-slate-100"></div>').join('')}
        </div>
      </article>`;
    const hold = (label) => `
      <section class="flex shrink-0 flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
        <div class="text-xs font-black tracking-widest text-slate-300 uppercase">${label}</div>
        <div class="grid grid-cols-2 gap-3">${bayCard.repeat(4)}</div>
      </section>`;

    host.innerHTML = hold('CARGO HOLD 2') + hold('CARGO HOLD 1');
}

function hideBaySkeleton() {
    const host = $('bays');
    if (!host || !host.dataset.skeletonCount) return;
    const remaining = Number(host.dataset.skeletonCount || 0) - 1;
    if (remaining > 0) {
        host.dataset.skeletonCount = String(remaining);
        return;
    }
    delete host.dataset.skeletonCount;
    delete host.dataset.skeleton;
    if (typeof render === 'function') render(false);
    else host.innerHTML = '';
}

function showAppSkeleton() {
    showContainerSkeleton();
    showBaySkeleton();
}

function hideAppSkeleton() {
    hideContainerSkeleton();
    hideBaySkeleton();
}

window.showContainerSkeleton = showContainerSkeleton;
window.hideContainerSkeleton = hideContainerSkeleton;
window.showBaySkeleton = showBaySkeleton;
window.hideBaySkeleton = hideBaySkeleton;
window.showAppSkeleton = showAppSkeleton;
window.hideAppSkeleton = hideAppSkeleton;

function updateHeaderMeta() {
    const ship = ($('shipName')?.value || 'PRAKASA PACIFIC').trim();
    const voy = ($('voyage')?.value || '').trim();
    const date = ($('stowageDate')?.value || '').trim();
    const loading = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const destination = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const label = [ship, voy, date, loading && `${loading} → ${destination}`].filter(Boolean).join(' · ');

    if ($('printSubtitle')) $('printSubtitle').textContent = label;
    if ($('mobileShipSub')) $('mobileShipSub').textContent = label;
}

function updateStowageContext() {
    const ship = ($('shipName')?.value || 'PRAKASA PACIFIC').trim();
    const voyage = ($('voyage')?.value || '').trim();
    const date = ($('stowageDate')?.value || '').trim();
    const loading = ($('stowageLoadingPort')?.value || '').trim().toUpperCase();
    const destination = ($('stowageDestinationPort')?.value || '').trim().toUpperCase();
    const parts = [ship, voyage, date, loading && destination ? `${loading} → ${destination}` : ''];
    const el = $('stowageContextText');
    if (el) el.textContent = parts.filter(Boolean).join(' · ') || 'Informasi stowage belum diisi';
}

function save() {
    // Simpan data utama terlebih dahulu. Jika storage ditolak/penuh, perubahan tetap
    // tampil selama tab ini terbuka dan pengguna diberi peringatan yang spesifik.

    updateHeaderMeta();
    updateStowageContext();
    updateSummary();
    renderAvailableContainerCards();

}

// Metadata kapal/voyage diisi dari Laravel API saat API bridge terhubung.
$('shipName').value = 'PRAKASA PACIFIC';
$('voyage').value = '';
if ($('stowageDate')) $('stowageDate').value = '';
if ($('stowageLoadingPort')) $('stowageLoadingPort').value = '';
if ($('stowageDestinationPort')) $('stowageDestinationPort').value = '';
updateHeaderMeta();
updateStowageContext();

function bayLabel(b) {
    return b === 'AH' ? 'AFTER HATCH' : `BAY ${String(b).padStart(2, '0')}`;
}

function getCellNo(bay, slot) {
    if (bay === 'AH') {
        const slotNum = Number(slot);
        return slotNum === 4 ? 'AH482' : slotNum === 3 ? 'AH382' : 'AH' + String(slotNum);
    }
    const p = CELL_LAYOUT[slot];
    return p ? String(bay) + String(p.row) + String(p.tier) : '—';
}

function slotsForBay(bay) {
    const bayId = bay === 'AH' ? 'AH' : Number(bay);
    return BAY_IDS.includes(bayId) ? ALLOWED_SLOTS : [];
}

