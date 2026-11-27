function getSearchMatches(rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return [];
  const matches = [];
  BAY_IDS.forEach((b) => {
    const slots = slotsForBay(b);
    slots.forEach((s) => {
      const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
      if (r && String(r.number || '').toLowerCase().includes(q)) {
        const partnerBay = r.size === '40 FT' ? getPartnerBayFor40Ft(r) : null;
        const blockedTarget = partnerBay !== null ? { bay: partnerBay, slot: Number(r.slot) } : null;
        matches.push({
          ...r,
          blockedTarget
        });
      }
    });
  });
  return matches;
}

function formatTon(weightVal) {
  if (weightVal === '' || weightVal === null || weightVal === undefined) return '0';
  const n = Number(String(weightVal).replace(',', '.'));
  if (!Number.isFinite(n)) return String(weightVal);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function formatHalfWeight(weightVal) {
  if (weightVal === '' || weightVal === null || weightVal === undefined) return '';
  const half = Number(weightVal) / 2;
  return Number.isInteger(half) ? String(half) : half.toFixed(2).replace(/\.?0+$/, '');
}

function slotCardHTML(b, s, isDashed = false) {
  const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
  const blocker = !r ? getBlockingRecord(b, s) : null;
  const searchVal = ($('search')?.value || '').trim().toLowerCase();

  const hasRecord = Boolean(r);
  const isBlocked = Boolean(blocker);
  const activeContainer = r || blocker;

  const isSearchMatch =
    Boolean(activeContainer) &&
    searchVal !== '' &&
    String(activeContainer.number || '').toLowerCase().includes(searchVal);
  const isSearchDimmed =
    Boolean(activeContainer) && searchVal !== '' && !isSearchMatch;

  const is40 = hasRecord && r.size === '40 FT';
  const is21 = hasRecord && r.size === '21 FT';
  const isDraggable = Boolean(activeContainer);
  const dragRecordId = activeContainer ? activeContainer.id : '';

  const cardSurface = isSearchMatch
    ? 'border-emerald-600 bg-emerald-50 ring-4 ring-emerald-400/70 shadow-lg scale-[1.01]'
    : hasRecord
      ? is40
        ? 'border-amber-400 bg-amber-50/90 hover:border-amber-500'
        : is21
          ? 'border-violet-400 bg-violet-50/90 hover:border-violet-500'
          : 'border-sky-400 bg-sky-50/90 hover:border-sky-500'
      : isBlocked
        ? 'border-dashed border-amber-400 bg-amber-50/55 hover:border-amber-500'
        : isDashed
          ? 'border-2 border-dashed border-slate-400 bg-white hover:border-sky-500 hover:bg-sky-50/30'
          : 'border-slate-300 bg-white hover:border-sky-500 hover:bg-sky-50/30';

  const cursorClass = isDraggable
    ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md'
    : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md';
  const dimClass = isSearchDimmed ? 'opacity-30 print:opacity-100' : '';

  const headerBg = isSearchMatch
    ? 'border-emerald-300 bg-emerald-200/80 text-emerald-950'
    : hasRecord
      ? is40
        ? 'border-amber-200 bg-amber-100/80 text-amber-950'
        : is21
          ? 'border-violet-200 bg-violet-100/80 text-violet-950'
          : 'border-sky-200 bg-sky-100/80 text-sky-950'
      : isBlocked
        ? 'border-amber-200/80 bg-amber-100/60 text-amber-900'
        : 'border-slate-200 bg-slate-100/80 text-slate-700';

  const sizeBadge = isSearchMatch
    ? 'bg-emerald-200 text-emerald-950'
    : hasRecord
      ? is40
        ? 'bg-amber-200 text-amber-950'
        : is21
          ? 'bg-violet-200 text-violet-950'
          : 'bg-sky-200 text-sky-950'
      : isBlocked
        ? 'bg-amber-200/80 text-amber-950'
        : 'bg-transparent text-transparent';

  const blockerCellNo = isBlocked ? esc(getCellNo(blocker.bay, blocker.slot)) : '';
  let weightLabel = 'KOSONG';
  if (hasRecord && r.weight !== '') {
    weightLabel = is40 ? `${esc(formatTon(formatHalfWeight(r.weight)))} T` : `${esc(formatTon(r.weight))} T`;
  } else if (isBlocked) {
    weightLabel = blocker.weight !== '' ? `${esc(formatTon(formatHalfWeight(blocker.weight)))} T` : `DARI ${blockerCellNo}`;
  }

  const containerKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sourceContainer = activeContainer
    ? (databaseRows.find((item) => containerKey(item.number) === containerKey(activeContainer.number)) || {})
    : {};
  // Posisi Bay kadang hanya menyimpan nomor/berat/ukuran. Ambil pelabuhan dari
  // master kontainer Laravel sebagai fallback, tanpa mengubah data posisi.
  // Rute pada Bay mengikuti input konteks kapal/voyage di sidebar.
  // Data master kontainer hanya menjadi fallback jika form sidebar kosong.
  const sidebarLoadingPort = $('stowageLoadingPort')?.value || '';
  const sidebarDestinationPort = $('stowageDestinationPort')?.value || '';
  const loadPortValue = normalizePort(sidebarLoadingPort || activeContainer?.loadingPort || sourceContainer.loadingPort || '');
  const discPortValue = normalizePort(sidebarDestinationPort || activeContainer?.destinationPort || activeContainer?.port || sourceContainer.destinationPort || sourceContainer.port || '');
  const loadPort = activeContainer ? esc(loadPortValue || '—') : '';
  const discPort = activeContainer ? esc(discPortValue || '—') : '';

  return `
    <div id="cell-${esc(b)}-${s}" data-bay="${esc(b)}" data-slot="${s}"
      ${isDraggable ? `draggable="true" data-record-id="${esc(dragRecordId)}" title="Klik untuk edit, seret ke slot lain untuk pindah/tukar, atau seret ke bawah untuk membuang"` : ''}
      class="slot-card group relative flex h-full min-h-[92px] md:min-h-[66px] lg:min-h-[98px] min-w-[120px] md:min-w-[100px] lg:min-w-[128px] flex-col justify-between overflow-hidden rounded-xl md:rounded-lg lg:rounded-xl border transition duration-150 print:min-h-[34px] print:min-w-0 print:rounded-md print:border-slate-800 print:shadow-none ${cursorClass} ${cardSurface} ${isDashed && hasRecord ? 'border-2 border-dashed' : ''} ${dimClass}">
      ${isBlocked
      ? `<span class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" aria-hidden="true">
                  <span class="text-black text-[7rem] md:text-[10rem] lg:text-[11rem] font-black leading-none print:text-[44px] print:leading-none">×</span>
                </span>`
      : ''}
      <!-- Top Cell & Weight Strip -->
      <div class="relative z-10 flex items-center justify-between gap-1.5 border-b px-2.5 py-1 text-[11px] font-bold print:border-slate-800 print:px-0.5 print:py-0 print:text-[5px] ${headerBg}">
        <span class="shrink-0 whitespace-nowrap tracking-tight">${esc(getCellNo(b, s))}</span>
        <span class="shrink-0 whitespace-nowrap ${hasRecord || isBlocked ? '' : 'text-slate-400 print:hidden'}">${weightLabel}</span>
      </div>

      <!-- Center Container Number -->
      <div class="relative flex flex-1 flex-col items-center justify-center px-2 py-1.5 text-center print:px-0.5 print:py-1">
        ${hasRecord
      ? `<span class="whitespace-nowrap font-mono text-sm font-black tracking-tight text-slate-900 print:break-all print:whitespace-normal print:text-[6px] print:leading-tight">${esc(r.number)}</span><span class="mt-0.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-800 print:hidden">${esc(r.type || 'DC')}</span>`
      : isBlocked
        ? `<span class="relative z-10 rounded bg-amber-100/90 px-1.5 py-0.5 whitespace-nowrap font-mono text-xs font-black tracking-tight text-amber-950 print:break-all print:whitespace-normal print:text-[6px] print:leading-tight">${esc(blocker.number)}</span>`
        : `<span class="whitespace-nowrap text-xs font-semibold text-slate-400 group-hover:text-sky-600 print:hidden">Nomor Container</span>`
    }
      </div>

      <!-- Bottom Route & Size Strip: hanya dipakai di layar, di cetak disembunyikan
           supaya kartu Bay berisi No Cell + Nomor Kontainer + Tonase saja. -->
      <div class="flex min-h-[26px] items-center justify-between gap-1.5 border-t border-slate-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-bold print:hidden">
        ${hasRecord
      ? `<span class="shrink-0 whitespace-nowrap text-slate-700 print:shrink print:whitespace-normal print:break-all print:text-[6px] print:leading-[1.1]">${loadPort}&rarr;${discPort}</span>
               <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                 ${esc(r.size || '20 FT')}
               </span>`
      : isBlocked
        ? `<span class="shrink-0 whitespace-nowrap text-amber-800/80 print:shrink print:whitespace-normal print:break-all print:text-[6px] print:leading-[1.1]">${loadPort}&rarr;${discPort}</span>
                 <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                   40 FT
                 </span>`
        : `<span class="select-none text-transparent">&nbsp;</span>`
    }
      </div>
    </div>
  `;
}

function vmovCardHTML(title, rows, ttlWeight) {
  const breakdownHTML = rows
    .map(
      (item) => `
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 py-1 text-xs last:border-b-0 print:py-0 print:text-[5px] print:leading-tight">
        <span class="whitespace-nowrap font-medium text-slate-500 print:text-slate-700">${item.label}</span>
        <span class="whitespace-nowrap font-bold text-slate-800">${formatTon(item.weight)} T</span>
      </div>
    `
    )
    .join('');

  return `
    <div class="flex h-full flex-col justify-between rounded-2xl md:rounded-xl lg:rounded-2xl border border-slate-200 bg-slate-50 p-2.5 md:p-2 lg:p-3 shadow-sm print:rounded-lg print:border-slate-800 print:bg-white print:p-0.5 print:shadow-none">
      <div>
        <div class="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1.5 print:border-slate-400 print:pb-0.5">
          <span class="whitespace-nowrap text-[10px] md:text-[11px] font-extrabold tracking-wider text-slate-900 uppercase print:text-[5px] print:leading-tight print:tracking-normal">${title}</span>
          <span class="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 print:hidden">V.MOV</span>
        </div>
        <div class="mt-1 print:mt-0.5">
          ${breakdownHTML}
        </div>
      </div>

      <div class="mt-2.5 md:mt-1 lg:mt-2.5 flex items-center justify-between gap-2 rounded-xl md:rounded-lg lg:rounded-xl bg-sky-600 px-2.5 md:px-2 lg:px-2.5 py-1.5 md:py-1 lg:py-1.5 text-white print:mt-0.5 print:rounded print:border print:border-slate-800 print:bg-slate-100 print:px-0.5 print:py-0 print:text-slate-900">
        <span class="whitespace-nowrap text-[10px] font-bold tracking-wider uppercase print:text-[5px] print:tracking-normal">TTL</span>
        <span class="whitespace-nowrap text-xs font-extrabold sm:text-sm print:text-[6px]">${formatTon(ttlWeight)} TON</span>
      </div>
    </div>
  `;
}

function getBayOccupiedSlotsCount(bay) {
  const slots = slotsForBay(bay);
  let count = 0;
  slots.forEach((s) => {
    const r = records.find((x) => String(x.bay) === String(bay) && Number(x.slot) === Number(s));
    const blocker = !r ? getBlockingRecord(bay, s) : null;
    if (r || blocker) count++;
  });
  return count;
}

function renderBayCard(b) {
  const list = records.filter((r) => String(r.bay) === String(b));
  const partner40List = records.filter((r) => r.size === '40 FT' && Number(getPartnerBayFor40Ft(r)) === Number(b));
  const total = getBayTotalWeight(b);
  const count20 = list.filter((r) => r.size === '20 FT').length;
  const count21 = list.filter((r) => r.size === '21 FT').length;
  const count40 = list.filter((r) => r.size === '40 FT').length + partner40List.length;
  const occupiedSlots = getBayOccupiedSlotsCount(b);
  const title = bayLabel(b);

  // Pada tablet (md: 768px-1023px), panel menyesuaikan lebar layar tablet agar nyaman dilihat tanpa terpotong
  const panelWidthClass = 'w-full min-w-0 max-w-none shrink-0 print:w-full print:shrink';

  let contentHTML = '';
  const tier10 = getBaySlotsWeight(b, [17, 18]);
  const tier8 = getBaySlotsWeight(b, [1, 2, 3, 4]);
  const tier6 = getBaySlotsWeight(b, [5, 6, 7, 8]);
  const tier04 = getBaySlotsWeight(b, [9, 10, 11, 12]);
  const tier02 = getBaySlotsWeight(b, [13, 14, 15, 16]);

  // Satu panel tonase per Bay: gabungan semua tier, tanpa pemisahan On Deck / In Hole.
  contentHTML = `
    <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_160px] lg:grid-cols-[minmax(0,1fr)_196px] gap-2 p-2.5 md:p-2 print:grid-cols-[minmax(0,1fr)_60px] print:gap-0.5 print:p-1">
      <section class="flex min-h-0 flex-col p-1.5 md:p-2 print:p-0.5">
        <div class="grid min-h-0 flex-1 grid-rows-5 gap-2 print:gap-0.5">
          <div class="grid h-full grid-cols-4 gap-2 print:gap-0.5">
            <div></div>
            ${slotCardHTML(b, 17, true)}
            ${slotCardHTML(b, 18, true)}
            <div></div>
          </div>
          <div class="grid h-full grid-cols-4 gap-2 print:gap-0.5">
            ${[1, 2, 3, 4].map((slot) => slotCardHTML(b, slot, false)).join('')}
          </div>
          <div class="grid h-full grid-cols-4 gap-2 print:gap-0.5">
            ${[5, 6, 7, 8].map((slot) => slotCardHTML(b, slot, false)).join('')}
          </div>
          <div class="grid h-full grid-cols-4 gap-2 print:gap-0.5">
            ${[9, 10, 11, 12].map((slot) => slotCardHTML(b, slot, false)).join('')}
          </div>
          <div class="grid h-full grid-cols-4 gap-2 print:gap-0.5">
            ${[13, 14, 15, 16].map((slot) => slotCardHTML(b, slot, false)).join('')}
          </div>
        </div>
      </section>
      <aside class="flex min-h-0 h-full flex-col justify-center">
        ${vmovCardHTML(
          `BAY ${String(b).padStart(2, '0')}`,
          [
            // Semua nomor tier memakai dua digit agar urutan 02/04/06/08/10 konsisten.
            { label: 'Tier 10', weight: tier10 },
            { label: 'Tier 08', weight: tier8 },
            { label: 'Tier 06', weight: tier6 },
            { label: 'Tier 04', weight: tier04 },
            { label: 'Tier 02', weight: tier02 }
          ],
          tier10 + tier8 + tier6 + tier04 + tier02
        )}
      </aside>
    </div>
  `;
  return `
    <article id="panel-${b}" data-bay-panel="${b}"
      class="bay-panel flex min-h-[300px] w-full min-w-0 max-w-none shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md md:min-h-[310px] lg:min-h-[300px] print:h-[126mm] print:min-h-[126mm] print:max-h-[126mm] print:break-inside-avoid print:rounded-lg print:border-slate-800 print:shadow-none ${panelWidthClass}">
      <!-- Bay Card Header -->
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-3.5 md:px-4 py-2 md:py-2.5 text-white print:bg-slate-100 print:px-1 print:py-0.5 print:text-slate-900">
        <div class="flex items-center gap-2 md:gap-2.5 print:gap-0.5">
          <h2 class="whitespace-nowrap text-sm md:text-base font-extrabold tracking-wide print:text-[7px]">${title}</h2>
          <div class="flex items-center gap-1.5 text-[11px] print:gap-0.5 print:text-[5px]">
            <span class="whitespace-nowrap rounded-lg bg-sky-500/20 px-2 py-0.5 font-bold text-sky-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1 print:py-0 print:text-slate-800">
              20FT: ${count20}
            </span>
            <span class="whitespace-nowrap rounded-lg bg-violet-500/20 px-2 py-0.5 font-bold text-violet-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1 print:py-0 print:text-slate-800">
              21FT: ${count21}
            </span>
            <span class="whitespace-nowrap rounded-lg bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1 print:py-0 print:text-slate-800">
              40FT: ${count40}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs font-bold print:gap-0.5 print:text-[5px]">
          <span class="whitespace-nowrap text-slate-300 print:text-slate-700">${occupiedSlots} / ${slotsForBay(b).length} Slot</span>
          <span class="whitespace-nowrap rounded-xl bg-sky-600 px-2.5 md:px-3 py-1 text-white print:rounded print:border print:border-slate-800 print:bg-white print:px-1 print:py-0 print:text-slate-900">
            V.MOV ${formatTon(total)} TON
          </span>
        </div>
      </div>

      ${contentHTML}
    </article>
  `;
}

function getNavButtonClasses(b) {
  const searchVal = ($('search')?.value || '').trim().toLowerCase();
  const count = getBayOccupiedSlotsCount(b);
  const isActive = String(activeBay) === String(b);

  const slots = slotsForBay(b);
  const hasSearchHit =
    searchVal !== '' &&
    slots.some((s) => {
      const r = records.find((x) => String(x.bay) === String(b) && Number(x.slot) === Number(s));
      const blocker = !r ? getBlockingRecord(b, s) : null;
      const target = r || blocker;
      return target && String(target.number || '').toLowerCase().includes(searchVal);
    });

  const btnClass = isActive
    ? 'border-sky-600 bg-sky-600 text-white shadow-md ring-2 ring-sky-200'
    : hasSearchHit
      ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-300'
      : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-slate-100';

  const badgeClass = isActive
    ? 'bg-sky-800 text-sky-100'
    : hasSearchHit
      ? 'bg-emerald-600 text-white'
      : count > 0
        ? 'bg-sky-100 text-sky-800'
        : 'bg-slate-200 text-slate-600';

  return { btnClass, badgeClass };
}

function renderNavButtons() {
  const navButtons = $('bayNavButtons');

  navButtons.innerHTML = BAY_IDS.map((b) => {
    const count = getBayOccupiedSlotsCount(b);
    const maxSlots = slotsForBay(b).length;
    const { btnClass, badgeClass } = getNavButtonClasses(b);

    return `
      <button type="button" data-bay="${b}"
        class="bay-nav-btn flex shrink-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition ${btnClass}">
        <span>${bayLabel(b)}</span>
        <span data-bay-badge="${b}" class="rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}">${count}/${maxSlots}</span>
      </button>
    `;
  }).join('');
}

function scrollNavPillIntoView(bay) {
  const navContainer = $('bayNavButtons');
  const activeBtn = navContainer?.querySelector(`button[data-bay="${bay}"]`);
  if (!navContainer || !activeBtn) return;

  const btnLeft = activeBtn.offsetLeft;
  const btnRight = btnLeft + activeBtn.offsetWidth;
  const viewLeft = navContainer.scrollLeft;
  const viewRight = viewLeft + navContainer.clientWidth;

  if (btnLeft < viewLeft + 12) {
    navContainer.scrollTo({ left: Math.max(0, btnLeft - 12), behavior: 'smooth' });
  } else if (btnRight > viewRight - 12) {
    navContainer.scrollTo({ left: btnRight - navContainer.clientWidth + 12, behavior: 'smooth' });
  }
}

function syncNavActiveUI(scrollPill = true) {
  const navContainer = $('bayNavButtons');
  if (!navContainer) return;

  BAY_IDS.forEach((b) => {
    const btn = navContainer.querySelector(`button[data-bay="${b}"]`);
    const badge = navContainer.querySelector(`span[data-bay-badge="${b}"]`);
    if (!btn || !badge) return;

    const { btnClass, badgeClass } = getNavButtonClasses(b);
    btn.className = `bay-nav-btn flex shrink-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition ${btnClass}`;
    badge.className = `rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`;
  });

  if (scrollPill) {
    scrollNavPillIntoView(activeBay);
  }
}

function setProgrammaticScrollLock() {
  isProgrammaticScroll = true;
  if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
  programmaticScrollTimer = setTimeout(() => {
    isProgrammaticScroll = false;
  }, 650);
}

function releaseProgrammaticScrollLock() {
  if (isProgrammaticScroll) {
    isProgrammaticScroll = false;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
  }
}

function detectActiveBayOnScroll() {
  if (isProgrammaticScroll) return;
  const container = $('bays');
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const focalY = rect.top + Math.min(90, rect.height * 0.22);
  let bestBay = BAY_IDS[0];
  let minDistance = Infinity;

  BAY_IDS.slice().reverse().forEach((b) => {
    const panel = $('panel-' + b);
    if (!panel) return;
    const pRect = panel.getBoundingClientRect();
    const panelCenter = (pRect.top + pRect.bottom) / 2;
    const dist = Math.abs(panelCenter - focalY);
    if (dist < minDistance) {
      minDistance = dist;
      bestBay = b;
    }
  });

  if (String(bestBay) !== String(activeBay)) {
    activeBay = bestBay === 'AH' ? 'AH' : Number(bestBay);
    syncNavActiveUI(false);
  }
}

function render(preserveScroll = false) {
  const baysEl = $('bays');
  const prevScrollTop = preserveScroll && baysEl ? baysEl.scrollTop : 0;

  renderNavButtons();
  // Skeleton sedang aktif (load/import/reset): jangan timpa placeholder Bay
  // sebelum proses selesai. hideBaySkeleton() yang akan memanggil render ulang.
  if (baysEl && baysEl.dataset.skeleton === '1') return;

  baysEl.innerHTML = CARGO_HOLD_GROUPS.map((group) => `
    <section class="cargo-hold-group flex shrink-0 flex-col gap-3 rounded-2xl border-2 border-slate-400 bg-slate-50 p-3 md:gap-2.5 md:p-3 lg:gap-2.5 lg:p-3 print:gap-2 print:border print:p-2" aria-labelledby="cargo-hold-label-${group.id}">
      <h2 id="cargo-hold-label-${group.id}" class="cargo-hold-label m-0 text-xs font-black tracking-widest text-slate-900 md:text-xs print:text-[8pt]">${group.label}</h2>
      ${group.bays.map((b) => renderBayCard(b)).join('')}
    </section>
  `).join('');

  if (baysEl) {
    if (preserveScroll) {
      baysEl.scrollTop = prevScrollTop;
    } else {
      // Tampilan awal dimulai dari Bay paling bawah.
      baysEl.scrollTop = baysEl.scrollHeight;
      requestAnimationFrame(() => {
        baysEl.scrollTop = baysEl.scrollHeight;
      });
    }
  }

  updateSummary();
  renderAvailableContainerCards();
}

function focusContainerCell(bay, slot, closeMobile = false) {
  activeBay = bay === 'AH' ? 'AH' : Number(bay);
  render(true);

  if (closeMobile) {
    closeMobileSidebar();
  }

  scrollNavPillIntoView(activeBay);

  requestAnimationFrame(() => {
    const cellEl = $(`cell-${activeBay}-${slot}`);
    if (cellEl) {
      setProgrammaticScrollLock();
      cellEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

function handleContainerSearch(autoJump = true) {
  const rawVal = $('search').value || '';
  const query = rawVal.trim();
  const clearBtn = $('clearSearchBtn');
  const resultBox = $('searchResultBox');
  const statusText = $('searchStatusText');
  const matchList = $('searchMatchList');

  clearBtn.classList.toggle('hidden', query === '');

  if (!query) {
    resultBox.classList.add('hidden');
    matchList.innerHTML = '';
    render(true);
    return;
  }

  const matches = getSearchMatches(query);
  resultBox.classList.remove('hidden');

  if (matches.length === 0) {
    resultBox.className = 'space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5';
    statusText.className = 'text-[11px] font-semibold text-amber-900';
    statusText.textContent = 'Kontainer tidak ditemukan di semua Bay.';
    matchList.innerHTML = '';
    render(true);
    return;
  }

  resultBox.className = 'space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5';
  statusText.className = 'text-[11px] font-bold text-emerald-900';
  statusText.textContent = `Ditemukan ${matches.length} kontainer:`;

  matchList.innerHTML = matches
    .map((m) => {
      const primaryLoc = `${bayLabel(m.bay)} · ${getCellNo(m.bay, m.slot)}`;
      const blockedLoc = m.blockedTarget
        ? ` / ${getCellNo(m.blockedTarget.bay, m.blockedTarget.slot)}`
        : '';
      return `
      <button type="button" data-jump-bay="${esc(m.bay)}" data-jump-slot="${m.slot}"
        class="search-jump-btn flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-900 shadow-sm transition hover:bg-emerald-100">
        <span class="truncate font-mono">${esc(m.number)}</span>
        <span class="shrink-0 whitespace-nowrap rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
          ${esc(primaryLoc + blockedLoc)}
        </span>
      </button>
    `;
    })
    .join('');

  if (autoJump) {
    const first = matches[0];
    focusContainerCell(first.bay, first.slot, false);
  } else {
    render(true);
  }
}

function goBay(b) {
  activeBay = b === 'AH' ? 'AH' : Number(b);
  syncNavActiveUI(true);

  const el = $('panel-' + b);
  if (el) {
    setProgrammaticScrollLock();
    el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }
}

function updateSummary() {
  const totalCount = records.length;
  const count20 = records.filter((r) => r.size === '20 FT').length;
  const count21 = records.filter((r) => r.size === '21 FT').length;
  const count40 = records.filter((r) => r.size === '40 FT').length;
  const totalMov = formatTon(records.reduce((a, r) => a + Number(r.weight || 0), 0));

  $('mTotal').textContent = totalCount;
  $('m20').textContent = count20;
  $('m21').textContent = count21;
  $('m40').textContent = count40;
  $('mMov').textContent = totalMov;

  if ($('printSummaryLine')) {
    $('printSummaryLine').textContent = `Total: ${totalCount} Unit (20FT: ${count20} | 21FT: ${count21} | 40FT: ${count40}) · Total V.MOV: ${totalMov} TON`;
  }
}

