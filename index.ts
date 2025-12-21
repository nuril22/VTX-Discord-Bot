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
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates
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

    // Handle button interactions
    if (interaction.isButton()) {
        // Handle ticket create button
        if (interaction.customId === 'ticket_create') {
            const { EmbedBuilder, ChannelType, MessageFlags } = await import('discord.js');
            const { getFooterText } = await import('./settings/bot.js');
            const { createTicket, getTicketConfig, getUserTickets } = await import('./database/db.js');

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di server!' });
            }

            // Check if ticket system is setup
            const config = getTicketConfig(guild.id);
            if (!config) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Ticket system belum diatur!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if user already has an open ticket
            const userTickets = getUserTickets(interaction.user.id, guild.id);
            const openTicket = userTickets.find(t => t.is_closed === 0);
            
            if (openTicket) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Anda sudah memiliki ticket yang terbuka: <#${openTicket.channel_id}>`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Get or create ticket category
                let ticketCategory = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
                );

                if (!ticketCategory) {
                    ticketCategory = await guild.channels.create({
                        name: 'Tickets',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                deny: ['ViewChannel'],
                            },
                        ],
                    });
                }

                // Create ticket channel
                const ticketId = `ticket-${interaction.user.id}-${Date.now()}`;
                const ticketChannel = await guild.channels.create({
                    name: ticketId,
                    type: ChannelType.GuildText,
                    parent: ticketCategory.id,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                        {
                            id: client.user!.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                        },
                    ],
                });

                // Add role to channel if configured
                if (config.role_id) {
                    await ticketChannel.permissionOverwrites.edit(config.role_id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                    });
                }

                // Create ticket in database
                createTicket(ticketId, guild.id, ticketChannel.id, interaction.user.id);

                // Send welcome message
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Dibuka')
                    .setDescription(`Halo <@${interaction.user.id}>!\n\nTerima kasih telah membuat ticket. Silakan jelaskan masalah atau pertanyaan Anda.\n\n${config.role_id ? `<@&${config.role_id}> akan segera membantu Anda.` : 'Staff akan segera membantu Anda.'}\n\nGunakan \`/ticket close\` untuk menutup ticket ini.`)
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Ticket ID: ${ticketId}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await ticketChannel.send({ 
                    content: config.role_id ? `<@&${config.role_id}>` : undefined,
                    embeds: [welcomeEmbed] 
                });

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Ticket Berhasil Dibuat')
                    .setDescription(`Ticket Anda telah dibuat: ${ticketChannel}`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error: any) {
                console.error('[TICKET] Error creating ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal membuat ticket: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Handle giveaway join button
        if (interaction.customId.startsWith('giveaway_join_')) {
            const giveawayId = interaction.customId.replace('giveaway_join_', '');
            const { getGiveaway, addGiveawayParticipant, removeGiveawayParticipant, getGiveawayParticipants } = await import('./database/db.js');
            
            const giveaway = getGiveaway(giveawayId);
            if (!giveaway) {
                await interaction.reply({ 
                    content: '❌ Giveaway tidak ditemukan!', 
                    flags: 64 // Ephemeral
                });
                return;
            }

            // Check if giveaway has ended
            if (giveaway.ended === 1) {
                await interaction.reply({ 
                    content: '❌ Giveaway ini sudah berakhir!', 
                    flags: 64 // Ephemeral
                });
                return;
            }

            // Check if giveaway is expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (giveaway.end_time <= currentTime) {
                await interaction.reply({ 
                    content: '❌ Giveaway ini sudah berakhir!', 
                    flags: 64 // Ephemeral
                });
                return;
            }

            // Check role requirement
            if (giveaway.role_requirement) {
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!member || !member.roles.cache.has(giveaway.role_requirement)) {
                    await interaction.reply({ 
                        content: `❌ Anda harus memiliki role <@&${giveaway.role_requirement}> untuk ikut giveaway ini!`, 
                        flags: 64 // Ephemeral
                    });
                    return;
                }
            }

            // Toggle participation (join if not participating, leave if already participating)
            const participants = getGiveawayParticipants(giveawayId);
            const isParticipating = participants.includes(interaction.user.id);

            if (isParticipating) {
                // Leave giveaway
                removeGiveawayParticipant(giveawayId, interaction.user.id);
                await interaction.reply({ 
                    content: '✅ Anda telah keluar dari giveaway!', 
                    flags: 64 // Ephemeral
                });
            } else {
                // Join giveaway
                addGiveawayParticipant(giveawayId, interaction.user.id);
                await interaction.reply({ 
                    content: '✅ Anda telah ikut giveaway! Semoga beruntung! 🎉', 
                    flags: 64 // Ephemeral
                });
            }
            return;
        }

        // Handle AI create button
        if (interaction.customId === 'ai_create') {
            const { EmbedBuilder, ChannelType, MessageFlags } = await import('discord.js');
            const { getFooterText } = await import('./settings/bot.js');
            const { createAISession, getAIConfig, getUserAISessions } = await import('./database/db.js');

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di server!' });
            }

            // Check if AI system is setup
            const config = getAIConfig(guild.id);
            if (!config) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('AI system belum diatur!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if user already has an AI session
            const userSessions = getUserAISessions(interaction.user.id, guild.id);
            const openSession = userSessions.find(s => {
                const channel = guild.channels.cache.get(s.channel_id);
                return channel && channel.isTextBased();
            });
            
            if (openSession) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Anda sudah memiliki AI channel yang aktif: <#${openSession.channel_id}>\n\nGunakan \`/ai-delete\` untuk menghapus session sebelumnya.`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Get or create AI category
                let aiCategory = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'ai chat'
                );

                if (!aiCategory) {
                    aiCategory = await guild.channels.create({
                        name: 'AI Chat',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                deny: ['ViewChannel'],
                            },
                        ],
                    });
                }

                // Generate session ID (this will be used as channel name)
                const sessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}-chatgpt-${Math.floor(Date.now() / 1000)}`;
                const channelName = sessionId; // Use session ID as channel name

                // Create AI channel
                const aiChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: aiCategory.id,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                        {
                            id: client.user!.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                        },
                    ],
                });

                // Create session in database
                createAISession(aiChannel.id, guild.id, interaction.user.id, sessionId);

                // Send welcome message and trigger AI first message
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('🤖 AI Chat Channel')
                    .setDescription(`Halo <@${interaction.user.id}>!\n\nChannel AI chat Anda telah dibuat. Mulai chat dengan AI sekarang!\n\n**Session ID:** \`${sessionId}\`\n\nGunakan \`/ai-delete\` untuk menghapus channel ini.`)
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Session ID: ${sessionId}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await aiChannel.send({ embeds: [welcomeEmbed] });

                // Send first message to AI to create session
                try {
                    const response = await fetch(`https://api.ryzumi.vip/api/ai/chatgpt?text=Hello&session=${sessionId}`);
                    const data = await response.json() as { success: boolean; result: string; session: string };
                    
                    if (data.success && data.result) {
                        await aiChannel.send(`**AI:** ${data.result}`);
                    }
                } catch (error) {
                    console.error('[AI] Error sending first message to AI:', error);
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ AI Channel Berhasil Dibuat')
                    .setDescription(`Channel AI Anda telah dibuat: ${aiChannel}`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error: any) {
                console.error('[AI] Error creating AI channel:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal membuat AI channel: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

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
        
        // Execute command with timeout protection
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Command execution timeout (60s)')), 60000);
        });
        
        await Promise.race([
            command.execute(interaction, client),
            timeoutPromise
        ]);
    } catch (error: any) {
        console.error(`[ERROR] Error saat mengeksekusi ${interaction.commandName}`);
        console.error('[ERROR] Error details:', error);
        console.error('[ERROR] Error stack:', error.stack);
        
        const errorMessage = error.message || 'Terjadi kesalahan saat mengeksekusi command ini!';
        const errorResponse = { 
            content: `❌ **Error:** ${errorMessage.length > 1900 ? errorMessage.substring(0, 1897) + '...' : errorMessage}`, 
            flags: 64 
        };
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        } catch (replyError: any) {
            console.error('[ERROR] Failed to send error message:', replyError);
            // Try to send to channel as last resort
            try {
                if (interaction.channel && interaction.channel.isTextBased()) {
                    await interaction.channel.send({ 
                        content: `❌ **Error saat menjalankan command \`/${interaction.commandName}\`:**\n${errorMessage.substring(0, 1900)}`,
                        flags: 64
                    });
                }
            } catch (channelError) {
                console.error('[ERROR] Failed to send error to channel:', channelError);
            }
        }
    }
});

