REVISI TAILWIND-ONLY

- File css/style.css dihapus.
- Link stylesheet lokal di index.html dihapus.
- Seluruh tampilan utama menggunakan utility class Tailwind CSS melalui CDN.
- Komponen dinamis (kartu kontainer, Bay, cargo hold, dan halaman cetak) menggunakan utility class Tailwind.
- Animasi swap khusus berbasis stylesheet dihilangkan dan diganti feedback transisi utility Tailwind.
- Struktur fungsi API, drag-and-drop, import, posisi Bay, dan kalkulasi dipertahankan.

Catatan: Tailwind CDN harus dapat diakses saat aplikasi dibuka. Pengaturan cetak menggunakan utility print: Tailwind; ukuran kertas mengikuti pengaturan print browser.


REVISI PRINT/PREVIEW PORTRAIT
- Urutan Bay saat cetak: nomor terbesar ke terkecil (contoh Bay 15 sampai Bay 1).
- Layout cetak: A4 Portrait, dua Bay per halaman dalam satu kolom vertikal agar terbaca.
- Preview cetak dibangun dari Bay aktual; data dan posisi kontainer tidak diubah.
- Pada dialog Print browser pilih Paper: A4, Layout: Portrait, Scale: Fit to printable area atau 100% jika hasil masih muat, dan aktifkan Background graphics.


REVISI LANJUTAN
- Format tonase menghilangkan nol desimal yang tidak perlu (23.000 menjadi 23 TON; 23.5 tetap 23.5 TON).
- Format diterapkan pada berat slot, pembagian berat 40 FT, total Bay, V.MOV, dan total ringkasan.
- Label pelabuhan pada Bay mengambil data dari record posisi dan fallback ke data kontainer Laravel berdasarkan nomor kontainer.
- Modal input dan modal pengosongan data dinaikkan ke lapisan teratas agar List Container tidak menimpa form.
- Layout cetak tetap menggunakan halaman A4 portrait, dua Bay per halaman, urutan Bay tertinggi ke terendah.


REVISI PRINT + DATA PELABUHAN
- Print renderer mengambil semua .bay-panel dari seluruh Cargo Hold, meratakan grup,
  lalu mengurutkan nomor Bay terbesar ke terkecil.
- Output cetak: dua Bay per halaman dalam satu kolom vertikal; tidak ada kolom Cargo Hold.
- Area aplikasi asli dan printHeader asli disembunyikan saat print; hanya printPages dan
  header hasil clone yang dicetak.
- mapPosition menggabungkan relasi container dari endpoint positions dengan master
  containers yang telah dimuat dari Laravel, menggunakan container_id / nomor normalisasi.
- Normalisasi nomor kontainer menghapus spasi, tanda hubung, dan karakter pemisah lain.
- Label pelabuhan per kontainer diprioritaskan dibanding pelabuhan voyage; voyage hanya fallback.
CATATAN UJI: JavaScript diperiksa dengan node --check. Browser print preview dan integrasi
API harus diuji pada server pengguna; ukuran A4 Portrait dipilih pada dialog cetak browser.


REVISI PERBAIKAN PRINT BLANK + NAMA PELABUHAN
- Memperbaiki bug pemilihan elemen stack cetak: sebelumnya selector ':scope > div'
  dapat memilih header clone, sehingga panel Bay masuk ke elemen yang salah.
- Stack halaman cetak sekarang memakai class khusus 'print-bay-stack'.
- Halaman cetak dibangun sebelum window.print dipanggil, dengan beforeprint sebagai fallback.
- Utility Tailwind print yang dibuat dinamis ditambahkan ke safelist HTML agar tersedia saat print media aktif.
- appRoot disembunyikan saat print; hanya printPages yang terlihat.
- Nama pelabuhan tidak lagi dipendekkan menjadi SUB/WGP; nama lengkap dipertahankan.
- Pemetaan frontend sekarang menyimpan destinationPort dan alias port.
- mapPosition tidak membiarkan relasi kosong/null menimpa nilai master Laravel.

PERUBAHAN BACKEND YANG WAJIB DILAKUKAN DI ContainerController.php
Frontend ZIP tidak mengandung project Laravel. Pada method import() di backend, tambahkan
dua aturan berikut ke array validation:
    'containers.*.loading_port' => ['nullable', 'string', 'max:100'],
    'containers.*.destination_port' => ['nullable', 'string', 'max:100'],

Dengan demikian, row yang sudah dikirim api-bridge.js akan benar-benar disimpan oleh
Container::create($row). Method store() Anda sudah memiliki kedua aturan tersebut.
Jika data lama telah diimport sebelum perbaikan ini, lakukan update/re-import data pelabuhan
pada master containers; perubahan frontend tidak dapat memulihkan nilai yang belum tersimpan.


