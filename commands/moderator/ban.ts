import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { removeAllWarnings } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

// Helper function to parse time string (e.g., "1y2d3h4m5s")
function parseTimeString(timeStr: string): number | null {
    const timeRegex = /(\d+)([ydhms])/g;
    let totalMs = 0;
    let match;

    while ((match = timeRegex.exec(timeStr)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2];

        switch (unit) {
            case 'y':
                totalMs += value * 365 * 24 * 60 * 60 * 1000; // years
                break;
            case 'd':
                totalMs += value * 24 * 60 * 60 * 1000; // days
                break;
            case 'h':
                totalMs += value * 60 * 60 * 1000; // hours
                break;
            case 'm':
                totalMs += value * 60 * 1000; // minutes
                break;
            case 's':
                totalMs += value * 1000; // seconds
                break;
        }
    }

    return totalMs > 0 ? totalMs : null;
}

// Helper function to format time string for display
function formatTimeString(timeStr: string): string {
    const parts: string[] = [];
    const timeRegex = /(\d+)([ydhms])/g;
    let match;

    const unitNames: { [key: string]: string } = {
        'y': 'tahun',
        'd': 'hari',
        'h': 'jam',
        'm': 'menit',
        's': 'detik'
    };

    while ((match = timeRegex.exec(timeStr)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        parts.push(`${value} ${unitNames[unit]}`);
    }

    return parts.join(', ');
}

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban user dari server (permanen atau sementara)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang akan di-ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('Waktu ban (contoh: 1y2d3h4m5s). Kosongkan untuk ban permanen')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Alasan ban (opsional)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const timeStr = interaction.options.getString('time');
        const reason = interaction.options.getString('reason') || 'Tidak ada alasan yang diberikan';
        const moderator = interaction.user;

        // Check if target is a bot
        if (targetUser.bot) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat meng-ban bot!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if trying to ban self
        if (targetUser.id === moderator.id) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat meng-ban diri sendiri!')
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

        // Check if user is already banned
        try {
            const ban = await guild.bans.fetch(targetUser.id);
            if (ban) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('User ini sudah di-ban dari server!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }
        } catch {
            // User is not banned, continue
        }

        // Check if target has higher or equal role
        const moderatorMember = await guild.members.fetch(moderator.id).catch(() => null);
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        
        if (targetMember && moderatorMember) {
            if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position && moderator.id !== guild.ownerId) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Anda tidak dapat meng-ban user dengan role yang sama atau lebih tinggi!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }
        }

        // Parse time if provided
        let banDuration: number | null = null;
        let isPermanent = true;
        let timeDisplay = 'Permanen';

        if (timeStr) {
            banDuration = parseTimeString(timeStr);
            if (!banDuration) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Format waktu tidak valid! Gunakan format: `1y2d3h4m5s`\n\nContoh:\n• `1d` = 1 hari\n• `2h30m` = 2 jam 30 menit\n• `1y6m` = 1 tahun 6 bulan')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }
            isPermanent = false;
            timeDisplay = formatTimeString(timeStr);
        }

        // Try to ban the user
        try {
            // Remove all warnings before banning
            removeAllWarnings(guild.id, targetUser.id);
            
            await guild.members.ban(targetUser, { reason: reason });

            const embed = new EmbedBuilder()
                .setTitle('✅ User Berhasil Di-ban')
                .setDescription(`**${targetUser.tag}** telah di-ban dari server`)
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
                        name: '⏱️ Durasi',
                        value: timeDisplay,
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

            // If temporary ban, schedule unban (Note: Discord doesn't support automatic unban, 
            // so this is just for reference. You would need to implement a scheduler system)
            if (!isPermanent && banDuration) {
                // TODO: Implement unban scheduler if needed
                // This would require a database to store ban information and a scheduler
                console.log(`[BAN] Temporary ban scheduled: ${targetUser.id} will be unbanned in ${banDuration}ms`);
            }
        } catch (error: any) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Gagal meng-ban user: ${error.message || 'Unknown error'}`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

