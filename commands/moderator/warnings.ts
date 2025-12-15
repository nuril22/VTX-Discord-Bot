import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { getUserWarnings, getWarningCount, getWarnSettings } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Lihat daftar warnings yang diterima user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin dilihat warnings-nya')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const guild = interaction.guild;

        if (!guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Command ini hanya dapat digunakan di dalam server!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get warnings
        const warnings = getUserWarnings(guild.id, targetUser.id);
        const warningCount = getWarningCount(guild.id, targetUser.id);
        const settings = getWarnSettings(guild.id);

        if (warningCount === 0) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Tidak Ada Warnings')
                .setDescription(`**${targetUser.tag}** belum pernah menerima warning`)
                .setColor(0x00FF00)
                .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '⚠️ Batas Warn',
                    value: `${settings.max_warnings} warnings`,
                    inline: true
                })
                .setTimestamp()
                .setFooter({
                    text: `Diminta oleh ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Format warnings list
        const warningsList = warnings.slice(0, 10).map((warn, index) => {
            const date = new Date(warn.timestamp * 1000);
            const dateStr = date.toLocaleDateString('id-ID', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `**${index + 1}.** [ID: ${warn.id}] ${dateStr}\n   └ ${warn.reason}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Warnings - ${targetUser.tag}`)
            .setDescription(`**Total:** ${warningCount} warning${warningCount > 1 ? 's' : ''}`)
            .setColor(warningCount >= settings.max_warnings ? 0xFF0000 : 0xFFA500)
            .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
            .addFields({
                name: '📋 Daftar Warnings',
                value: warningsList || 'Tidak ada warnings',
                inline: false
            })
            .addFields({
                name: '⚠️ Status',
                value: `${warningCount}/${settings.max_warnings} warnings`,
                inline: true
            })
            .addFields({
                name: '🔧 Auto-ban',
                value: settings.auto_ban_enabled ? '✅ Aktif' : '❌ Nonaktif',
                inline: true
            })
            .setTimestamp()
            .setFooter({
                text: `Diminta oleh ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        if (warnings.length > 10) {
            embed.setFooter({
                text: getFooterText(`Menampilkan 10 dari ${warnings.length} warnings • Diminta oleh ${interaction.user.tag}`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

