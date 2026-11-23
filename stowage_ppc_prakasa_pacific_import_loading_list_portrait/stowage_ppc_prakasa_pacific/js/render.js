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
  const isDraggable = Boolean(activeContainer);
  const dragRecordId = activeContainer ? activeContainer.id : '';

  const cardSurface = isSearchMatch
    ? 'border-emerald-600 bg-emerald-50 ring-4 ring-emerald-400/70 shadow-lg scale-[1.01]'
    : hasRecord
      ? is40
        ? 'border-amber-400 bg-amber-50/90 hover:border-amber-500'
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
        : 'border-sky-200 bg-sky-100/80 text-sky-950'
      : isBlocked
        ? 'border-amber-200/80 bg-amber-100/60 text-amber-900'
        : 'border-slate-200 bg-slate-100/80 text-slate-700';

  const sizeBadge = isSearchMatch
    ? 'bg-emerald-200 text-emerald-950'
    : hasRecord
      ? is40
        ? 'bg-amber-200 text-amber-950'
        : 'bg-sky-200 text-sky-950'
      : isBlocked
        ? 'bg-amber-200/80 text-amber-950'
        : 'bg-transparent text-transparent';

  const blockerCellNo = isBlocked ? esc(getCellNo(blocker.bay, blocker.slot)) : '';
  let weightLabel = 'KOSONG';
  if (hasRecord && r.weight !== '') {
    weightLabel = is40 ? `${esc(formatHalfWeight(r.weight))} T` : `${esc(r.weight)} T`;
  } else if (isBlocked) {
    weightLabel = blocker.weight !== '' ? `${esc(formatHalfWeight(blocker.weight))} T` : `DARI ${blockerCellNo}`;
  }

  const loadPort = activeContainer ? esc(normalizePort(activeContainer.loadingPort) || '—') : '';
  const discPort = activeContainer ? esc(normalizePort(activeContainer.port) || '—') : '';

  return `
    <div id="cell-${esc(b)}-${s}" data-bay="${esc(b)}" data-slot="${s}"
      ${isDraggable ? `draggable="true" data-record-id="${esc(dragRecordId)}" title="${esc(activeContainer.remarks || 'Klik untuk edit, seret ke slot lain untuk pindah/tukar, atau seret ke bawah untuk membuang')}"` : ''}
      class="slot-card group relative flex h-full min-h-[92px] md:min-h-[66px] lg:min-h-[98px] min-w-[120px] md:min-w-[100px] lg:min-w-[128px] flex-col justify-between overflow-hidden rounded-xl md:rounded-lg lg:rounded-xl border transition duration-150 print:min-h-[68px] print:min-w-0 print:rounded-md print:border-slate-800 print:shadow-none ${cursorClass} ${cardSurface} ${dimClass}">
      <!-- Top Cell & Weight Strip -->
      <div class="flex items-center justify-between gap-1.5 border-b px-2.5 py-1 text-[11px] font-bold print:border-slate-800 print:px-1 print:py-0.5 print:text-[7.5px] ${headerBg}">
        <span class="shrink-0 whitespace-nowrap tracking-tight">${esc(getCellNo(b, s))}</span>
        <span class="shrink-0 whitespace-nowrap ${hasRecord || isBlocked ? '' : 'text-slate-400 print:hidden'}">${weightLabel}</span>
      </div>

      <!-- Center Container Number -->
      <div class="relative flex flex-1 flex-col items-center justify-center px-2 py-1.5 text-center print:px-0.5 print:py-1">
        ${hasRecord
      ? `<span class="whitespace-nowrap font-mono text-sm font-black tracking-tight text-slate-900 print:break-all print:whitespace-normal print:text-[8.5px] print:leading-tight">${esc(r.number)}</span><span class="mt-0.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-800 print:text-[6px]">${esc(r.type || 'DC')}</span>${r.remarks ? `<span class="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium text-slate-600 print:hidden" title="${esc(r.remarks)}">Remarks: ${esc(r.remarks)}</span>` : ''}`
      : isBlocked
        ? `<span class="relative z-10 rounded bg-amber-100/90 px-1.5 py-0.5 whitespace-nowrap font-mono text-xs font-black tracking-tight text-amber-950 print:break-all print:whitespace-normal print:text-[8px] print:leading-tight">${esc(blocker.number)}</span>
           `
        : `<span class="whitespace-nowrap text-xs font-semibold text-slate-400 group-hover:text-sky-600 print:hidden">Nomor Container</span>`
    }
      </div>

      <!-- Bottom Route & Size Strip -->
      <div class="flex min-h-[26px] items-center justify-between gap-1.5 border-t border-slate-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-bold print:min-h-[16px] print:border-slate-800 print:px-1 print:py-0.5 print:text-[7px]">
        ${hasRecord
      ? `<span class="shrink-0 whitespace-nowrap text-slate-700">${loadPort}&rarr;${discPort}</span>
               <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                 ${esc(r.size || '20 FT')}
               </span>`
      : isBlocked
        ? `<span class="shrink-0 whitespace-nowrap text-amber-800/80">${loadPort}&rarr;${discPort}</span>
                 <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-extrabold print:px-1 print:py-0 print:text-[6.5px] ${sizeBadge}">
                   40 FT
                 </span>`
        : `<span class="select-none text-transparent">&nbsp;</span>`
    }
      </div>
        ${isBlocked ? `<span class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center print:z-50" aria-hidden="true">
          <span class="text-black text-[7rem] md:text-[10rem] lg:text-[11rem] font-black leading-none print:text-5xl">×</span>
        </span>` : ''}
    </div>
  `;
}

