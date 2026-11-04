RAILWAY SLOWDNS - PATCH UDPGW 1.0.3

Isi patch:
- Dockerfile: membangun BadVPN UDPGW dari source resmi dan menyalin binary ke image runtime.
- start.js: menjalankan badvpn-udpgw pada 127.0.0.1:7300 sebelum sshd/DNSTT; startup memverifikasi listener siap.

Cara menerapkan:
1. Buka repository proyek Railway Anda.
2. Ganti Dockerfile lama dengan Dockerfile dari patch ini.
3. Ganti start.js lama dengan start.js dari patch ini.
4. Commit dan push perubahan agar Railway melakukan build/deploy ulang.
5. Jangan ubah environment DNS_ZONE, PRIVATE_KEY, dan SSH_PASSWORD untuk patch ini.
6. Jangan expose port 7300 ke publik. UDPGW sengaja hanya listen pada 127.0.0.1.

Log yang diharapkan setelah startup:
[UDPGW] ready on 127.0.0.1:7300

Jika build gagal saat kompilasi BadVPN, kirim bagian log build yang memuat error CMake/compiler.
Jika startup sukses tetapi internet tetap tidak berjalan, kirim log baru yang mencakup percobaan koneksi HC; perlu diperiksa juga ssh/sshd_config, konfigurasi forwarding SSH, dan kebijakan UDP egress Railway.

Catatan: patch ini mengatasi kondisi yang terkonfirmasi dari file saat ini, yaitu tidak ada proses yang menyediakan listener 127.0.0.1:7300. Patch ini tidak menjamin UDP egress dari platform hosting diizinkan.