REVISI TERBARU - CELL CETAK UTUH + RUTE DARI SIDEBAR
- Tinggi panel Bay saat cetak diseragamkan menjadi 126mm agar seluruh lima baris slot dan panel V.MOV tidak terpotong.
- Halaman A4 portrait menggunakan tinggi 277mm, header 10mm, dua Bay per halaman vertikal.
- Bay tidak lagi dipaksa mengecil dengan flex:1; setiap panel memiliki tinggi cetak tetap yang sama.
- Rute pada Bay Content sekarang mengambil nilai langsung dari form sidebar stowageLoadingPort dan stowageDestinationPort.
- Data pelabuhan master kontainer hanya menjadi fallback jika salah satu input sidebar kosong.
- Loading List yang diberikan tidak memiliki kolom pelabuhan; karena itu nilai pelabuhan diambil dari form sidebar saat import.
- Lihat BACKEND_CONTAINER_IMPORT_PATCH.txt untuk dua aturan validasi yang harus ditambahkan pada Laravel ContainerController::import().
CATATAN: Sintaks JavaScript dapat diperiksa secara lokal; hasil visual print tetap perlu diuji pada browser dengan Paper A4, Layout Portrait, dan margin default/minimal yang tidak memotong area cetak.


REVISI PANEL TONASE BAY
- Panel ringkasan di sisi kanan Bay disatukan menjadi satu panel per Bay.
- Judul panel menggunakan identitas Bay (contoh: BAY 11), bukan ON DECK / IN HOLE.
- Panel menampilkan gabungan Tier 10, Tier 8, Tier 6, Tier 04, dan Tier 02 beserta satu TTL.
- Susunan slot kiri tetap lima baris dalam satu struktur Bay.
- Regex normalizePort (/\s+/g) dan fallback ukuran feet (/\D/g) sudah benar pada source; tidak perlu perubahan tambahan.
- Print tetap memakai tinggi panel 126mm, dua Bay per halaman, satu kolom vertikal.


REVISI PREVIEW CETAK + FORMAT TIER
- index.html mengunci @page A4 portrait dengan margin 8mm, sehingga preview tidak
  berantakan walaupun dialog browser default ke Letter / margin lain.
- Halaman cetak tidak lagi dipaksa tinggi 277mm dan overflow-hidden; tinggi
  mengikuti konten dua panel Bay agar tidak ada panel yang terpotong atau
  halaman kosong.
- Label tabel tonase kanan memakai dua digit semua: Tier 10, Tier 08, Tier 06,
  Tier 04, Tier 02.
- Pengujian: node --check pada JS dan cetak headless Chrome menghasilkan 4 halaman
  A4, dua Bay per halaman, tanpa teks bertumpang tindih.


REVISI HEMAT KERTAS + LABEL CARGO HOLD
- Print sekarang empat Bay per halaman (grid 2x2) dalam A4 portrait, sehingga
  8 Bay hanya memakai 2 lembar.
- Setiap halaman cetak membungkus Bay dengan border dan label Cargo Hold sesuai
  tampilan web (CARGO HOLD 2 untuk Bay 15-9, CARGO HOLD 1 untuk Bay 7-1).
- Urutan Bay tetap menurun di dalam tiap Cargo Hold.
- Ukuran font print disesuaikan agar nomor kontainer dan rute tetap terbaca pada
  kartu yang lebih sempit, tanpa merusak tampilan layar.
- Pengujian: 2 halaman A4, empat Bay per halaman, tidak ada teks bertumpang.


REVISI RESET DATA PERMANEN
- Modal reset sekarang memakai dua tombol terpisah:
  1. "Kosongkan Bay Content": PUT /plans/{plan}/positions dengan positions: [].
  2. "Hapus permanen data import Excel": DELETE /containers/imported/reset,
     lalu PUT /plans/{plan}/positions dengan positions: [], lalu muat ulang
     master kontainer dari GET /containers.
- api-bridge.js menambah window.clearBayPositions dan window.resetImportedContainers.
- Sebelum reset, debounce save dibatasi dan queue ditunggu agar posisi lama tidak
  tersimpan kembali setelah Bay dikosongkan.
- Kontainer input manual tidak dihapus; yang dihapus permanen hanya data hasil
  import Excel (sesuai route backend resetImported).