// Handle prefix commands (for eval)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    
    // Handle AI chat messages
    if (message.guild && message.channel.isTextBased()) {
        const { getAISession } = await import('./database/db.js');
        const session = getAISession(message.channel.id);
        
        if (session) {
            // This is an AI channel, process the message
            try {
                // Show typing indicator
                await message.channel.sendTyping();
                
                // Check if user wants to close the session
                const closeKeywords = ['close', 'delete', 'end session', 'close session', 'delete session', 'tutup', 'hapus'];
                const messageLower = message.content.toLowerCase().trim();
                const wantsToClose = closeKeywords.some(keyword => messageLower.includes(keyword));
                
                if (wantsToClose) {
                    // User wants to close the session
                    const { deleteAISession } = await import('./database/db.js');
                    
                    // Delete session from database
                    deleteAISession(message.channel.id);
                    
                    // Send confirmation
                    await message.reply('✅ Session AI akan ditutup. Channel akan dihapus dalam 3 detik...');
                    
                    // Delete channel after 3 seconds
                    setTimeout(async () => {
                        try {
                            if (message.channel.isTextBased() && 'deletable' in message.channel && message.channel.deletable) {
                                await message.channel.delete();
                            }
                        } catch (error) {
                            console.error('[AI] Error deleting channel:', error);
                        }
                    }, 3000);
                    
                    return;
                }
                
                // Add context prompt for Discord
                const discordContext = `[Context: You are chatting in a Discord server. This is a private channel. If the user wants to close this chat, they will say "close", "delete", "end session", or similar. Respond naturally as a helpful Discord AI assistant.]\n\nUser message: ${message.content}`;
                
                // Call AI API
                const response = await fetch(`https://api.ryzumi.vip/api/ai/chatgpt?text=${encodeURIComponent(discordContext)}&session=${session.session_id}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    console.error(`[AI] API returned status ${response.status}:`, errorText.substring(0, 200));
                    
                    // Handle specific status codes
                    if (response.status === 403) {
                        console.warn('[AI] API returned 403 Forbidden - API might be rate limited or blocked');
                        await message.reply('❌ Maaf, API sedang tidak dapat diakses saat ini. Silakan coba lagi nanti.').catch(() => {});
                        return;
                    }
                    
                    if (response.status === 429) {
                        console.warn('[AI] API returned 429 Too Many Requests - Rate limited');
                        await message.reply('⏳ Terlalu banyak request. Silakan tunggu sebentar dan coba lagi.').catch(() => {});
                        return;
                    }
                    
                    await message.reply('❌ Maaf, terjadi kesalahan saat memproses pesan Anda.').catch(() => {});
                    return;
                }
                
                const contentType = response.headers.get('content-type') || '';
                const text = await response.text();
                
                // Check if response is JSON
                if (!contentType.includes('application/json') && !text.trim().startsWith('{')) {
                    console.error('[AI] Response is not JSON, content-type:', contentType, 'body:', text.substring(0, 200));
                    await message.reply('❌ Maaf, terjadi kesalahan saat memproses pesan Anda.').catch(() => {});
                    return;
                }
                
                let data: { success: boolean; result: string; session: string };
                
                try {
                    data = JSON.parse(text) as { success: boolean; result: string; session: string };
                } catch (parseError) {
                    console.error('[AI] Failed to parse JSON response. Status:', response.status);
                    console.error('[AI] Response text (first 500 chars):', text.substring(0, 500));
                    await message.reply('❌ Maaf, terjadi kesalahan saat memproses pesan Anda.').catch(() => {});
                    return;
                }
                
                if (data.success && data.result) {
                    await message.reply(data.result);
                } else {
                    console.warn('[AI] API response indicates failure:', data);
                    await message.reply('❌ Maaf, terjadi kesalahan saat memproses pesan Anda.').catch(() => {});
                }
            } catch (error: any) {
                console.error('[AI] Error processing AI message:', error);
                console.error('[AI] Error details:', {
                    message: error.message,
                    stack: error.stack,
                });
                await message.reply('❌ Maaf, terjadi kesalahan saat memproses pesan Anda.').catch(() => {});
            }
            return;
        }
    }
    
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

// Function to check and end expired giveaways
async function checkExpiredGiveaways(client: Client): Promise<void> {
    try {
        const { getExpiredGiveaways, endGiveaway, getGiveawayParticipants } = await import('./database/db.js');
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        const { getFooterText } = await import('./settings/bot.js');
        
        const expiredGiveaways = getExpiredGiveaways();
        
        if (expiredGiveaways.length === 0) {
            return;
        }

        console.log(`[GIVEAWAY] Menemukan ${expiredGiveaways.length} giveaway yang berakhir.`);

        for (const giveaway of expiredGiveaways) {
            try {
                // Get participants
                const participants = getGiveawayParticipants(giveaway.id);

                // Select winners
                const selectWinners = (participants: string[], winnerCount: number): string[] => {
                    if (participants.length === 0) return [];
                    const shuffled = [...participants].sort(() => Math.random() - 0.5);
                    return shuffled.slice(0, Math.min(winnerCount, participants.length));
                };

                const winners = selectWinners(participants, giveaway.winner_count);

                // End giveaway in database
                endGiveaway(giveaway.id, winners);

                // Try to update the original message
                const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
                if (!guild) continue;

                const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
                if (!channel || !channel.isTextBased()) continue;

                const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                if (!message) continue;

                // Disable button
                const disabledButton = new ButtonBuilder()
                    .setCustomId(`giveaway_join_${giveaway.id}`)
                    .setLabel('Giveaway Berakhir')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎁')
                    .setDisabled(true);

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(disabledButton);

                // Create ended embed
                const endedEmbed = new EmbedBuilder()
                    .setTitle('🎉 Giveaway Berakhir!')
                    .setDescription(
                        (giveaway.request ? `**Request:** ${giveaway.request}\n\n` : '') +
                        `**Pemenang:** ${giveaway.winner_count} ${giveaway.winner_count === 1 ? 'orang' : 'orang'}\n` +
                        (giveaway.role_requirement ? `**Role Diperlukan:** <@&${giveaway.role_requirement}>\n` : '') +
                        `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n\n` +
                        (winners.length > 0 
                            ? `**🎊 Pemenang:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                            : '**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)'
                        )
                    )
                    .setColor(0xFFA500)
                    .setTimestamp()
                    .setFooter({ 
                        text: getFooterText('Giveaway berakhir otomatis'), 
                        iconURL: client.user?.displayAvatarURL({ forceStatic: false }) || undefined 
                    });

                await message.edit({ embeds: [endedEmbed], components: [row] });

                // Mention creator and send announcement
                try {
                    const creator = await guild.members.fetch(giveaway.creator_id).catch(() => null);
                    if (creator) {
                        const announcementText = winners.length > 0
                            ? `🎉 **Giveaway Berakhir!** <@${giveaway.creator_id}>\n\n**🎊 Pemenang:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                            : `🎉 **Giveaway Berakhir!** <@${giveaway.creator_id}>\n\n**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)`;
                        
                        await channel.send({ content: announcementText });
                    }
                } catch (error) {
                    console.error(`[GIVEAWAY] Error sending announcement for ${giveaway.id}:`, error);
                }

                // Send DM to winners
                if (winners.length > 0) {
                    for (const winnerId of winners) {
                        try {
                            const winner = await client.users.fetch(winnerId).catch(() => null);
                            if (winner) {
                                const dmEmbed = new EmbedBuilder()
                                    .setTitle('🎉 Selamat! Anda Menang Giveaway!')
                                    .setDescription(
                                        `Anda telah memenangkan giveaway di **${guild.name}**!\n\n` +
                                        `**Giveaway ID:** \`${giveaway.id}\`\n` +
                                        (giveaway.request ? `**Request:** ${giveaway.request}\n` : '') +
                                        `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n` +
                                        `**Jumlah Pemenang:** ${giveaway.winner_count} ${giveaway.winner_count === 1 ? 'orang' : 'orang'}`
                                    )
                                    .setColor(0x00FF00)
                                    .setTimestamp()
                                    .setFooter({ 
                                        text: getFooterText(`Selamat! 🎊`), 
                                        iconURL: guild.iconURL({ forceStatic: false }) || undefined 
                                    });

                                await winner.send({ embeds: [dmEmbed] }).catch(() => {
                                    // User has DMs disabled, ignore
                                });
                            }
                        } catch (error) {
                            // Failed to send DM, ignore
                            console.error(`[GIVEAWAY] Error sending DM to winner ${winnerId}:`, error);
                        }
                    }
                }

                console.log(`[GIVEAWAY] Giveaway ${giveaway.id} berhasil diakhiri.`);
            } catch (error) {
                console.error(`[GIVEAWAY] Error ending giveaway ${giveaway.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[GIVEAWAY] Error checking expired giveaways:', error);
    }
}

// Function to cleanup old ended giveaways (older than 1 day)
async function cleanupOldGiveaways(): Promise<void> {
    try {
        const { getOldEndedGiveaways, deleteGiveaway } = await import('./database/db.js');
        
        const oldGiveaways = getOldEndedGiveaways();
        
        if (oldGiveaways.length === 0) {
            return;
        }

        console.log(`[GIVEAWAY] Menemukan ${oldGiveaways.length} giveaway lama yang akan dihapus.`);

        for (const giveaway of oldGiveaways) {
            try {
                const deleted = deleteGiveaway(giveaway.id);
                if (deleted) {
                    console.log(`[GIVEAWAY] Giveaway ${giveaway.id} berhasil dihapus (lebih dari 1 hari sejak berakhir).`);
                }
            } catch (error) {
                console.error(`[GIVEAWAY] Error deleting old giveaway ${giveaway.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[GIVEAWAY] Error cleaning up old giveaways:', error);
    }
}

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
    
    // Check and end expired giveaways
    await checkExpiredGiveaways(client);
    
    // Cleanup old ended giveaways (older than 1 day)
    await cleanupOldGiveaways();
    
    // Set up periodic check for expired giveaways (every 10 seconds for faster response)
    setInterval(async () => {
        await checkExpiredGiveaways(client);
    }, 10000); // Check every 10 seconds
    
    // Set up periodic cleanup for old giveaways (every hour)
    setInterval(async () => {
        await cleanupOldGiveaways();
    }, 3600000); // Check every hour
    
    // Start activity rotation system
    startActivityRotation(client);
    
    // Register commands
    await registerSlashCommands();
    
    // Setup file watcher setelah bot ready
    setupFileWatcher();
});

// Login
client.login(process.env.TOKEN);
