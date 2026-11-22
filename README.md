# Kastriva Employee Attendance

Fondasi Next.js + Vercel + Google Apps Script + Google Sheets + Google Drive.

## Menjalankan lokal (Windows PowerShell)
1. Jalankan npm install.
2. Salin .env.example menjadi .env.local.
3. Isi GAS_WEB_APP_URL dan GAS_SHARED_SECRET setelah deploy GAS.
4. Jalankan npm run dev dan buka http://localhost:3000.

## Menyiapkan GAS
1. Buat Google Spreadsheet baru, lalu buka Extensions > Apps Script.
2. Salin gas/Code.gs ke editor Apps Script.
3. Project Settings > Script Properties: tambahkan APP_SHARED_SECRET dengan secret acak panjang.
4. Jalankan setupSystem dari editor dan izinkan akses.
5. Deploy > New deployment > Web app; Execute as Me; Who has access Anyone.
6. Salin URL /exec.

## Vercel Environment Variables
Tambahkan GAS_WEB_APP_URL (URL Web App GAS berakhir /exec) dan GAS_SHARED_SECRET (nilai yang sama dengan APP_SHARED_SECRET). Atur untuk Production, Preview, dan Development lalu redeploy. Jangan gunakan prefix NEXT_PUBLIC_ untuk secret.

## Tahapan
1. Foundation: Next.js UI, health check, server-side GAS proxy, GAS bootstrap.
2. Login NIK + PIN dan sesi aman.
3. Selfie kamera, timestamp server, GPS dan geofence kantor.
4. Dashboard HR, laporan, retensi foto maksimal 14 hari.
5. Security hardening dan uji lapangan.

Belum untuk absensi produksi: autentikasi dan validasi geofence belum dibuat. Browser GPS dapat dimanipulasi; perlu mitigasi dan pemeriksaan server.