REVISI KARTU BAY SAAT CETAK
- Kartu slot pada hasil cetak hanya menampilkan: No Cell, Nomor Kontainer, dan
  Tonase. Rute pelabuhan, ukuran (20/40 FT), tipe kontainer, dan tanda silang
  blocker disembunyikan khusus saat print (tampilan layar tidak berubah).
- Tujuan: mengurangi kepadatan teks di grid 2x2 agar preview tidak bertumpang
  dan tetap terbaca.
- Pengujian: PDF 2 halaman A4, label Cargo Hold tetap ada, tidak ada teks rute
  di dalam kartu Bay.


REVISI 8 BAY DALAM 1 HALAMAN
- print-layout.js sekarang mengelompokkan maksimal delapan Bay per halaman,
  sehingga 8 Bay (dua Cargo Hold) cukup satu lembar A4 portrait. Jika Bay
  bertambah, halaman berikutnya dibuat otomatis.
- Cargo Hold 2 dan Cargo Hold 1 tetap masing-masing mendapat border + label,
  masing-masing berisi empat Bay dalam grid 2x2.
- Ukuran panel cetak diturunkan ke 60mm per Bay; font No Cell, nomor kontainer,
  tonase, dan label Tier disesuaikan (5-6px) agar muat tanpa tumpang tindih.
- Pengujian dengan data simulasi 36 kontainer: PDF 1 halaman, kedua label Cargo
  Hold tampil, 40 label Tier tampil, dan tidak ada tumpang tindih kata.


REVISI PILIHAN ORIENTASI CETAK
- Sidebar kini punya toggle "Portrait / Landscape" di atas tombol cetak.
- Pilihan disimpan di localStorage (stowagePrintOrientation) dan diterapkan
  lagi saat halaman dibuka.
- ui-state.js menulis ulang aturan @page pada #printOrientationStyle, karena
  @page tidak bisa diatur memakai selector class biasa.
- print-layout.js menyesuaikan susunan: Portrait = 2 kolom per Cargo Hold dengan
  panel 60mm; Landscape = 4 kolom per Cargo Hold dengan panel 78mm. Keduanya
  tetap memuat 8 Bay dalam satu halaman A4.
- Label tombol cetak ikut menunjukkan orientasi yang aktif.
- Pengujian: klik toggle Landscape menghasilkan PDF 842x595 pt (A4 landscape),
  1 halaman, dua label Cargo Hold, tanpa tumpang tindih kata; Portrait tetap
  595x842 pt seperti sebelumnya.


REVISI TANDA SILANG 40 FT SAAT CETAK
- Tanda "×" pada slot yang diblokir pasangan 40 FT kini ikut tampil di hasil
  cetak (sebelumnya sengaja disembunyikan karena ukurannya terlalu besar).
- Tanda silang kini menjadi anak langsung kartu slot (kartu diberi position:
  relative), sehingga menutupi seluruh area cell seperti di tampilan web.
- Warna tanda silang hitam penuh (opacity 100%), z-index 50 (paling depan),
  sehingga benar-benar menutupi nomor kontainer di hasil cetak.
- Ukuran cetak tanda silang 44px; layar memakai 112px/160px/176px sesuai
  breakpoint sehingga memenuhi kotak pada tablet 10 inci.
- Pengujian tablet 10 inci (1024x768 landscape dan 800x1280 portrait):
  wrapper silang menutupi seluruh kartu, z-index 50, warna rgb(0,0,0), dan
  berada di atas nomor (z-index 10).
- Pengujian cetak Portrait dan Landscape: tanda "×" tampil pada data uji dan
  tetap satu halaman A4. Tumpang tindih silang dengan teks memang disengaja
  karena silang berada paling depan.


REVISI RESET SEMUA KONTAINER
- Tombol reset merah sekarang berlabel "Hapus permanen semua kontainer" dan
  teks konfirmasinya menyebut import Excel DAN input manual.
- api-bridge.js: window.resetAllContainers memanggil route reset yang sama,
  dengan alias lama window.resetImportedContainers untuk kompatibilitas.
- modal.js: clearAllContainersAndBay menghapus semua kontainer, mengosongkan
  Bay, lalu memuat ulang master kontainer dari GET /containers.
- Catatan backend: endpoint DELETE /containers/imported/reset harus diubah agar
  menghapus seluruh baris containers (tanpa filter source = IMPORT). Jika ada
  tabel lain dengan FK ke containers, hapus baris tersebut lebih dulu.


REVISI LEBAR TABEL TONASE SAAT CETAK
- Kolom V.MOV / tonase di cetak dipersempit dari 84px menjadi 60px, sehingga
  area Bay (nomor kontainer) mendapat ruang lebih besar di Portrait maupun
  Landscape.
