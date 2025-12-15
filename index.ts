import { Client, GatewayIntentBits, Collection, Events, ActivityType, REST, Routes, PresenceStatusData } from 'discord.js';
import { readdirSync, watch, existsSync, statSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { initDatabase, removeAllWarnings } from './database/db.js';
import { botConfig } from './settings/bot.js';
import type { Command } from './types/index.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
}) as Client & { commands: Collection<string, Command> };

// Load commands
client.commands = new Collection<string, Command>();
const commandsPath = join(__dirname, 'commands');

// Activity rotation system
interface ActivityConfig {
    status: 'online' | 'idle' | 'dnd' | 'invisible';
    activities: Array<{
        name: string;
        type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing';
    }>;
}

let activityRotationInterval: ReturnType<typeof setInterval> | null = null;
let currentActivityIndex = 0;

function loadActivityConfig(): ActivityConfig {
    const configPath = join(__dirname, 'settings/activity.ts');
    try {
        if (existsSync(configPath)) {
            const content = readFileSync(configPath, 'utf-8');
            
            // Cari status hanya di dalam activityConfig, bukan di interface
            // Pattern: export const activityConfig = { ... status: 'idle' ... }
            const configMatch = content.match(/export\s+const\s+activityConfig[^=]*=\s*\{([\s\S]*?)\};/);
            let status: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';
            let activities: Array<{ name: string; type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing' }> = [];
            
            if (configMatch) {
                const configContent = configMatch[1];
                // Cari status di dalam config object
                const statusMatch = configContent.match(/status:\s*['"](online|idle|dnd|invisible)['"]/);
                if (statusMatch && statusMatch[1]) {
                    status = statusMatch[1] as 'online' | 'idle' | 'dnd' | 'invisible';
                    console.log(`[ACTIVITY] Status terbaca dari config: ${status}`);
                } else {
                    console.log(`[ACTIVITY] ⚠️ Status tidak ditemukan dalam activityConfig, menggunakan default: online`);
                }
                
                // Cari activities
                const activitiesMatch = configContent.match(/activities:\s*\[([\s\S]*?)\]/);
                if (activitiesMatch) {
                    const activitiesStr = activitiesMatch[1];
                    const activityRegex = /\{\s*name:\s*['"]([^'"]+)['"],\s*type:\s*['"](Playing|Streaming|Listening|Watching|Competing)['"]\s*\}/g;
                    let match;
                    while ((match = activityRegex.exec(activitiesStr)) !== null) {
                        activities.push({
                            name: match[1],
                            type: match[2] as any
                        });
                    }
                }
            } else {
                console.log(`[ACTIVITY] ⚠️ activityConfig tidak ditemukan dalam file, menggunakan default`);
            }
            
            return { 
                status, 
                activities: activities.length > 0 ? activities : [{ name: 'Discord.js v14', type: 'Playing' }] 
            };
        }
    } catch (error) {
        console.error('[ERROR] Error loading activity config:', error);
    }
    
    return {
        status: 'online',
        activities: [{ name: 'Discord.js v14', type: 'Playing' }]
    };
}

function startActivityRotation(client: Client): void {
    if (activityRotationInterval) {
        clearInterval(activityRotationInterval);
    }
    
    const config = loadActivityConfig();
    
    if (!client.user || config.activities.length === 0) {
        return;
    }
    
    // Set status dengan memastikan type yang benar
    const statusMap: Record<string, PresenceStatusData> = {
        'online': 'online',
        'idle': 'idle',
        'dnd': 'dnd',
        'invisible': 'invisible'
    };
    const discordStatus = statusMap[config.status] || 'online';
    
    // Activity type map
    const activityTypeMap: Record<string, ActivityType> = {
        'Playing': ActivityType.Playing,
        'Streaming': ActivityType.Streaming,
        'Listening': ActivityType.Listening,
        'Watching': ActivityType.Watching,
        'Competing': ActivityType.Competing
    };
    
    // Set status dan activity secara bersamaan menggunakan setPresence
    // Ini memastikan status dan activity di-update bersama
    if (config.activities.length > 0) {
        const firstActivity = config.activities[0];
        client.user.setPresence({
            status: discordStatus,
            activities: [{
                name: firstActivity.name,
                type: activityTypeMap[firstActivity.type] || ActivityType.Playing
            }]
        });
    } else {
        // Jika tidak ada activity, hanya set status
        client.user.setStatus(discordStatus);
    }
    
    console.log(`[ACTIVITY] Status bot diatur ke: ${discordStatus}`);
    currentActivityIndex = 0;
    
    // Rotate every 12 seconds if there are multiple activities
    if (config.activities.length > 1) {
        activityRotationInterval = setInterval(() => {
            if (!client.user) return;
            
            currentActivityIndex = (currentActivityIndex + 1) % config.activities.length;
            const activity = config.activities[currentActivityIndex];
            // Pastikan status tetap dipertahankan saat rotasi
            client.user.setPresence({
                status: discordStatus,
                activities: [{
                    name: activity.name,
                    type: activityTypeMap[activity.type] || ActivityType.Playing
                }]
            });
        }, 12000); // 12 seconds
    }
    
    console.log(`[ACTIVITY] Activity rotation dimulai dengan ${config.activities.length} activity, status: ${config.status}`);
}

// Cache untuk menyimpan module path yang sudah di-load
const commandModuleCache = new Map<string, any>();

async function loadCommandsFromDirectory(dir: string, category?: string): Promise<void> {
    if (!existsSync(dir)) {
        return;
    }

    const items = readdirSync(dir);

    for (const item of items) {
        const itemPath = join(dir, item);
        const stat = statSync(itemPath);

        if (stat.isDirectory()) {
            // Recursively load from subdirectories
            await loadCommandsFromDirectory(itemPath, item);
        } else if (item.endsWith('.ts')) {
            // Determine relative path from commands directory
            const relativePath = itemPath.replace(commandsPath, '').replace(/\\/g, '/').replace(/^\//, '');
            const filePath = `./commands/${relativePath}`;
            
            try {
                const cacheBuster = `?reload=${Date.now()}`;
                const command: Command = (await import(`${filePath}${cacheBuster}`)).default;
                
                if ('data' in command && 'execute' in command) {
                    // Set category if not already set
                    if (!command.category && category) {
                        command.category = category;
                    }
                    
                    const oldCommand = client.commands.get(command.data.name);
                    client.commands.set(command.data.name, command);
                    
                    if (oldCommand) {
                        console.log(`[RELOAD] Command "${command.data.name}" di-reload.`);
                    } else {
                        console.log(`[LOAD] Command "${command.data.name}" dimuat.`);
                    }
                } else {
                    console.log(`[PERINGATAN] Command di ${filePath} tidak memiliki property "data" atau "execute" yang diperlukan.`);
                }
            } catch (error) {
                console.error(`[ERROR] Error loading command ${item}:`, error);
            }
        }
    }
}

async function loadCommands(): Promise<void> {
    client.commands.clear();
    
    if (!existsSync(commandsPath)) {
        console.error(`[ERROR] Direktori commands tidak ditemukan: ${commandsPath}`);
        return;
    }
    
    // Load commands recursively from commands directory
    await loadCommandsFromDirectory(commandsPath);
    
    console.log(`[RELOAD] Total ${client.commands.size} command(s) dimuat.`);
}

// Initial load
await loadCommands();

// Setup file watcher untuk auto reload
function setupFileWatcher(): void {
    console.log('[WATCHER] Memulai file watcher untuk auto reload...');
    
    let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
    
    // Watch commands directory (recursive untuk subfolder)
    if (existsSync(commandsPath)) {
        watch(commandsPath, { recursive: true }, async (eventType, filename) => {
            if (!filename) return;
            
            // Hanya watch file .ts
            if (!filename.endsWith('.ts')) return;
            
            // Skip jika event type adalah rename (bisa jadi false positive)
            if (eventType === 'rename') return;
            
            console.log(`[WATCHER] File berubah: ${filename} (${eventType})`);
            
            // Debounce untuk menghindari multiple reloads
            if (reloadTimeout) {
                clearTimeout(reloadTimeout);
            }
            
            reloadTimeout = setTimeout(async () => {
                try {
                    // Reload commands
                    await loadCommands();
                    
                    // Re-register slash commands jika bot sudah ready
                    if (client.isReady()) {
                        await registerSlashCommands();
                    }
                    
                    console.log(`[WATCHER] ✅ Command berhasil di-reload.`);
                } catch (error) {
                    console.error(`[WATCHER] ❌ Error saat reload command:`, error);
                }
            }, 1000); // Wait 1 second after last change
        });
    }
    
    // Watch main index.ts file
    const mainFilePath = join(__dirname, 'index.ts');
    if (existsSync(mainFilePath)) {
        watch(mainFilePath, () => {
            console.log('[WATCHER] ⚠️  File utama (index.ts) berubah. Bot perlu di-restart manual.');
            console.log('[WATCHER] Silakan restart bot dengan Ctrl+C lalu jalankan kembali.');
        });
    }
    
    // Watch settings/activity.ts file untuk auto-reload activity
    const activitySettingsPath = join(__dirname, 'settings/activity.ts');
    if (existsSync(activitySettingsPath)) {
        let activityReloadTimeout: ReturnType<typeof setTimeout> | null = null;
        watch(activitySettingsPath, async (eventType) => {
            if (eventType === 'change' && client.isReady()) {
                // Debounce untuk menghindari multiple reloads
                if (activityReloadTimeout) {
                    clearTimeout(activityReloadTimeout);
                }
                activityReloadTimeout = setTimeout(() => {
                    console.log('[WATCHER] Activity settings berubah, reloading activity...');
                    startActivityRotation(client);
                }, 500); // Wait 500ms after last change
            }
        });
    }
    
    // Watch types directory juga
    const typesPath = join(__dirname, 'types');
    if (existsSync(typesPath)) {
        watch(typesPath, { recursive: true }, async (eventType, filename) => {
            if (!filename || !filename.endsWith('.ts')) return;
            console.log(`[WATCHER] File type berubah: ${filename}. Reloading commands...`);
            
            if (reloadTimeout) {
                clearTimeout(reloadTimeout);
            }
            
            reloadTimeout = setTimeout(async () => {
                try {
                    await loadCommands();
                    if (client.isReady()) {
                        await registerSlashCommands();
                    }
                    console.log(`[WATCHER] ✅ Command berhasil di-reload setelah perubahan type.`);
                } catch (error) {
                    console.error(`[WATCHER] ❌ Error saat reload command:`, error);
                }
            }, 1000);
        });
    }
    
    console.log('[WATCHER] ✅ File watcher aktif! Perubahan file akan auto-reload.');
}

// Function untuk register slash commands
async function registerSlashCommands(): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || '');
    
    const commands = [];
    for (const [name, command] of client.commands.entries()) {
        if ('data' in command) {
            commands.push(command.data.toJSON());
        }
    }
    
    try {
        let clientId = process.env.CLIENT_ID;
        if (!clientId && client.user) {
            clientId = client.user.id;
        }
        if (!clientId) {
            console.error('[ERROR] CLIENT_ID tidak ditemukan dan client.user tidak tersedia!');
            return;
        }
        
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        ) as any[];
        
        console.log(`[REGISTER] Berhasil me-reload ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('[ERROR] Error saat mendaftarkan commands:', error);
    }
}

// Owner check function
function isOwner(userId: string): boolean {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim());
    return ownerIds.includes(userId);
}

// Logging function untuk command execution
function logCommandExecution(
    commandName: string,
    username: string,
    userId: string,
    guildName: string | null,
    guildId: string | null,
    isPrefix: boolean = false
): void {
    const timestamp = new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    const commandType = isPrefix ? '[PREFIX]' : '[SLASH]';
    const serverInfo = guildName && guildId 
        ? `${guildName} (${guildId})` 
        : 'DM/Private';
    
    console.log(`[${timestamp}] ${commandType} Command: ${commandName}`);
    console.log(`  └─ User: ${username} (${userId})`);
    console.log(`  └─ Server: ${serverInfo}`);
}

// Handle autocomplete interactions
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        // Handle autocomplete for help command
        if (interaction.commandName === 'help') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const commands = Array.from(client.commands.values())
                .filter(cmd => 'data' in cmd)
                .map(cmd => ({
                    name: (cmd as any).data.name,
                    description: (cmd as any).data.description || 'Tidak ada deskripsi'
                }))
                .filter(cmd => 
                    cmd.name.toLowerCase().includes(focusedValue) ||
                    cmd.description.toLowerCase().includes(focusedValue)
                )
                .slice(0, 25) // Discord limit is 25 options
                .map(cmd => ({
                    name: `/${cmd.name} - ${cmd.description.length > 50 ? cmd.description.substring(0, 50) + '...' : cmd.description}`,
                    value: cmd.name
                }));

            await interaction.respond(commands);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`Tidak ada command yang cocok dengan ${interaction.commandName} ditemukan.`);
        return;
    }

    // Log command execution
    logCommandExecution(
        interaction.commandName,
        interaction.user.username,
        interaction.user.id,
        interaction.guild?.name || null,
        interaction.guild?.id || null,
        false
    );

    try {
        // Check owner for eval command
        if (interaction.commandName === 'eval' && !isOwner(interaction.user.id)) {
            return interaction.reply({ 
                content: '❌ Anda tidak memiliki izin untuk menggunakan command ini.', 
                flags: 64 // Ephemeral flag
            });
        }
        
        await command.execute(interaction, client);
    } catch (error) {
        console.error(`Error saat mengeksekusi ${interaction.commandName}`);
        console.error(error);
        
        const errorMessage = { content: 'Terjadi kesalahan saat mengeksekusi command ini!', flags: 64 };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Handle prefix commands (for eval)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    
    const prefix = process.env.PREFIX || '$';
    
    // Check if message starts with prefix + eval
    if (message.content.startsWith(`${prefix}eval`)) {
        // Check if user is owner
        if (!isOwner(message.author.id)) {
            return message.reply('❌ Anda tidak memiliki izin untuk menggunakan command ini.');
        }
        
        const evalCommand = client.commands.get('eval');
        if (evalCommand) {
            // Log command execution
            logCommandExecution(
                'eval',
                message.author.username,
                message.author.id,
                message.guild?.name || null,
                message.guild?.id || null,
                true
            );
            
            // Extract code from message
            const code = message.content.slice(`${prefix}eval`.length).trim();
            
            try {
                await evalCommand.execute(message, client, code, true);
            } catch (error) {
                console.error('Error saat mengeksekusi command eval:', error);
                if (error instanceof Error) {
                    message.reply(`❌ Error: ${error.message}`);
                }
            }
        }
    }
});

// Handle member removal (leave/kick) - clear warnings
client.on(Events.GuildMemberRemove, async (member) => {
    try {
        const removedCount = removeAllWarnings(member.guild.id, member.user.id);
        if (removedCount > 0) {
            console.log(`[WARN] Cleared ${removedCount} warning(s) for user ${member.user.tag} (${member.user.id}) after leaving/kicking from ${member.guild.name}`);
        }
    } catch (error) {
        console.error('[WARN] Error clearing warnings on member remove:', error);
    }
});

// Handle ban - clear warnings
client.on(Events.GuildBanAdd, async (ban) => {
    try {
        const removedCount = removeAllWarnings(ban.guild.id, ban.user.id);
        if (removedCount > 0) {
            console.log(`[WARN] Cleared ${removedCount} warning(s) for user ${ban.user.tag} (${ban.user.id}) after being banned from ${ban.guild.name}`);
        }
    } catch (error) {
        console.error('[WARN] Error clearing warnings on ban:', error);
    }
});

// Register slash commands on ready
client.once(Events.ClientReady, async () => {
    if (!client.user) return;
    
    // Set bot username if different from config
    if (client.user.username !== botConfig.name) {
        try {
            await client.user.setUsername(botConfig.name);
            console.log(`[BOT] Username diubah menjadi: ${botConfig.name}`);
        } catch (error) {
            console.error('[BOT] Gagal mengubah username:', error);
        }
    }
    
    console.log(`✅ ${client.user.tag} sedang online!`);
    
    // Initialize database
    try {
        await initDatabase();
    } catch (error) {
        console.error('[ERROR] Failed to initialize database:', error);
    }
    
    // Start activity rotation system
    startActivityRotation(client);
    
    // Register commands
    await registerSlashCommands();
    
    // Setup file watcher setelah bot ready
    setupFileWatcher();
});

// Login
client.login(process.env.TOKEN);
