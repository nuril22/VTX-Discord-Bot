import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuInteraction,
    ComponentType
} from 'discord.js';
import { getFooterText } from '../../settings/bot.js';

interface CommandWithCategory {
    name: string;
    description: string;
    category?: string;
}

const categoryColors: { [key: string]: number } = {
    'owner': 0xFF0000,      // Red
    'utility': 0x5865F2,    // Blurple
    'economy': 0x00FF00,    // Green
    'gambling': 0xFFD700,   // Gold
    'rpg': 0x9B59B6,        // Purple
    'leveling': 0x3498DB,   // Blue
    'moderator': 0xFF6B6B,  // Coral Red
    'other': 0x2C2F33       // Dark gray
};

const categoryEmojis: { [key: string]: string } = {
    'owner': '🔐',
    'utility': '🛠️',
    'economy': '💰',
    'gambling': '🎰',
    'rpg': '⚔️',
    'leveling': '📊',
    'moderator': '🛡️',
    'other': '📋'
};

const categoryNames: { [key: string]: string } = {
    'owner': 'Owner',
    'utility': 'Utility',
    'economy': 'Economy',
    'gambling': 'Gambling',
    'rpg': 'RPG',
    'leveling': 'Leveling',
    'moderator': 'Moderator',
    'other': 'Lainnya'
};

const categoryDescriptions: { [key: string]: string } = {
    'owner': 'Commands khusus untuk owner bot',
    'utility': 'Commands utilitas yang berguna',
    'economy': 'Commands sistem keuangan',
    'gambling': 'Commands permainan judi',
    'rpg': 'Commands sistem RPG dan mining',
    'leveling': 'Commands untuk melihat level, XP, dan leaderboard',
    'moderator': 'Commands untuk moderasi server',
    'giveaway': 'Commands untuk giveaway',
    'other': 'Commands lainnya'
};

