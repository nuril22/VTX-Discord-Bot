import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { removeAllWarnings } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick user dari server')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang akan di-kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Alasan kick (opsional)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'Tidak ada alasan yang diberikan';
        const moderator = interaction.user;

        // Check if target is a bot
        if (targetUser.bot) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat meng-kick bot!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if trying to kick self
        if (targetUser.id === moderator.id) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat meng-kick diri sendiri!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get member from guild
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

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('User tidak ditemukan di server ini!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if target has higher or equal role
        const moderatorMember = await guild.members.fetch(moderator.id);
        if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position && moderator.id !== guild.ownerId) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat meng-kick user dengan role yang sama atau lebih tinggi!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Try to kick the user
        try {
            // Remove all warnings before kicking
            removeAllWarnings(guild.id, targetUser.id);
            
            await targetMember.kick(reason);

            const embed = new EmbedBuilder()
                .setTitle('✅ User Berhasil Di-kick')
                .setDescription(`**${targetUser.tag}** telah di-kick dari server`)
                .setColor(0x00FF00)
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
        } catch (error: any) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Gagal meng-kick user: ${error.message || 'Unknown error'}`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

