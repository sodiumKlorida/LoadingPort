const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/7bh7fxoh4afcw?sheet=CONTAINER_DATABASE';
const DB_CACHE_KEY = 'stowageSheetDbCacheV2';

let databaseRows = [];
let selectedDatabaseRow = null;
let activeBay = 13;
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

// Sidebar View & Filter State
let sidebarViewMode = 'main'; // 'main' | 'containers'
let sidebarSizeFilter = 'ALL'; // 'ALL' | '20' | '40'
let sidebarTonnageSort = 'none'; // 'none' | 'asc' | 'desc'

// Drag & Drop State (baik dari slot bay maupun dari list container sidebar)
let draggedItem = null; // { source: 'slot', record: {...} } | { source: 'pool', container: {...} }
let autoScrollRaf = null;
let autoScrollVelocity = 0;

// Urutan tampilan: BAY 13 -> 11 -> 9 -> 7 -> 5 -> 3 -> 1 -> AFTER HATCH
const BAY_IDS = [13, 11, 9, 7, 5, 3, 1, 'AH'];
const ALLOWED_SLOTS = [2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const BAY_SLOTS = { AH: [4, 3], 13: [5, 6, 7, 8] };

const CELL_LAYOUT = {
    2: { row: 2, tier: 84 },
    3: { row: 1, tier: 84 },
    5: { row: 4, tier: 82 },
    6: { row: 2, tier: 82 },
    7: { row: 1, tier: 82 },
    8: { row: 3, tier: 82 },
    9: { row: 4, tier: 4 },
    10: { row: 2, tier: 4 },
    11: { row: 1, tier: 4 },
    12: { row: 3, tier: 4 },
    13: { row: 4, tier: 2 },
    14: { row: 2, tier: 2 },
    15: { row: 1, tier: 2 },
    16: { row: 3, tier: 2 }
};

// Akses storage dibungkus agar aplikasi tetap bisa dibuka pada browser yang memblokir localStorage.
function safeStorageGet(key, fallback = null) {
    try { return window.localStorage.getItem(key) ?? fallback; }
    catch (err) { console.warn('localStorage tidak dapat dibaca:', err); return fallback; }
}
function safeStorageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (err) { console.error('localStorage tidak dapat ditulis:', err); return false; }
}
let storageWarningShown = false;
let records = (() => {
    try {
        const parsed = JSON.parse(safeStorageGet('stowageRecords', '[]') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('Data stowage tersimpan tidak valid:', err);
        return [];
    }
})();
const $ = (id) => document.getElementById(id);

