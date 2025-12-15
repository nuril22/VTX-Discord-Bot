import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getFooterText } from '../../settings/bot.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

interface DiskInfo {
    total: number;
    free: number;
    used: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), ms)
        )
    ]);
}

async function getDiskUsage(): Promise<DiskInfo> {
    try {
        const platform = os.platform();
        
        if (platform === 'win32') {
            // Windows
            try {
                const { stdout } = await withTimeout(
                    execAsync('wmic logicaldisk get size,freespace,caption'),
                    3000
                );
                const lines = stdout.trim().split('\n').filter(line => line.trim());
                let total = 0;
                let free = 0;
                
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const freeSpace = parseInt(parts[parts.length - 2]);
                        const size = parseInt(parts[parts.length - 1]);
                        if (!isNaN(freeSpace) && !isNaN(size)) {
                            free += freeSpace;
                            total += size;
                        }
                    }
                }
                
                if (total === 0) return { total: 0, free: 0, used: 0 };
                return { total, free, used: total - free };
            } catch {
                return { total: 0, free: 0, used: 0 };
            }
        } else {
            // Linux/Mac
            try {
                const { stdout } = await withTimeout(
                    execAsync('df -k /'),
                    3000
                );
                const lines = stdout.trim().split('\n');
                if (lines.length < 2) return { total: 0, free: 0, used: 0 };
                
                const data = lines[1].trim().split(/\s+/);
                const total = parseInt(data[1]) * 1024;
                const used = parseInt(data[2]) * 1024;
                const free = parseInt(data[3]) * 1024;
                
                if (isNaN(total) || isNaN(used) || isNaN(free) || total === 0) {
                    return { total: 0, free: 0, used: 0 };
                }
                
                return { total, free, used };
            } catch {
                return { total: 0, free: 0, used: 0 };
            }
        }
    } catch (error) {
        console.error('Error saat mengambil informasi disk:', error);
        return { total: 0, free: 0, used: 0 };
    }
}

export default {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Menampilkan informasi lengkap tentang bot'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();
        
        const uptime = process.uptime();
        const ping = client.ws.ping;
        const cpuCount = os.cpus().length;
        const cpuModel = os.cpus()[0]?.model || 'Unknown';
        const platform = os.platform();
        const arch = os.arch();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const nodeVersion = process.version;
        
        // Get discord.js version
        let discordJsVersion = 'unknown';
        try {
            const discordJsPackagePath = join(__dirname, '../../node_modules/discord.js/package.json');
            const discordJsPackage = JSON.parse(readFileSync(discordJsPackagePath, 'utf-8'));
            discordJsVersion = discordJsPackage.version;
        } catch {
            // Fallback jika tidak bisa membaca package.json
            discordJsVersion = '14.25.1';
        }
        
        // Get disk info with timeout
        const diskInfo = await getDiskUsage();
        
        // OS Info with timeout
        let osInfo = `${platform} ${arch}`;
        try {
            if (platform === 'win32') {
                try {
                    const { stdout } = await withTimeout(
                        execAsync('wmic os get Caption,Version /value'),
                        2000
                    );
                    const lines = stdout.split('\n').filter(line => line.includes('='));
                    const caption = lines.find(line => line.startsWith('Caption='))?.split('=')[1]?.trim();
                    const version = lines.find(line => line.startsWith('Version='))?.split('=')[1]?.trim();
                    if (caption) osInfo = `${caption}${version ? ' ' + version : ''}`;
                } catch {
                    // Use default osInfo if command fails
                }
            } else {
                try {
                    const { stdout } = await withTimeout(
                        execAsync('uname -sr'),
                        2000
                    );
                    osInfo = stdout.trim();
                } catch {
                    // Use default osInfo if command fails
                }
            }
        } catch (error) {
            // Use default osInfo if command fails
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🤖 Informasi Bot')
            .setColor(0x5865F2)
            .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
            .addFields(
                { name: '⏱️ Waktu Aktif', value: `\`\`\`${formatUptime(uptime)}\`\`\``, inline: true },
                { name: '🏓 Ping', value: `\`\`\`${ping}ms\`\`\``, inline: true },
                { name: '💻 Node.js', value: `\`\`\`${nodeVersion}\`\`\``, inline: true },
                { name: '📦 Discord.js', value: `\`\`\`v${discordJsVersion}\`\`\``, inline: true },
                { name: '🔧 Inti CPU', value: `\`\`\`${cpuCount} inti\`\`\``, inline: true },
                { name: '💾 Model CPU', value: `\`\`\`${cpuModel.length > 50 ? cpuModel.substring(0, 50) + '...' : cpuModel}\`\`\``, inline: true },
                { name: '🖥️ Sistem Operasi', value: `\`\`\`${osInfo}\`\`\``, inline: true },
                { name: '💿 Memori', value: `\`\`\`${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${Math.round((usedMem / totalMem) * 100)}%)\`\`\``, inline: true },
                { name: '💾 Disk', value: diskInfo.total > 0 ? `\`\`\`${formatBytes(diskInfo.used)} / ${formatBytes(diskInfo.total)} (${Math.round((diskInfo.used / diskInfo.total) * 100)}%)\`\`\`` : '```Tidak tersedia```', inline: true },
                { name: '👥 Server', value: `\`\`\`${client.guilds.cache.size}\`\`\``, inline: true },
                { name: '👤 Pengguna', value: `\`\`\`${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}\`\`\``, inline: true }
            )
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });
        
        await interaction.editReply({ embeds: [embed] });
    },
};
