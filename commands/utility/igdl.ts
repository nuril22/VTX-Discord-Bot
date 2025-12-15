import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client, AttachmentBuilder } from 'discord.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync, renameSync } from 'fs';
import { join, extname, basename } from 'path';
import { getFooterText } from '../../settings/bot.js';

const execAsync = promisify(exec);

// Instagram URL validation regex - hanya terima reel (video)
const INSTAGRAM_URL_REGEX = /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/reel\/[A-Za-z0-9_-]+\/?/;

// Directory untuk menyimpan file download sementara (relative to project root)
const DOWNLOAD_DIR = join(process.cwd(), 'downloads');
if (!existsSync(DOWNLOAD_DIR)) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Helper function untuk check yt-dlp installation
async function checkYtDlp(): Promise<boolean> {
    try {
        await execAsync('yt-dlp --version');
        return true;
    } catch {
        try {
            await execAsync('youtube-dl --version');
            return true;
        } catch {
            return false;
        }
    }
}

// Helper function untuk check ffmpeg installation
async function checkFfmpeg(): Promise<boolean> {
    try {
        await execAsync('ffmpeg -version');
        return true;
    } catch {
        return false;
    }
}

// Helper function untuk kompres video dengan ffmpeg
async function compressVideo(inputPath: string, outputPath: string, targetSizeMB: number = 20): Promise<string> {
    try {
        // Get original file size
        const originalStats = statSync(inputPath);
        const originalSizeMB = originalStats.size / (1024 * 1024);
        
        // Calculate target bitrate (dengan margin 10% untuk safety)
        const targetSizeBytes = targetSizeMB * 1024 * 1024 * 0.9;
        const duration = await getVideoDuration(inputPath);
        
        if (!duration || duration <= 0) {
            throw new Error('Tidak dapat menentukan durasi video');
        }
        
        // Calculate bitrate (kbps) - target size dalam bytes / duration dalam detik * 8 (bits) / 1000 (kbps)
        const targetBitrate = Math.floor((targetSizeBytes / duration) * 8 / 1000);
        // Minimum bitrate untuk kualitas yang baik
        const minBitrate = 1000; // 1 Mbps minimum
        const maxBitrate = 5000; // 5 Mbps maximum untuk kualitas baik
        const finalBitrate = Math.max(minBitrate, Math.min(maxBitrate, targetBitrate));
        
        // FFmpeg command dengan CRF (Constant Rate Factor) untuk kualitas yang baik
        // CRF 23 adalah sweet spot untuk kualitas vs size (lower = better quality, 18-28 range)
        // Menggunakan x264 encoder dengan preset medium untuk balance speed/quality
        const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -crf 23 -b:v ${finalBitrate}k -maxrate ${finalBitrate * 1.2}k -bufsize ${finalBitrate * 2}k -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;
        
        await execAsync(ffmpegCommand, {
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer
            timeout: 300000 // 5 minutes timeout
        });
        
        // Check if output file exists and is smaller
        if (existsSync(outputPath)) {
            const compressedStats = statSync(outputPath);
            const compressedSizeMB = compressedStats.size / (1024 * 1024);
            
            console.log(`[IGDL] Video compressed: ${originalSizeMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`);
            
            // If compressed file is still too large, try more aggressive compression
            if (compressedSizeMB > targetSizeMB) {
                console.log(`[IGDL] File masih terlalu besar, mencoba kompresi lebih agresif...`);
                const aggressiveOutput = outputPath.replace('.mp4', '_compressed.mp4');
                const aggressiveCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -preset slow -crf 28 -b:v ${Math.floor(finalBitrate * 0.7)}k -maxrate ${Math.floor(finalBitrate * 0.8)}k -bufsize ${Math.floor(finalBitrate * 1.5)}k -c:a aac -b:a 96k -movflags +faststart -y "${aggressiveOutput}"`;
                
                try {
                    await execAsync(aggressiveCommand, {
                        maxBuffer: 50 * 1024 * 1024,
                        timeout: 300000
                    });
                    
                    if (existsSync(aggressiveOutput)) {
                        const aggressiveStats = statSync(aggressiveOutput);
                        if (aggressiveStats.size < compressedStats.size) {
                            // Delete less compressed version
                            try { unlinkSync(outputPath); } catch {}
                            return aggressiveOutput;
                        } else {
                            // Delete aggressive version, keep original compressed
                            try { unlinkSync(aggressiveOutput); } catch {}
                        }
                    }
                } catch {
                    // If aggressive compression fails, use the first compressed version
                }
            }
            
            return outputPath;
        }
        
        throw new Error('File kompresi tidak ditemukan setelah proses');
    } catch (error: any) {
        console.error('[IGDL] Error compressing video:', error);
        throw new Error(`Gagal mengompres video: ${error.message || 'Unknown error'}`);
    }
}

// Helper function untuk mendapatkan durasi video
async function getVideoDuration(videoPath: string): Promise<number | null> {
    try {
        // Try ffprobe first (more reliable)
        const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
        const { stdout } = await execAsync(command, { timeout: 10000 });
        const duration = parseFloat(stdout.trim());
        if (!isNaN(duration) && duration > 0) {
            return duration;
        }
    } catch {
        // Continue to fallback
    }
    
    // Fallback: try with ffmpeg (works on Windows too)
    try {
        const command = `ffmpeg -i "${videoPath}" 2>&1`;
        const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
        const output = (stdout + stderr).toString();
        
        // Extract duration from output (format: Duration: HH:MM:SS.mm)
        const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (durationMatch) {
            const hours = parseFloat(durationMatch[1]) || 0;
            const minutes = parseFloat(durationMatch[2]) || 0;
            const seconds = parseFloat(durationMatch[3]) || 0;
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;
            if (totalSeconds > 0) {
                return totalSeconds;
            }
        }
    } catch {}
    
    // If all else fails, return a default duration (estimate based on file size)
    // Rough estimate: 1MB ≈ 1 second for typical video bitrate
    try {
        const stats = statSync(videoPath);
        const estimatedDuration = (stats.size / (1024 * 1024)) * 1.2; // 1.2 seconds per MB
        return Math.max(10, Math.min(estimatedDuration, 300)); // Between 10s and 5min
    } catch {
        return 60; // Default 1 minute if we can't determine
    }
}

// Helper function untuk clean up old files
function cleanupOldFiles(): void {
    try {
        const files = readdirSync(DOWNLOAD_DIR);
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        files.forEach(file => {
            const filePath = join(DOWNLOAD_DIR, file);
            try {
                const stats = statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    unlinkSync(filePath);
                }
            } catch {
                // Ignore errors
            }
        });
    } catch {
        // Ignore errors
    }
}

export default {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('igdl')
        .setDescription('Download video dari Instagram Reel')
        .addStringOption(option =>
            option
                .setName('link')
                .setDescription('Link video Instagram Reel')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const url = interaction.options.getString('link', true);

        // Validate Instagram URL - hanya terima reel
        if (!INSTAGRAM_URL_REGEX.test(url)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Link Tidak Valid')
                .setDescription('**Link yang Anda berikan bukan link Instagram Reel yang valid!**\n\nPastikan link dalam format:\n• `https://www.instagram.com/reel/...`\n\n⚠️ Bot hanya mendukung download video Reel, bukan postingan biasa.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if yt-dlp is installed
        const hasYtDlp = await checkYtDlp();
        if (!hasYtDlp) {
            const embed = new EmbedBuilder()
                .setTitle('❌ yt-dlp Tidak Terinstall')
                .setDescription(
                    '**yt-dlp belum terinstall di sistem ini!**\n\n' +
                    'Silakan install yt-dlp terlebih dahulu:\n' +
                    '• **Windows**: `pip install yt-dlp` atau download dari [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)\n' +
                    '• **Linux/Mac**: `pip install yt-dlp` atau `brew install yt-dlp`\n\n' +
                    'Lihat README.md untuk panduan lengkap.'
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Clean up old files
        cleanupOldFiles();

        // Show processing embed
        const processingEmbed = new EmbedBuilder()
            .setTitle('⏳ Mengunduh dari Instagram...')
            .setDescription(`**Sedang memproses link...**\n\n⏳ \`Memproses link: ${url}\``)
            .setColor(0x5865F2)
            .setTimestamp();

        await interaction.editReply({ embeds: [processingEmbed] });

        try {
            // Generate unique filename
            const timestamp = Date.now();
            const outputPath = join(DOWNLOAD_DIR, `ig_${timestamp}.%(ext)s`);

            // Build yt-dlp command
            const ytDlpCommand = 'yt-dlp';
            
            // Try with browser cookies (Chrome, Edge, Firefox, Brave)
            const browsers = ['chrome', 'edge', 'firefox', 'brave'];
            let success = false;
            let downloadError: any = null;
            
            for (const browser of browsers) {
                try {
                    const command = `"${ytDlpCommand}" "${url}" -o "${outputPath}" --cookies-from-browser ${browser} --no-playlist --no-warnings --quiet`;
                    await execAsync(command, {
                        maxBuffer: 10 * 1024 * 1024,
                        timeout: 60000
                    });
                    success = true;
                    break;
                } catch (error: any) {
                    downloadError = error;
                    // Continue to next browser
                    if (browser === browsers[browsers.length - 1]) {
                        // Last browser failed, try without cookies
                        try {
                            const command = `"${ytDlpCommand}" "${url}" -o "${outputPath}" --no-playlist --no-warnings --quiet`;
                            await execAsync(command, {
                                maxBuffer: 10 * 1024 * 1024,
                                timeout: 60000
                            });
                            success = true;
                        } catch (error2: any) {
                            downloadError = error2;
                            throw downloadError;
                        }
                    }
                }
            }
            
            if (!success && downloadError) {
                throw downloadError;
            }

            // Find downloaded file
            const files = readdirSync(DOWNLOAD_DIR);
            const downloadedFile = files.find(file => 
                file.startsWith(`ig_${timestamp}`) && 
                (file.endsWith('.mp4') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.mkv'))
            );

            if (!downloadedFile) {
                throw new Error('File tidak ditemukan setelah download. Mungkin postingan bersifat private atau link tidak valid.');
            }

            let filePath = join(DOWNLOAD_DIR, downloadedFile);
            let fileStats = statSync(filePath);
            let fileSize = fileStats.size;
            let originalSize = fileSize;
            let wasCompressed = false;

            // Constants
            const maxFileSize = 25 * 1024 * 1024; // 25MB Discord limit
            const targetSizeMB = 20; // Target size untuk kompresi (20MB untuk safety margin)
            
            // Helper function untuk mencoba upload file
            async function tryUploadFile(fileToUpload: string, fileName: string, showCompressionInfo: boolean = false): Promise<boolean> {
                try {
                    // Create attachment
                    const attachment = new AttachmentBuilder(fileToUpload, {
                        name: fileName.length > 100 ? `instagram_${timestamp}.${fileName.split('.').pop()}` : fileName
                    });

                    // Success embed
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Download Berhasil!')
                        .setDescription('**File berhasil diunduh dari Instagram!**')
                        .setColor(0x00FF00)
                        .addFields({
                            name: '📎 Link',
                            value: `[Buka di Instagram](${url})`,
                            inline: false
                        });
                    
                    // Add compression info if video was compressed
                    if (showCompressionInfo) {
                        const currentStats = statSync(fileToUpload);
                        const currentSize = currentStats.size;
                        const originalSizeMB = (originalSize / 1024 / 1024).toFixed(2);
                        const compressedSizeMB = (currentSize / 1024 / 1024).toFixed(2);
                        const savedPercent = ((1 - currentSize / originalSize) * 100).toFixed(1);
                        
                        successEmbed.addFields({
                            name: '📦 Kompresi Video',
                            value: `**Ukuran asli:** ${originalSizeMB}MB\n**Ukuran setelah kompresi:** ${compressedSizeMB}MB\n**Penghematan:** ${savedPercent}%`,
                            inline: false
                        });
                    }
                    
                    successEmbed.setTimestamp()
                        .setFooter({
                            text: `Diminta oleh ${interaction.user.tag}`,
                            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                        });

                    // Try to upload with retry mechanism
                    let retries = 3;
                    let lastError: any = null;
                    
                    while (retries > 0) {
                        try {
                            await interaction.editReply({
                                embeds: [successEmbed],
                                files: [attachment]
                            });
                            return true; // Success
                        } catch (error: any) {
                            lastError = error;
                            retries--;
                            
                            // Check if it's an AbortError, timeout, or file size related error
                            const isRetryableError = 
                                error.name === 'AbortError' || 
                                error.code === 20 || 
                                error.message?.includes('aborted') || 
                                error.message?.includes('timeout') ||
                                error.message?.includes('too large') ||
                                error.message?.includes('file size') ||
                                error.code === 40005 || // Discord API error code for file too large
                                (error.status && error.status >= 400 && error.status < 500);
                            
                            if (isRetryableError && retries > 0) {
                                console.log(`[IGDL] Upload failed, retrying... (${retries} attempts left)`);
                                // Wait a bit before retry
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                continue;
                            } else if (!isRetryableError) {
                                // Not a retryable error, throw immediately
                                throw error;
                            }
                        }
                    }
                    
                    // If all retries failed, check if it's a size-related error
                    if (lastError && (
                        lastError.name === 'AbortError' || 
                        lastError.code === 20 || 
                        lastError.message?.includes('aborted') ||
                        lastError.message?.includes('too large') ||
                        lastError.message?.includes('file size') ||
                        lastError.code === 40005
                    )) {
                        return false; // Indicate that compression might help
                    }
                    
                    // Other errors, throw
                    throw lastError || new Error('Upload gagal setelah beberapa percobaan');
                } catch (error: any) {
                    // Check if it's a size-related error
                    if (error.name === 'AbortError' || 
                        error.code === 20 || 
                        error.message?.includes('aborted') ||
                        error.message?.includes('too large') ||
                        error.message?.includes('file size') ||
                        error.code === 40005) {
                        return false; // Indicate that compression might help
                    }
                    throw error; // Re-throw other errors
                }
            }

            // Try to upload file first
            let uploadSuccess = false;
            try {
                uploadSuccess = await tryUploadFile(filePath, downloadedFile, false);
            } catch (error: any) {
                // If upload fails with non-size error, check if file is too large
                const currentStats = statSync(filePath);
                const currentSize = currentStats.size;
                
                // If file is clearly too large (> 25MB), or upload failed with size-related error
                if (currentSize > maxFileSize || 
                    error.message?.includes('too large') || 
                    error.message?.includes('file size') ||
                    error.code === 40005) {
                    // Will handle compression below
                    uploadSuccess = false;
                } else {
                    // Other error, throw it
                    try {
                        unlinkSync(filePath);
                    } catch {}
                    throw error;
                }
            }

            // If upload failed, try to compress if it's a video
            if (!uploadSuccess) {
                const isVideo = downloadedFile.endsWith('.mp4') || downloadedFile.endsWith('.mkv') || downloadedFile.endsWith('.webm');
                
                if (isVideo) {
                    // Check if ffmpeg is available
                    const hasFfmpeg = await checkFfmpeg();
                    
                    if (hasFfmpeg) {
                        // Update embed to show compression notification
                        const compressingEmbed = new EmbedBuilder()
                            .setTitle('⏳ File Terlalu Besar - Mengompres Video...')
                            .setDescription(`**File terlalu besar (${(fileSize / 1024 / 1024).toFixed(2)}MB) dan tidak dapat diunggah**\n\n⏳ Bot akan mengompres video terlebih dahulu untuk mengurangi ukuran tanpa menurunkan kualitas...\n\n📦 Proses ini mungkin memakan waktu beberapa saat.`)
                            .setColor(0xFFA500)
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [compressingEmbed] });
                        
                        try {
                            // Compress video
                            const compressedPath = filePath.replace(extname(filePath), '_compressed.mp4');
                            const finalPath = await compressVideo(filePath, compressedPath, targetSizeMB);
                            
                            // Delete original file
                            try {
                                unlinkSync(filePath);
                            } catch {}
                            
                            // Update file path and stats
                            filePath = finalPath;
                            fileStats = statSync(filePath);
                            fileSize = fileStats.size;
                            wasCompressed = true;
                            
                            // Try to upload compressed file
                            const compressedFileName = basename(finalPath);
                            uploadSuccess = await tryUploadFile(filePath, compressedFileName, true);
                            
                            if (!uploadSuccess) {
                                // Still failed after compression
                                try {
                                    unlinkSync(filePath);
                                } catch {}
                                throw new Error(`File masih terlalu besar setelah kompresi (${(fileSize / 1024 / 1024).toFixed(2)}MB). Video mungkin terlalu panjang atau kompleks.`);
                            }
                        } catch (compressError: any) {
                            // If compression fails, delete files and throw error
                            try {
                                if (existsSync(filePath)) unlinkSync(filePath);
                            } catch {}
                            throw new Error(`Gagal mengompres video: ${compressError.message || 'Unknown error'}`);
                        }
                    } else {
                        // ffmpeg not available
                        try {
                            unlinkSync(filePath);
                        } catch {}
                        throw new Error(`File terlalu besar (${(fileSize / 1024 / 1024).toFixed(2)}MB) dan tidak dapat diunggah. ffmpeg tidak tersedia untuk kompresi. Silakan install ffmpeg untuk fitur kompresi video.`);
                    }
                } else {
                    // Not a video file, can't compress
                    try {
                        unlinkSync(filePath);
                    } catch {}
                    throw new Error(`File terlalu besar (${(fileSize / 1024 / 1024).toFixed(2)}MB) dan tidak dapat diunggah. Discord hanya mendukung file hingga 25MB.`);
                }
            }

            // Clean up file after sending (with delay)
            setTimeout(() => {
                try {
                    if (existsSync(filePath)) {
                        unlinkSync(filePath);
                    }
                } catch {
                    // Ignore cleanup errors
                }
            }, 5000);

        } catch (error: any) {
            console.error('[IGDL] Error:', error);

            let errorMessage = 'Terjadi kesalahan saat mengunduh dari Instagram.';
            let errorDetails = '';
            
            // Handle AbortError specifically
            if (error.name === 'AbortError' || error.code === 20 || error.message?.includes('aborted')) {
                errorMessage = 'Upload dibatalkan atau timeout.';
                errorDetails = 'File mungkin terlalu besar atau koneksi tidak stabil. Bot akan mencoba mengompres video jika memungkinkan.';
            } else if (error.stderr) {
                const stderr = error.stderr.toString();
                
                if (stderr.includes('empty media response') || stderr.includes('sent an empty media response')) {
                    errorMessage = 'Instagram mengirimkan respons kosong.';
                    errorDetails = 'Reel mungkin memerlukan autentikasi. Pastikan Anda sudah login Instagram di browser (Chrome/Edge/Firefox) dan reel dapat diakses.';
                } else if (stderr.includes('Private') || stderr.includes('private')) {
                    errorMessage = 'Reel bersifat private atau tidak dapat diakses.';
                    errorDetails = 'Reel ini mungkin private, dihapus, atau hanya dapat diakses oleh akun tertentu.';
                } else if (stderr.includes('not found') || stderr.includes('unavailable') || stderr.includes('does not exist')) {
                    errorMessage = 'Reel tidak ditemukan atau link tidak valid.';
                    errorDetails = 'Pastikan link yang Anda berikan valid dan reel masih tersedia.';
                } else if (stderr.includes('No video formats found')) {
                    errorMessage = 'Format video tidak ditemukan.';
                    errorDetails = 'Reel ini mungkin tidak memiliki video atau format tidak didukung. Pastikan link adalah Instagram Reel yang valid.';
                } else if (stderr.includes('login') || stderr.includes('authentication') || stderr.includes('cookies')) {
                    errorMessage = 'Reel memerlukan autentikasi.';
                    errorDetails = 'Reel ini memerlukan login Instagram. Pastikan Anda sudah login Instagram di browser (Chrome/Edge/Firefox) dan reel dapat diakses.';
                } else if (stderr.includes('rate limit') || stderr.includes('Too Many Requests')) {
                    errorMessage = 'Terlalu banyak permintaan ke Instagram.';
                    errorDetails = 'Instagram membatasi jumlah permintaan. Silakan tunggu beberapa saat sebelum mencoba lagi.';
                } else if (stderr.includes('HTTP Error 429')) {
                    errorMessage = 'Terlalu banyak permintaan (Rate Limited).';
                    errorDetails = 'Instagram membatasi akses karena terlalu banyak permintaan. Tunggu beberapa menit sebelum mencoba lagi.';
                } else if (error.message) {
                    errorMessage = error.message;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`**${errorMessage}**`)
                .setColor(0xFF0000);
            
            if (errorDetails) {
                errorEmbed.addFields({
                    name: 'ℹ️ Informasi',
                    value: errorDetails,
                    inline: false
                });
            }
            
            errorEmbed.addFields({
                name: '💡 Tips',
                value: '• Pastikan link Instagram Reel valid dan dapat diakses di browser\n• Pastikan reel tidak private atau terbatas\n• Login Instagram di browser (Chrome/Edge/Firefox) untuk reel yang memerlukan autentikasi\n• Bot hanya mendukung download video Reel, bukan postingan biasa\n• Coba lagi dengan koneksi yang stabil',
                inline: false
            });
            
            errorEmbed.setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