- Padding kartu tonase print dikurangi (p-0.5), header pb-0.5, dan TTL px-0.5.
  Ukuran font tetap 5px/6px agar keterbacaan tidak berubah.
- Pengujian: Portrait bay section 315px + aside 60px; Landscape bay section
  202px + aside 60px. Tidak ada teks tabel tonase yang meluap. PDF tetap 1
  halaman A4 pada kedua orientasi.


REVISI SKELETON LOADING
- Skeleton ditampilkan saat halaman dimuat, saat import Excel, dan saat reset:
  1. Page load: seluruh area List Container + Bay memakai placeholder animate-pulse;
     ditutup setelah container, voyage, dan plan aktif selesai dimuat.
  2. Import Excel: kartu List Container memakai skeleton selama parse/upload/reload.
  3. Kosongkan Bay Content: area Bay memakai skeleton sampai PUT positions selesai.
  4. Hapus permanen semua kontainer: List Container + Bay memakai skeleton sampai
     reset, pengosongan posisi, dan reload master selesai.
- Helper di ui-state.js memakai counter (dataset.skeletonCount), sehingga skeleton
  tidak hilang lebih awal bila beberapa proses berjalan bersamaan.
- render() dan renderAvailableContainerCards() tidak menimpa placeholder selama
  skeleton aktif; hide helper yang memanggil render ulang setelah selesai.
- Utility Tailwind skeleton ditambahkan ke safelist index.html; elemen safelist
  disembunyikan sehingga tampilan layar/cetak tidak berubah.
- Pengujian: node --check semua JS; unit counter skeleton; simulasi browser dengan
  API mock untuk page load, reset, clear, dan import menunjukkan skeleton muncul
  lalu hilang, dengan urutan DELETE reset -> PUT positions [] -> GET containers.


REVISI LAYOUT TABLET
- Scroll vertikal Bay sekarang aktif mulai breakpoint md (768px): halaman tidak
  ikut bergeser, area #bays yang melakukan scroll internal dengan dock tetap di atas.
- Toggle panel samping memakai breakpoint Tailwind lg (1024px) yang sebenarnya.
  Di 900-1023px tombol ">" sekarang membuka drawer sidebar (sebelumnya hanya
  menambah kelas lg:hidden yang tidak berpengaruh).
- Sidebar drawer dinaikkan ke z-[90] dan backdrop ke z-[85], sehingga List
  Container (z-[80]) tidak lagi menindih sidebar saat drawer dibuka.
- Ikon toggle ikut diperbarui saat drawer dibuka/ditutup, dan drawer ditutup
  otomatis saat viewport berubah ke desktop.
- Pengujian headless Chrome pada 1024x768, 900x1200, dan 800x1280: scroll mouse
  menggeser #bays (scrollTop 600) tanpa menggeser body/html; toggle membuka drawer
  pada 900/800px; hit-test di area sidebar jatuh ke sidebar, bukan dock.
- Cetak tetap 1 halaman A4 Portrait setelah perubahan breakpoint (595x842 pt).


REVISI POLLING AJAX SINKRONISASI POSISI
- AJAX dipasang di frontend (js/api-bridge.js), bukan di backend. Backend cukup
  menyediakan JSON; route yang dipakai tetap GET /plans/{plan}/positions.
- Setelah data awal siap, frontend menjalankan polling setiap 5000 ms. Jika tanda
  tangan posisi berubah, records diperbarui dan Bay digambar ulang dengan
  render(true) agar posisi scroll user tidak melompat.
- Tanda tangan diambil dari snapshot_no/version/updated_at bila tersedia,
  digabung dengan daftar id/container_id/bay/slot/cell_no/mov/dir40. Jika tidak
  ada perubahan, polling tidak menggambar ulang UI.
- Polling ditunda saat tab tersembunyi, skeleton masih aktif, proses save belum
  selesai / localDirty, dragging berlangsung, atau plan sedang dimuat. Setelah
  save/clear berhasil, tanda tangan dikosongkan agar kondisi kanonis diambil lagi.
- Fungsi manual untuk pengujian: window.syncStowageNow().
- Opsi backend (tidak wajib): sertakan snapshot_no atau updated_at pada response
  GET /plans/{plan}/positions agar deteksi perubahan lebih murah.
- Pengujian browser mock: polling manual menambah posisi user lain tanpa refresh;
  polling otomatis 5 detik juga bekerja; tidak ada render ulang saat data sama;
  polling tidak menimpa data saat draggedItem aktif. Regresi skeleton, tablet,
  dan cetak 1 halaman A4 tetap lulus.
