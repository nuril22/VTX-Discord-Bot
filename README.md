# 🤖 VTX Discord Bot

<div align="center">

![Discord.js](https://img.shields.io/badge/discord.js-14.25.1-blue.svg?logo=discord&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-Latest-black.svg?logo=bun&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green.svg)

### 📊 Repository Statistics

[![GitHub Stars](https://img.shields.io/github/stars/nuril22/VTX-Discord-Bot?style=for-the-badge&logo=github&logoColor=white&labelColor=181717&color=yellow)](https://github.com/nuril22/VTX-Discord-Bot/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/nuril22/VTX-Discord-Bot?style=for-the-badge&logo=github&logoColor=white&labelColor=181717&color=blue)](https://github.com/nuril22/VTX-Discord-Bot/forks)
[![GitHub Issues](https://img.shields.io/github/issues/nuril22/VTX-Discord-Bot?style=for-the-badge&logo=github&logoColor=white&labelColor=181717&color=orange)](https://github.com/nuril22/VTX-Discord-Bot/issues)

---

[![Typing SVG](https://readme-typing-svg.demolab.com/?lines=Welcome+to+VTX+Discord+Bot!;Built+with+Discord.js+%26+TypeScript;Rich+Features+%26+Easy+to+Use;Economy+%7C+RPG+%7C+Moderation+%7C+More&center=true&vCenter=true&width=600&height=80&size=30&color=58A6FF&font=monospace&duration=4000&pause=1000&repeat=true)](https://github.com/nuril22/VTX-Discord-Bot)

---

**Bot Discord yang kaya fitur dibangun dengan Discord.js v14, TypeScript, dan Bun**

[Fitur](#-fitur) • [Instalasi](#-instalasi) • [Konfigurasi](#-konfigurasi) • [Commands](#-commands) • [Struktur Project](#-struktur-project)

</div>

---

## ✨ Fitur

### 🛠️ Fitur Utama
- ✅ **Slash Commands** - Sistem command slash Discord modern
- ✅ **Auto Command Handler** - Pemuatan dan reload command otomatis
- ✅ **File Watcher** - Hot reload command saat file berubah
- ✅ **TypeScript** - Dukungan type safety dan IntelliSense penuh
- ✅ **ESM Support** - Sintaks ES Modules modern
- ✅ **Bun Runtime** - Runtime JavaScript cepat untuk performa lebih baik

### 💰 Sistem Economy
- Manajemen saldo
- Sistem kerja dengan cooldown
- Transfer uang antar user
- Riwayat transaksi

### 🎰 Sistem Gambling
- Permainan coinflip dengan multiplier yang dapat disesuaikan
- Permainan mesin slot
- Mekanisme risiko dan reward

### ⚔️ Sistem RPG
- Sistem mining dengan level dan XP
- Sistem equipment (pickaxe, backpack)
- Manajemen inventory
- Sistem rebirth dengan bonus
- Sistem store untuk membeli item

### 📊 Sistem Leveling
- **Leaderboard** - Lihat ranking user berdasarkan level atau uang
  - Filter global atau per server
  - Menampilkan top 10 user dengan medali emoji
  - Menampilkan peringkat user yang menjalankan command
- **XP Tracker** - Lihat statistik level dan XP
  - Progress bar visual untuk XP
  - Informasi XP yang diperlukan untuk level berikutnya
  - Dapat melihat XP user lain

### 🛡️ Sistem Moderation
- **Kick** - Mengeluarkan user dari server
- **Ban** - Memban user (permanen atau sementara dengan format waktu)
- **Sistem Warn** - Sistem peringatan canggih dengan:
  - Maksimal warn yang dapat dikonfigurasi per server
  - Auto-ban saat batas tercapai
  - Pelacakan riwayat warning
  - Command penghapusan warning
  - Manajemen pengaturan dengan tombol interaktif
- Pembersihan warning otomatis saat user keluar/di-ban

### 🎁 Sistem Giveaway
- **Buat Giveaway** - Membuat giveaway dengan durasi, jumlah pemenang, dan opsi role requirement
- **Button Interaktif** - Peserta dapat join/leave giveaway dengan tombol
- **Auto-End** - Giveaway otomatis berakhir saat waktu habis (check setiap 10 detik)
- **Mention Creator** - Bot otomatis mention creator saat giveaway berakhir
- **DM Pemenang** - Bot mengirim DM ke semua pemenang
- **Reroll** - Acak ulang pemenang jika diperlukan (hanya dalam 1 hari)
- **Auto-Cleanup** - Data giveaway otomatis dihapus setelah 1 hari sejak berakhir
- **Persistent Storage** - Data tersimpan di database, tetap berjalan meski bot restart
- **Discord Timestamp** - Menggunakan timestamp Discord untuk timer yang akurat

### 🎯 Command Utility
- **Bot Info** - Statistik bot detail (CPU, memory, disk, uptime)
- **User Info** - Tampilan informasi user lengkap
- **Help** - Sistem bantuan interaktif dengan pemilihan kategori
- **Instagram Downloader** - Download video dari Instagram Reels

### 🔐 Command Owner
- Command eval (eksekusi kode JavaScript)
- Manajemen activity
- Konfigurasi bot

---

## 📋 Persyaratan

- **Bun** (versi terbaru)
- **Node.js** 18+ (jika tidak menggunakan Bun)
- **yt-dlp** (untuk fitur Instagram downloader)
- **ffmpeg** (opsional, untuk kompresi video)

---

## 🚀 Instalasi

### 1. Clone repository

```bash
git clone https://github.com/nuril22/VTX-Discord-Bot.git
cd dcbot
```

### 2. Install Bun

**Windows (PowerShell):**
```powershell
irm bun.sh/install.ps1 | iex
```

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Verifikasi instalasi:**
```bash
bun --version
```

### 3. Install dependencies

```bash
bun install
```

### 4. Install yt-dlp (untuk Instagram downloader)

**Windows:**
```bash
pip install yt-dlp
# atau download dari: https://github.com/yt-dlp/yt-dlp/releases
```

**macOS:**
```bash
brew install yt-dlp
# atau
pip install yt-dlp
```

**Linux:**
```bash
pip install yt-dlp
```

**Verifikasi instalasi:**
```bash
yt-dlp --version
```

### 5. Install ffmpeg (opsional, untuk kompresi video)

**Windows:**
Download dari [ffmpeg.org](https://ffmpeg.org/download.html) dan tambahkan ke PATH

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg  # Debian/Ubuntu
# atau
sudo yum install ffmpeg   # CentOS/RHEL
```

### 6. Konfigurasi environment variables

Buat file `.env` di direktori root:

```env
# Wajib
TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here

# Opsional
PREFIX=$
OWNER_IDS=123456789012345678,987654321098765432
```

### 7. Jalankan bot

**Production:**
```bash
bun start
```

**Development (dengan watch mode):**
```bash
bun run dev
```

---

## ⚙️ Konfigurasi

### Environment Variables

| Variable | Wajib | Deskripsi | Default |
|----------|-------|-----------|---------|
| `TOKEN` | ✅ Ya | Discord bot token | - |
| `CLIENT_ID` | ✅ Ya | Discord bot client ID | - |
| `PREFIX` | ❌ Tidak | Prefix untuk prefix commands | `$` |
| `OWNER_IDS` | ❌ Tidak | ID owner bot (dipisahkan koma) | - |

### Mendapatkan Bot Token

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Buat aplikasi baru atau pilih yang sudah ada
3. Masuk ke bagian "Bot"
4. Klik "Reset Token" dan salin token
5. Aktifkan "Message Content Intent" dan "Server Members Intent" di Privileged Gateway Intents

### Permission Bot

Permission yang diperlukan untuk bot:
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Use Slash Commands`
- `Kick Members` (untuk moderation)
- `Ban Members` (untuk moderation)
- `Moderate Members` (untuk warnings)

**Link Invite:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

---

## 📖 Commands

### 🛡️ Moderation

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/kick` | Kick user dari server | `/kick user:@user [reason]` |
| `/ban` | Ban user (permanen atau sementara) | `/ban user:@user [time:1d2h] [reason]` |
| `/warn` | Berikan warning kepada user | `/warn user:@user [reason]` |
| `/warnings` | Lihat warnings user | `/warnings user:@user` |
| `/warn-remove` | Hapus warning dari user | `/warn-remove user:@user [id:1]` |
| `/warn-settings` | Konfigurasi sistem warning | `/warn-settings` |

**Format Waktu untuk Ban:**
- `y` = tahun, `d` = hari, `h` = jam, `m` = menit, `s` = detik
- Contoh: `1y2d3h4m5s` = 1 tahun, 2 hari, 3 jam, 4 menit, 5 detik

### 💰 Economy

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/register` | Daftar ke sistem economy | `/register` |
| `/balance` | Cek saldo | `/balance [user:@user]` |
| `/work` | Bekerja untuk mendapatkan uang (cooldown 1 menit) | `/work` |
| `/pay` | Transfer uang ke user lain | `/pay user:@user amount:1000` |

### 🎰 Gambling

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/coinflip` | Lempar koin dan bertaruh | `/coinflip amount:100 position:head [multiplier:2]` |
| `/slot` | Mainkan mesin slot | `/slot amount:100 [multiplier:3]` |

### ⚔️ RPG

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/rpg-register` | Daftar ke sistem RPG | `/rpg-register` |
| `/rpg-profile` | Lihat profil RPG | `/rpg-profile [user:@user]` |
| `/mining` | Mining untuk mendapatkan resource | `/mining` |
| `/backpack` | Lihat inventory | `/backpack` |
| `/store` | Lihat item di store | `/store` |
| `/buy` | Beli item dari store | `/buy item:iron_pickaxe` |
| `/sell` | Jual item | `/sell item:iron quantity:5` |
| `/rebirth` | Rebirth untuk mendapatkan bonus | `/rebirth` |

### 📊 Leveling

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/leaderboard` | Lihat leaderboard user | `/leaderboard [tipe:level/uang] [global:yes/no]` |
| `/xp` | Lihat level dan XP | `/xp [user:@user]` |

**Parameter Leaderboard:**
- `tipe` - Tipe leaderboard: `level` (default) atau `uang`
- `global` - Tampilkan global (`yes`) atau hanya server ini (`no`, default)

**Catatan:**
- Leaderboard menampilkan top 10 user dengan medali emoji untuk 3 teratas
- Peringkat user yang menjalankan command ditampilkan di footer
- XP command menampilkan progress bar visual dan informasi XP yang diperlukan untuk level berikutnya

### 🎁 Giveaway

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/gcreate` | Buat giveaway baru | `/gcreate time:1d2h30m winner:1 [role:@role] [request:text] [channel:#channel]` |
| `/gend` | Akhiri giveaway dan pilih pemenang | `/gend id:giveaway_id` |
| `/greroll` | Acak ulang pemenang giveaway | `/greroll id:giveaway_id` |
| `/glist` | Lihat daftar peserta giveaway | `/glist id:giveaway_id` |

**Format Waktu untuk Giveaway:**
- `y` = tahun, `d` = hari, `h` = jam, `m` = menit, `s` = detik
- Contoh: `1d2h30m` = 1 hari, 2 jam, 30 menit
- Minimal durasi: 1 menit

**Catatan:**
- Hanya moderator yang dapat menggunakan command giveaway
- Giveaway otomatis berakhir saat waktu habis
- Data giveaway otomatis dihapus setelah 1 hari sejak berakhir
- Reroll hanya bisa dilakukan dalam 1 hari setelah giveaway berakhir

### 🛠️ Utility

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/help` | Tampilkan menu bantuan | `/help [command:command_name]` |
| `/botinfo` | Tampilkan informasi bot | `/botinfo` |
| `/userinfo` | Tampilkan informasi user | `/userinfo [user:@user]` |
| `/igdl` | Download Instagram Reel | `/igdl link:https://instagram.com/reel/...` |

### 🔐 Owner

| Command | Deskripsi | Penggunaan |
|---------|-----------|------------|
| `/eval` | Eksekusi kode JavaScript | `/eval code:console.log('Hello')` |
| `/setactivity` | Atur activity bot | `/setactivity` |

---

## 📁 Struktur Project

```
dcbot/
├── commands/              # File command
│   ├── economy/          # Command sistem economy
│   │   ├── balance.ts
│   │   ├── pay.ts
│   │   ├── register.ts
│   │   └── work.ts
│   ├── gambling/         # Command gambling
│   │   ├── coinflip.ts
│   │   └── slot.ts
│   ├── moderator/        # Command moderation
│   │   ├── ban.ts
│   │   ├── kick.ts
│   │   ├── warn.ts
│   │   ├── warnings.ts
│   │   ├── warn-remove.ts
│   │   └── warn-settings.ts
│   ├── owner/            # Command khusus owner
│   │   ├── eval.ts
│   │   └── setactivity.ts
│   ├── rpg/              # Command sistem RPG
│   │   ├── backpack.ts
│   │   ├── buy.ts
│   │   ├── mining.ts
│   │   ├── rebirth.ts
│   │   ├── register.ts
│   │   ├── rpg-profile.ts
│   │   ├── sell.ts
│   │   └── store.ts
│   ├── leveling/         # Command sistem leveling
│   │   ├── leaderboard.ts
│   │   └── xp.ts
│   ├── giveaway/        # Command sistem giveaway
│   │   ├── gcreate.ts
│   │   ├── gend.ts
│   │   ├── greroll.ts
│   │   └── glist.ts
│   └── utility/          # Command utility
│       ├── botinfo.ts
│       ├── help.ts
│       ├── igdl.ts
│       └── userinfo.ts
├── database/             # Utility database
│   └── db.ts
├── db/                   # File database SQLite
│   ├── economy.db        # Data Economy & RPG
│   └── globals.db        # Data global (warnings, dll)
├── downloads/           # Download sementara (auto-cleanup)
├── types/               # Definisi tipe TypeScript
│   └── index.d.ts
├── settings/            # Pengaturan bot
│   └── activity.ts      # Konfigurasi activity
├── index.ts             # File utama bot
├── tsconfig.json        # Konfigurasi TypeScript
├── package.json         # Dependencies
├── .env                 # Environment variables (tidak di-commit)
└── README.md            # File ini
```

---

## 🗄️ Database

Bot menggunakan database SQLite:

- **`db/economy.db`** - Data sistem Economy dan RPG
  - Users, transactions, mining data, inventory, equipment
  - Leaderboard data (level, XP, balance)

- **`db/globals.db`** - Data global bot
  - Warnings, pengaturan warning per server
  - Giveaways (data giveaway, peserta, pemenang)

Database otomatis dibuat saat pertama kali dijalankan.

---

## 🔧 Development

### Menambah Command Baru

1. Buat file baru di folder kategori yang sesuai:
   ```typescript
   // commands/utility/mycommand.ts
   import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';

   export default {
       category: 'utility',
       data: new SlashCommandBuilder()
           .setName('mycommand')
           .setDescription('Deskripsi command saya'),
       async execute(interaction: ChatInputCommandInteraction, client: Client) {
           // Logika command di sini
       },
   };
   ```

2. Command akan otomatis dimuat dan terdaftar!

### Struktur File

Command otomatis ditemukan dan dimuat dari direktori `commands/`. Bot menggunakan file loader rekursif yang mendukung folder bersarang.

### Hot Reload

Bot dilengkapi file watcher yang otomatis me-reload command saat file berubah. Tidak perlu restart!

---

## 📝 Catatan

- **Keamanan Token**: Jangan pernah commit file `.env` atau bot token ke version control
- **Permissions**: Pastikan bot memiliki permission yang diperlukan di server Anda
- **Rate Limits**: Perhatikan rate limit Discord API
- **Ukuran File**: Discord memiliki batas upload file 25MB (100MB untuk server yang di-boost)
- **Instagram Downloader**: Memerlukan yt-dlp dan menggunakan cookies browser untuk autentikasi
- **Kompresi Video**: Video besar otomatis dikompres menggunakan ffmpeg jika tersedia

---

## 🤝 Contributing

Kontribusi sangat diterima! Silakan submit Pull Request.

1. Fork repository
2. Buat branch fitur Anda (`git checkout -b feature/FiturMenarik`)
3. Commit perubahan Anda (`git commit -m 'Tambahkan FiturMenarik'`)
4. Push ke branch (`git push origin feature/FiturMenarik`)
5. Buka Pull Request

---

## 📄 License

Project ini dilisensikan di bawah MIT License.

---

## 🙏 Acknowledgments

- [Discord.js](https://discord.js.org/) - Wrapper Discord API yang powerful
- [Bun](https://bun.sh/) - Runtime JavaScript yang cepat
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Fork YouTube-dl untuk download media

---

## 📞 Support

Jika Anda menemukan masalah atau memiliki pertanyaan:

1. Cek halaman [Issues](https://github.com/nuril22/VTX-Discord-Bot/issues)
2. Buat issue baru dengan informasi detail
3. Sertakan pesan error dan langkah untuk mereproduksi

---

<div align="center">

**Dibuat dengan ❤️ menggunakan Discord.js, TypeScript, dan Bun**

⭐ Berikan star pada repo ini jika Anda merasa membantu!

---

### 🍴 Fork The Repository

<a href="https://github.com/nuril22/VTX-Discord-Bot/fork">
  <img src="https://img.shields.io/badge/FORK%20REPO-NOW-red?style=for-the-badge&logo=github&logoColor=white" alt="Fork Repo" />
</a>

</div>
