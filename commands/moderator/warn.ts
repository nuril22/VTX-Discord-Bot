import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { 
    addWarning, 
    getWarningCount, 
    getWarnSettings,
    removeAllWarnings
} from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Berikan peringatan (warn) kepada user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang akan di-warn')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Alasan warn (opsional)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'Tidak ada alasan yang diberikan';
        const moderator = interaction.user;

        // Check if target is a bot
        if (targetUser.bot) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat memberikan warn kepada bot!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if trying to warn self
        if (targetUser.id === moderator.id) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat memberikan warn kepada diri sendiri!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get guild
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

        // Check if target has higher or equal role
        const moderatorMember = await guild.members.fetch(moderator.id).catch(() => null);
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        
        if (targetMember && moderatorMember) {
            if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position && moderator.id !== guild.ownerId) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Anda tidak dapat memberikan warn kepada user dengan role yang sama atau lebih tinggi!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }
        }

        // Add warning to database
        const warningCount = addWarning(guild.id, targetUser.id, moderator.id, reason);
        
        // Get warn settings
        const settings = getWarnSettings(guild.id);
        const maxWarnings = settings.max_warnings;
        const autoBanEnabled = settings.auto_ban_enabled;

        // Check if user should be auto-banned (ban when reaching or exceeding the limit)
        let wasBanned = false;
        if (autoBanEnabled && warningCount >= maxWarnings) {
            try {
                // Remove all warnings before auto-banning
                removeAllWarnings(guild.id, targetUser.id);
                
                await guild.members.ban(targetUser, { reason: `Auto-ban: Mencapai batas warn (${warningCount}/${maxWarnings})` });
                wasBanned = true;
            } catch (error: any) {
                console.error('[WARN] Error auto-banning user:', error);
            }
        }

        // Create success embed
        const embed = new EmbedBuilder()
            .setTitle(wasBanned ? '🔨 User Di-ban Otomatis' : '⚠️ User Telah Di-warn')
            .setDescription(
                wasBanned 
                    ? `**${targetUser.tag}** telah di-ban otomatis karena mencapai batas warn (${warningCount}/${maxWarnings})`
                    : `**${targetUser.tag}** telah menerima peringatan`
            )
            .setColor(wasBanned ? 0xFF0000 : 0xFFA500)
            .addFields(
                {
                    name: '👤 User',
                    value: `${targetUser.tag} (${targetUser.id})`,
                    inline: true
                },
                {
                    name: '👮 Moderator',
                    value: `${moderator.tag}`,
                    inline: true
                },
                {
                    name: '⚠️ Total Warn',
                    value: `${warningCount}/${maxWarnings}`,
                    inline: true
                },
                {
                    name: '📝 Alasan',
                    value: reason,
                    inline: false
                }
            )
            .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
            .setTimestamp()
            .setFooter({
                text: getFooterText(`Diminta oleh ${moderator.tag}`),
                iconURL: moderator.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });

        // Try to send DM to the warned user
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle(wasBanned ? '🔨 Anda Di-ban' : '⚠️ Anda Menerima Peringatan')
                .setDescription(
                    wasBanned
                        ? `Anda telah di-ban dari **${guild.name}** karena mencapai batas warn (${warningCount}/${maxWarnings})`
                        : `Anda telah menerima peringatan di **${guild.name}**`
                )
                .setColor(wasBanned ? 0xFF0000 : 0xFFA500)
                .addFields({
                    name: '📝 Alasan',
                    value: reason,
                    inline: false
                })
                .addFields({
                    name: '⚠️ Total Warn',
                    value: `${warningCount}/${maxWarnings}`,
                    inline: true
                })
                .addFields({
                    name: '👮 Moderator',
                    value: `${moderator.tag}`,
                    inline: true
                })
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                // User has DMs disabled, ignore
            });
        } catch {
            // Failed to send DM, ignore
        }
    },
};

