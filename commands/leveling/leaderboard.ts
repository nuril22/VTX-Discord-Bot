import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getTopUsersByLevel, getTopUsersByBalance } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'leveling',
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Lihat leaderboard user berdasarkan level atau uang')
        .addStringOption(option =>
            option
                .setName('tipe')
                .setDescription('Tipe leaderboard yang ingin dilihat')
                .setRequired(false)
                .addChoices(
                    { name: 'Level', value: 'level' },
                    { name: 'Uang', value: 'uang' }
                )
        )
        .addStringOption(option =>
            option
                .setName('global')
                .setDescription('Tampilkan leaderboard global atau hanya server ini')
                .setRequired(false)
                .addChoices(
                    { name: 'Ya (Global)', value: 'yes' },
                    { name: 'Tidak (Server ini saja)', value: 'no' }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const tipe = interaction.options.getString('tipe') || 'level';
        const global = interaction.options.getString('global') || 'no';

        // Get guild member IDs if not global
        let guildMemberIds: string[] | undefined = undefined;
        if (global === 'no') {
            try {
                const members = await interaction.guild?.members.fetch();
                guildMemberIds = members ? Array.from(members.keys()) : undefined;
            } catch (error) {
                console.error('[LEADERBOARD] Error fetching guild members:', error);
                // If we can't fetch members, show global leaderboard instead
                guildMemberIds = undefined;
            }
        }

        let topUsers: Array<{ user_id: string; level?: number; xp?: number; balance?: number }> = [];
        let title = '';
        let description = '';
        let fieldName = '';
        let valueFormatter = (user: any, index: number) => '';

        if (tipe === 'level') {
            topUsers = getTopUsersByLevel(10, guildMemberIds);
            title = '🏆 Leaderboard Level';
            description = global === 'yes' 
                ? '**Top 10 user dengan level tertinggi (Global)**'
                : `**Top 10 user dengan level tertinggi di ${interaction.guild?.name}**`;
            fieldName = '📊 Ranking Level';
            valueFormatter = (user: any, index: number) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : `${index + 1}.`;
                return `${medal} <@${user.user_id}>\n   Level **${user.level}** | XP: **${user.xp.toLocaleString('id-ID')}**`;
            };
        } else {
            topUsers = getTopUsersByBalance(10, guildMemberIds);
            title = '💰 Leaderboard Uang';
            description = global === 'yes'
                ? '**Top 10 user dengan uang terbanyak (Global)**'
                : `**Top 10 user dengan uang terbanyak di ${interaction.guild?.name}**`;
            fieldName = '💵 Ranking Uang';
            valueFormatter = (user: any, index: number) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : `${index + 1}.`;
                return `${medal} <@${user.user_id}>\n   **${user.balance.toLocaleString('id-ID')}** coins`;
            };
        }

        if (topUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📊 Leaderboard Kosong')
                .setDescription(
                    global === 'yes'
                        ? 'Belum ada user yang terdaftar di sistem ini.'
                        : `Belum ada user di server **${interaction.guild?.name}** yang terdaftar di sistem ini.`
                )
                .setColor(0xFFA500)
                .setTimestamp()
                .setFooter({
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Format leaderboard entries
        const leaderboardEntries = topUsers.map((user, index) => valueFormatter(user, index)).join('\n\n');

        // Find user's rank
        let userRank: number | null = null;
        const userId = interaction.user.id;
        const userIndex = topUsers.findIndex(u => u.user_id === userId);
        if (userIndex !== -1) {
            userRank = userIndex + 1;
        } else {
            // User not in top 10, need to find their actual rank
            if (tipe === 'level') {
                const allUsers = getTopUsersByLevel(1000, guildMemberIds);
                const rankIndex = allUsers.findIndex(u => u.user_id === userId);
                if (rankIndex !== -1) {
                    userRank = rankIndex + 1;
                }
            } else {
                const allUsers = getTopUsersByBalance(1000, guildMemberIds);
                const rankIndex = allUsers.findIndex(u => u.user_id === userId);
                if (rankIndex !== -1) {
                    userRank = rankIndex + 1;
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(tipe === 'level' ? 0x9B59B6 : 0x00FF00)
            .addFields({
                name: fieldName,
                value: leaderboardEntries || 'Tidak ada data',
                inline: false
            })
            .setTimestamp()
            .setFooter({
                text: getFooterText(
                    userRank 
                        ? `Diminta oleh ${interaction.user.tag} • Peringkat Anda: #${userRank}`
                        : `Diminta oleh ${interaction.user.tag}`
                ),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
