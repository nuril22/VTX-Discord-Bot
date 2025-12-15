import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { removeWarning, removeAllWarnings, getUserWarnings, getWarningCount } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('warn-remove')
        .setDescription('Hapus warning dari user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin dihapus warning-nya')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID warning yang ingin dihapus (kosongkan untuk hapus semua)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const warningId = interaction.options.getInteger('id');
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

        const currentWarnings = getUserWarnings(guild.id, targetUser.id);
        const currentCount = getWarningCount(guild.id, targetUser.id);

        if (currentCount === 0) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`**${targetUser.tag}** tidak memiliki warning untuk dihapus`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (warningId) {
            // Remove specific warning
            const warningExists = currentWarnings.some(w => w.id === warningId);
            
            if (!warningExists) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Warning dengan ID **${warningId}** tidak ditemukan untuk user ini`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const success = removeWarning(guild.id, warningId);
            
            if (success) {
                const newCount = getWarningCount(guild.id, targetUser.id);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Warning Dihapus')
                    .setDescription(`Warning ID **${warningId}** telah dihapus dari **${targetUser.tag}**`)
                    .setColor(0x00FF00)
                    .addFields({
                        name: '⚠️ Total Warn',
                        value: `${newCount} warning${newCount > 1 ? 's' : ''}`,
                        inline: true
                    })
                    .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Gagal menghapus warning')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
        } else {
            // Remove all warnings
            const removedCount = removeAllWarnings(guild.id, targetUser.id);
            
            if (removedCount > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Semua Warning Dihapus')
                    .setDescription(`**${removedCount}** warning telah dihapus dari **${targetUser.tag}**`)
                    .setColor(0x00FF00)
                    .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Gagal menghapus warnings')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
        }
    },
};

