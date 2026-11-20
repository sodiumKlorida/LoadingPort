const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/uk78l777buob7?sheet=CONTAINER_DATABASE';
const DB_CACHE_KEY = 'stowageSheetDbCacheV2';

let databaseRows = [];
let selectedDatabaseRow = null;
let activeBay = 'AH';
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

// Sidebar View & Filter State
let sidebarViewMode = 'main'; // 'main' | 'containers'
let sidebarSizeFilter = 'ALL'; // 'ALL' | '20' | '40'

// Drag & Drop State (baik dari slot bay maupun dari list container sidebar)
let draggedItem = null; // { source: 'slot', record: {...} } | { source: 'pool', container: {...} }
let autoScrollRaf = null;
let autoScrollVelocity = 0;

// Urutan dari BOW (kiri) ke STERN (kanan): AH -> 1 -> 3 -> 5 -> 7 -> 9 -> 11 -> 13
const BAY_IDS = ['AH', 1, 3, 5, 7, 9, 11, 13];
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

let records = JSON.parse(localStorage.getItem('stowageRecords') || '[]');
const $ = (id) => document.getElementById(id);

