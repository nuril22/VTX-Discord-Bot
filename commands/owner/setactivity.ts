import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    ActivityType,
    PresenceStatusData
} from 'discord.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isOwner(userId: string): boolean {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim());
    return ownerIds.includes(userId);
}

interface ActivityConfig {
    status: 'online' | 'idle' | 'dnd' | 'invisible';
    activities: Array<{
        name: string;
        type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing';
    }>;
}

function loadActivityConfig(): ActivityConfig {
    const configPath = join(__dirname, '../../settings/activity.ts');
    try {
        if (existsSync(configPath)) {
            const content = readFileSync(configPath, 'utf-8');
            // Extract JSON-like structure from TypeScript file
            const statusMatch = content.match(/status:\s*['"](online|idle|dnd|invisible)['"]/);
            const activitiesMatch = content.match(/activities:\s*\[([\s\S]*?)\]/);
            
            let status: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';
            let activities: Array<{ name: string; type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing' }> = [];
            
            if (statusMatch) {
                status = statusMatch[1] as any;
            }
            
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
            
            return { status, activities: activities.length > 0 ? activities : [{ name: 'Discord.js v14', type: 'Playing' }] };
        }
    } catch (error) {
        console.error('[ERROR] Error loading activity config:', error);
    }
    
    return {
        status: 'online',
        activities: [{ name: 'Discord.js v14', type: 'Playing' }]
    };
}

function saveActivityConfig(config: ActivityConfig): void {
    const configPath = join(__dirname, '../../settings/activity.ts');
    const activitiesStr = config.activities.map(a => 
        `        {\n            name: '${a.name.replace(/'/g, "\\'")}',\n            type: '${a.type}'\n        }`
    ).join(',\n');
    
    const content = `// Activity settings untuk bot
// File ini akan di-update oleh command /setactivity

export interface ActivityConfig {
    status: 'online' | 'idle' | 'dnd' | 'invisible';
    activities: Array<{
        name: string;
        type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing';
    }>;
}

// Default activity configuration
export const activityConfig: ActivityConfig = {
    status: '${config.status}',
    activities: [
${activitiesStr}
    ]
};
`;
    
    writeFileSync(configPath, content, 'utf-8');
}

export default {
    category: 'owner',
    data: new SlashCommandBuilder()
        .setName('setactivity')
        .setDescription('Set activity bot (Owner Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Set status bot (online, idle, dnd, invisible)')
                .addStringOption(option =>
                    option
                        .setName('status')
                        .setDescription('Status yang ingin di-set')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Online', value: 'online' },
                            { name: 'Idle', value: 'idle' },
                            { name: 'Do Not Disturb', value: 'dnd' },
                            { name: 'Invisible', value: 'invisible' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Tambah activity baru')
                .addStringOption(option =>
                    option
                        .setName('text')
                        .setDescription('Text activity')
                        .setRequired(true)
                        .setMaxLength(128)
                )
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Tipe activity')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Playing', value: 'Playing' },
                            { name: 'Streaming', value: 'Streaming' },
                            { name: 'Listening', value: 'Listening' },
                            { name: 'Watching', value: 'Watching' },
                            { name: 'Competing', value: 'Competing' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Hapus activity berdasarkan index')
                .addIntegerOption(option =>
                    option
                        .setName('index')
                        .setDescription('Index activity yang ingin dihapus (dimulai dari 1)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lihat daftar activity yang tersedia')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Hapus semua activity')
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!isOwner(interaction.user.id)) {
            await interaction.reply({
                content: '❌ Hanya owner yang bisa menggunakan command ini!',
                flags: 64 // Ephemeral
            });
            return;
        }

        // Defer reply untuk menghindari timeout
        await interaction.deferReply({ flags: 64 }); // Ephemeral

        const subcommand = interaction.options.getSubcommand();
        const config = loadActivityConfig();

        if (subcommand === 'status') {
            const status = interaction.options.getString('status', true) as PresenceStatusData;
            config.status = status as any;
            saveActivityConfig(config);
            
            if (client.user) {
                client.user.setStatus(status);
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Status Diperbarui')
                .setDescription(`Status bot telah diubah menjadi: **${status}**`)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'add') {
            const text = interaction.options.getString('text', true);
            const type = interaction.options.getString('type', true) as 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing';
            
            config.activities.push({ name: text, type });
            saveActivityConfig(config);
            
            // Reload activity
            if (client.user && config.activities.length > 0) {
                const firstActivity = config.activities[0];
                const activityTypeMap: Record<string, ActivityType> = {
                    'Playing': ActivityType.Playing,
                    'Streaming': ActivityType.Streaming,
                    'Listening': ActivityType.Listening,
                    'Watching': ActivityType.Watching,
                    'Competing': ActivityType.Competing
                };
                client.user.setActivity(firstActivity.name, { type: activityTypeMap[firstActivity.type] });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Activity Ditambahkan')
                .setDescription(`Activity baru telah ditambahkan!`)
                .addFields(
                    {
                        name: '📝 Text',
                        value: `\`${text}\``,
                        inline: true
                    },
                    {
                        name: '🎮 Type',
                        value: `\`${type}\``,
                        inline: true
                    },
                    {
                        name: '📊 Total Activity',
                        value: `\`${config.activities.length}\` activity`,
                        inline: false
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
            const index = interaction.options.getInteger('index', true);
            
            if (index < 1 || index > config.activities.length) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Index Tidak Valid')
                    .setDescription(`Index harus antara 1 dan ${config.activities.length}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const removed = config.activities.splice(index - 1, 1)[0];
            
            if (config.activities.length === 0) {
                config.activities.push({ name: 'Discord.js v14', type: 'Playing' });
            }
            
            saveActivityConfig(config);
            
            // Reload activity
            if (client.user && config.activities.length > 0) {
                const firstActivity = config.activities[0];
                const activityTypeMap: Record<string, ActivityType> = {
                    'Playing': ActivityType.Playing,
                    'Streaming': ActivityType.Streaming,
                    'Listening': ActivityType.Listening,
                    'Watching': ActivityType.Watching,
                    'Competing': ActivityType.Competing
                };
                client.user.setActivity(firstActivity.name, { type: activityTypeMap[firstActivity.type] });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Activity Dihapus')
                .setDescription(`Activity telah dihapus!`)
                .addFields(
                    {
                        name: '🗑️ Activity yang Dihapus',
                        value: `\`${removed.name}\` (${removed.type})`,
                        inline: false
                    },
                    {
                        name: '📊 Total Activity',
                        value: `\`${config.activities.length}\` activity`,
                        inline: false
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'list') {
            if (config.activities.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📋 Daftar Activity')
                    .setDescription('Tidak ada activity yang tersedia.')
                    .setColor(0xFFA500)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const activitiesList = config.activities.map((activity, index) => 
                `**${index + 1}.** \`${activity.name}\` (${activity.type})`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📋 Daftar Activity')
                .setDescription(activitiesList)
                .addFields(
                    {
                        name: '📊 Total',
                        value: `\`${config.activities.length}\` activity`,
                        inline: true
                    },
                    {
                        name: '🔄 Status',
                        value: `\`${config.status}\``,
                        inline: true
                    },
                    {
                        name: '⏱️ Rotasi',
                        value: `Setiap \`12 detik\``,
                        inline: false
                    }
                )
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'clear') {
            config.activities = [{ name: 'Discord.js v14', type: 'Playing' }];
            saveActivityConfig(config);
            
            if (client.user) {
                client.user.setActivity('Discord.js v14', { type: ActivityType.Playing });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Semua Activity Dihapus')
                .setDescription('Semua activity telah dihapus dan direset ke default.')
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