export default {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Menampilkan daftar semua commands yang tersedia')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('Nama command untuk melihat detail informasi')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const commands: CommandWithCategory[] = [];
        
        // Collect all commands with their categories
        for (const [name, command] of client.commands.entries()) {
            if ('data' in command) {
                commands.push({
                    name: command.data.name,
                    description: command.data.description || 'Tidak ada deskripsi',
                    category: (command as any).category || 'other'
                });
            }
        }

        // Group commands by category
        const categorizedCommands: { [key: string]: CommandWithCategory[] } = {};
        
        for (const cmd of commands) {
            const cat = cmd.category || 'other';
            if (!categorizedCommands[cat]) {
                categorizedCommands[cat] = [];
            }
            categorizedCommands[cat].push(cmd);
        }

        // Check if user specified a command
        const commandName = interaction.options.getString('command');
        
        if (commandName) {
            // Show detailed info for specific command
            const command = client.commands.get(commandName);
            
            if (!command || !('data' in command)) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Command Tidak Ditemukan')
                    .setDescription(`Command \`/${commandName}\` tidak ditemukan.\n\nGunakan dropdown di bawah untuk melihat semua commands yang tersedia.`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                
                // Build select menu for categories
                const availableCategories = Object.keys(categorizedCommands).filter(cat => categorizedCommands[cat].length > 0);
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('help_category_select')
                    .setPlaceholder('📋 Pilih kategori untuk melihat commands...')
                    .addOptions(
                        ...availableCategories.map(cat => ({
                            label: `${categoryNames[cat] || cat} (${categorizedCommands[cat].length})`,
                            description: categoryDescriptions[cat] || `Commands di kategori ${cat}`,
                            value: cat,
                            emoji: categoryEmojis[cat] || '📋'
                        }))
                    );
                
                const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents(selectMenu);
                
                await interaction.editReply({ embeds: [errorEmbed], components: [row] });
                return;
            }

            // Build detailed command info embed
            const commandData = command.data;
            const category = (command as any).category || 'other';
            const optionsList = commandData.options.length > 0 
                ? commandData.options.map((opt: any) => {
                    const required = opt.required ? ' (Wajib)' : ' (Opsional)';
                    return `**\`${opt.name}\`**${required}\n   ${opt.description || 'Tidak ada deskripsi'}`;
                }).join('\n\n')
                : 'Tidak ada options';

            const commandEmbed = new EmbedBuilder()
                .setTitle(`📖 Informasi Command: \`/${commandData.name}\``)
                .setDescription(commandData.description || 'Tidak ada deskripsi')
                .setColor(categoryColors[category] || 0x5865F2)
                .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: `${categoryEmojis[category] || '📋'} Kategori`,
                    value: `**${categoryNames[category] || category}**\n${categoryDescriptions[category] || ''}`,
                    inline: true
                })
                .addFields({
                    name: '📝 Penggunaan',
                    value: `\`/${commandData.name}${commandData.options.length > 0 ? ' [options]' : ''}\``,
                    inline: true
                })
                .addFields({
                    name: commandData.options.length > 0 
                        ? `⚙️ Options (${commandData.options.length})` 
                        : '⚙️ Options',
                    value: optionsList,
                    inline: false
                })
                .addFields({
                    name: '💡 Tips',
                    value: `Gunakan \`/help\` tanpa parameter untuk melihat semua commands`,
                    inline: false
                })
                .setTimestamp()
                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await interaction.editReply({ embeds: [commandEmbed] });
            return;
        }

        // Get available categories
        const availableCategories = Object.keys(categorizedCommands).filter(cat => categorizedCommands[cat].length > 0);

        // Create select menu for categories
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category_select')
            .setPlaceholder('📋 Pilih kategori untuk melihat commands...')
            .addOptions(
                ...availableCategories.map(cat => ({
                    label: `${categoryNames[cat] || cat} (${categorizedCommands[cat].length})`,
                    description: categoryDescriptions[cat] || `Commands di kategori ${cat}`,
                    value: cat,
                    emoji: categoryEmojis[cat] || '📋'
                }))
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(selectMenu);

        // Create main embed showing categories dengan format yang lebih menarik
        const categoriesList = availableCategories
            .map((cat, index) => {
                const emoji = categoryEmojis[cat] || '📋';
                const name = categoryNames[cat] || cat;
                const count = categorizedCommands[cat].length;
                const desc = categoryDescriptions[cat] || '';
                return `**${emoji} ${name}**\n└ ${desc}\n└ **${count}** command${count > 1 ? 's' : ''} tersedia`;
            })
            .join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle('📚 Menu Help - Daftar Kategori Commands')
            .setDescription(`**Selamat datang di menu help!** 👋\n\nGunakan dropdown di bawah untuk melihat commands di setiap kategori.\n\n${categoriesList}`)
            .setColor(0x5865F2)
            .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
            .addFields({
                name: '📊 Informasi',
                value: `**Total Commands:** ${commands.length}\n**Total Kategori:** ${availableCategories.length}`,
                inline: false
            })
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag} • Gunakan dropdown untuk melihat commands`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [row] 
        });

        // Create collector for select menu interaction
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i: StringSelectMenuInteraction) => 
                i.user.id === interaction.user.id && i.customId === 'help_category_select',
            time: 60000 // 60 seconds
        });

        collector.on('collect', async (i: StringSelectMenuInteraction) => {
            const selectedCategory = i.values[0];
            const categoryCommands = categorizedCommands[selectedCategory] || [];

            // Format commands list dengan bullet points yang lebih menarik
            const commandsList = categoryCommands
                .map((cmd, index) => {
                    return `**${index + 1}.** \`/${cmd.name}\`\n   ${cmd.description}`;
                })
                .join('\n\n');

            // Create embed for selected category
            const categoryEmbed = new EmbedBuilder()
                .setTitle(`${categoryEmojis[selectedCategory] || '📋'} ${categoryNames[selectedCategory] || selectedCategory}`)
                .setDescription(`**${categoryDescriptions[selectedCategory] || 'Commands di kategori ini'}**\n\n${commandsList}`)
                .setColor(categoryColors[selectedCategory] || 0x5865F2)
                .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '📊 Total Commands',
                    value: `**${categoryCommands.length}** command${categoryCommands.length > 1 ? 's' : ''} tersedia`,
                    inline: true
                })
                .addFields({
                    name: '💡 Tips',
                    value: `Gunakan \`/help\` untuk kembali ke menu utama`,
                    inline: true
                })
                .setTimestamp()
                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${i.user.tag}`), 
                    iconURL: i.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await i.update({ 
                embeds: [categoryEmbed], 
                components: [row] // Keep the select menu for selecting another category
            });
        });

        collector.on('end', async () => {
            // Remove select menu when collector ends
            const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    selectMenu.setDisabled(true)
                );

            try {
                await interaction.editReply({ components: [disabledRow] });
            } catch (error) {
                // Message might have been deleted
                console.error('Error disabling select menu:', error);
            }
        });
    },
};
