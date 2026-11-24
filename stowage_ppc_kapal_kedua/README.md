# Stowage Plan PPC — Laravel API

Frontend ini menggunakan Laravel API sebagai sumber data utama. SheetDB/Google Sheets tidak digunakan.

## Konfigurasi API
Alamat API aktif diatur pada bagian awal script `index.html`:
`https://wrench-regular-glitzy.ngrok-free.dev/api`

Jika alamat tunnel ngrok berubah, perbarui `window.STOWAGE_API_BASE` di `index.html`.

## Menjalankan frontend
Buka folder ini dengan VS Code Live Server (atau web server statis lain). Jangan membuka file melalui `file://`.

## Catatan koneksi
- Backend harus aktif di Docker pada port host 8000.
- Ngrok harus meneruskan HTTPS ke `http://localhost:8000`.
- Laravel harus mengizinkan CORS dari origin frontend yang digunakan.
- Request API mengirim header `ngrok-skip-browser-warning`.
- Data voyage, container, dan posisi stowage dibaca/disimpan melalui Laravel API.
- Browser storage tidak dipakai sebagai database posisi.