function vmovCardHTML(title, rows, ttlWeight) {
  const breakdownHTML = rows
    .map(
      (item) => `
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 py-1 text-xs last:border-b-0 print:py-0.5 print:text-[7.5px] print:leading-tight">
        <span class="whitespace-nowrap font-medium text-slate-500 print:text-slate-700">${item.label}</span>
        <span class="whitespace-nowrap font-bold text-slate-800">${item.weight.toFixed(2)} T</span>
      </div>
    `
    )
    .join('');

  return `
    <div class="flex h-full flex-col justify-between rounded-2xl md:rounded-xl lg:rounded-2xl border border-slate-200 bg-slate-50 p-2.5 md:p-2 lg:p-3 shadow-sm print:rounded-lg print:border-slate-800 print:bg-white print:p-1.5 print:shadow-none">
      <div>
        <div class="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1.5 print:border-slate-400 print:pb-1">
          <span class="whitespace-nowrap text-[10px] md:text-[11px] font-extrabold tracking-wider text-slate-900 uppercase print:text-[7px] print:leading-tight print:tracking-normal">${title}</span>
          <span class="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 print:hidden">V.MOV</span>
        </div>
        <div class="mt-1 print:mt-0.5">
          ${breakdownHTML}
        </div>
      </div>

      <div class="mt-2.5 md:mt-1 lg:mt-2.5 flex items-center justify-between gap-2 rounded-xl md:rounded-lg lg:rounded-xl bg-sky-600 px-2.5 md:px-2 lg:px-2.5 py-1.5 md:py-1 lg:py-1.5 text-white print:mt-1 print:rounded print:border print:border-slate-800 print:bg-slate-100 print:px-1.5 print:py-0.5 print:text-slate-900">
        <span class="whitespace-nowrap text-[10px] font-bold tracking-wider uppercase print:text-[6.5px] print:tracking-normal">TTL</span>
        <span class="whitespace-nowrap text-xs font-extrabold sm:text-sm print:text-[8px]">${ttlWeight.toFixed(2)} TON</span>
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
  const partner40List = b === 'AH' ? [] : records.filter((r) => r.size === '40 FT' && Number(getPartnerBayFor40Ft(r)) === Number(b));
  const total = getBayTotalWeight(b);
  const count20 = list.filter((r) => r.size === '20 FT').length;
  const count40 = list.filter((r) => r.size === '40 FT').length + partner40List.length;
  const occupiedSlots = getBayOccupiedSlotsCount(b);
  const title = bayLabel(b);

  // Pada tablet (md: 768px-1023px), panel menyesuaikan lebar layar tablet agar nyaman dilihat tanpa terpotong
  const panelWidthClass = 'w-full min-w-0 max-w-none shrink-0 print:w-full print:shrink';

  let contentHTML = '';

  if (b === 'AH') {
    contentHTML = `
      <div class="grid flex-1 grid-cols-[minmax(0,1fr)_108px] md:grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
        <div class="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50/60 p-3 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
          <div class="mx-auto grid w-full max-w-[340px] grid-cols-2 gap-3 print:max-w-none print:gap-2">
            ${[4, 3].map((s) => slotCardHTML('AH', s, true)).join('')}
          </div>
        </div>

        <aside class="flex flex-col justify-center h-[12rem] md:h-full md:min-h-[136px] lg:h-[12rem]">
          ${vmovCardHTML('AFTER HATCH', [{ label: 'Tier 82', weight: total }], total)}
        </aside>
      </div>
    `;
  } else if (Number(b) === 13) {
    const v82 = getBaySlotsWeight(13, [5, 6, 7, 8]);

    contentHTML = `
      <div class="grid flex-1 border grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_196px] gap-3 p-3 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5 print:p-2">
        <div class="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
          <div class="grid grid-cols-4 gap-2 print:gap-1">
            ${[5, 6, 7, 8].map((s) => slotCardHTML(13, s, false)).join('')}
          </div>
        </div>

        <aside class="flex flex-col justify-center h-[12rem] md:h-full md:min-h-[136px] lg:h-[12rem]">
          ${vmovCardHTML('BAY 13 ON DECK', [{ label: 'Tier 82', weight: v82 }], v82)}
        </aside>
      </div>
    `;
  } else {
    const deck84 = getBaySlotsWeight(b, [2, 3]);
    const deck82 = getBaySlotsWeight(b, [5, 6, 7, 8]);
    const hole04 = getBaySlotsWeight(b, [9, 10, 11, 12]);
    const hole02 = getBaySlotsWeight(b, [13, 14, 15, 16]);

    contentHTML = `
      <div class="flex flex-1 flex-col gap-3 md:gap-1.5 lg:gap-3 p-2.5 md:p-2 lg:p-2.5 print:space-y-1.5 print:p-2">
        <!-- ON DECK ZONE -->
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_160px] lg:grid-cols-[minmax(0,1fr)_196px] gap-2 md:gap-1.5 lg:gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-1.5 md:p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
            <div class="grid flex-1 grid-rows-2 gap-2 print:gap-1">
              <!-- Tier 84 (2 center slots) -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                <div></div>
                ${slotCardHTML(b, 2, true)}
                ${slotCardHTML(b, 3, true)}
                <div></div>
              </div>
              <!-- Tier 82 (4 full slots) -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[5, 6, 7, 8].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
            </div>
          </section>

          <aside class="flex flex-col justify-center h-[12rem] md:h-full md:min-h-[136px] lg:h-[12rem]">
            ${vmovCardHTML(
      `BAY ${String(b).padStart(2, '0')} ON DECK`,
      [
        { label: 'Tier 84', weight: deck84 },
        { label: 'Tier 82', weight: deck82 }
      ],
      deck84 + deck82
    )}
          </aside>
        </div>

        <!-- HATCH COVER DIVIDER -->
        <div class="relative flex shrink-0 items-center justify-center py-0.5 print:py-0">
          <div class="h-1.5 w-full rounded-full bg-slate-800 print:h-0.5 print:bg-slate-900"></div>
          <span class="absolute whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-0.5 text-[9px] font-extrabold tracking-widest text-slate-600 uppercase print:px-2 print:py-0 print:text-[7px]">
            COVER
          </span>
        </div>

        <!-- IN HOLE ZONE -->
        <div class="grid flex-1 grid-cols-[minmax(0,1fr)_172px] md:grid-cols-[minmax(0,1fr)_160px] lg:grid-cols-[minmax(0,1fr)_196px] gap-2 md:gap-1.5 lg:gap-2.5 print:grid-cols-[minmax(0,1fr)_102px] print:gap-1.5">
          <section class="flex flex-col p-1.5 md:p-2 print:rounded-lg print:border-slate-400 print:bg-white print:p-1.5">
            <div class="grid flex-1 grid-rows-2 gap-2 print:gap-1">
              <!-- Tier 04 -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[9, 10, 11, 12].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
              <!-- Tier 02 -->
              <div class="grid h-full grid-cols-4 gap-2 print:gap-1">
                ${[13, 14, 15, 16].map((s) => slotCardHTML(b, s, false)).join('')}
              </div>
            </div>
          </section>

          <aside class="flex flex-col justify-center h-[12rem] md:h-full md:min-h-[136px] lg:h-[12rem]">
            ${vmovCardHTML(
      `BAY ${String(b).padStart(2, '0')} IN HOLE`,
      [
        { label: 'Tier 04', weight: hole04 },
        { label: 'Tier 02', weight: hole02 }
      ],
      hole04 + hole02
    )}
          </aside>
        </div>
      </div>
    `;
  }

  return `
    <article id="panel-${b}" data-bay-panel="${b}"
      class="bay-panel flex flex-col overflow-hidden rounded-2xl md:rounded-xl lg:rounded-2xl border border-slate-200 bg-white shadow-md print:break-inside-avoid print:rounded-lg print:border-slate-800 print:shadow-none ${panelWidthClass}">
      <!-- Bay Card Header -->
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-3.5 md:px-4 py-2 md:py-2.5 text-white print:bg-slate-100 print:px-2.5 print:py-1.5 print:text-slate-900">
        <div class="flex items-center gap-2 md:gap-2.5 print:gap-1.5">
          <h2 class="whitespace-nowrap text-sm md:text-base font-extrabold tracking-wide print:text-xs">${title}</h2>
          <div class="flex items-center gap-1.5 text-[11px] print:gap-1 print:text-[8.5px]">
            <span class="whitespace-nowrap rounded-lg bg-sky-500/20 px-2 py-0.5 font-bold text-sky-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1.5 print:py-0 print:text-slate-800">
              20FT: ${count20}
            </span>
            <span class="whitespace-nowrap rounded-lg bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 print:rounded print:border print:border-slate-400 print:bg-transparent print:px-1.5 print:py-0 print:text-slate-800">
              40FT: ${count40}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs font-bold print:gap-1.5 print:text-[8.5px]">
          <span class="whitespace-nowrap text-slate-300 print:text-slate-700">${occupiedSlots} / ${slotsForBay(b).length} Slot</span>
          <span class="whitespace-nowrap rounded-xl bg-sky-600 px-2.5 md:px-3 py-1 text-white print:rounded print:border print:border-slate-800 print:bg-white print:px-1.5 print:py-0.5 print:text-slate-900">
            V.MOV ${total.toFixed(2)} TON
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
  baysEl.innerHTML = BAY_IDS.slice().reverse().map((b) => renderBayCard(b)).join('');

  if (baysEl) {
    if (preserveScroll) {
      baysEl.scrollTop = prevScrollTop;
    } else {
      // Tampilan awal dimulai dari Bay 13 yang berada di bagian paling bawah.
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
  const uniqueRecords = uniqueStowageRecords(records);
  const totalCount = uniqueRecords.length;
  const count20 = uniqueRecords.filter((r) => r.size === '20 FT').length;
  const count40 = uniqueRecords.filter((r) => r.size === '40 FT').length;
  const totalMov = uniqueRecords.reduce((a, r) => a + Number(r.weight || 0), 0).toFixed(2);

  $('mTotal').textContent = totalCount;
  $('m20').textContent = count20;
  $('m40').textContent = count40;
  $('mMov').textContent = totalMov;

  if ($('printSummaryLine')) {
    $('printSummaryLine').textContent = `Total: ${totalCount} Unit (20FT: ${count20} | 40FT: ${count40}) · Total V.MOV: ${totalMov} TON`;
  }
}

