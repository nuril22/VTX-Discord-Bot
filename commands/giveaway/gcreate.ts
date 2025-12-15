import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    time,
    TimestampStyles
} from 'discord.js';
import { createGiveaway } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';
import { randomBytes } from 'crypto';

// Parse time string (e.g., "1d2h30m" = 1 day, 2 hours, 30 minutes)
function parseTime(timeStr: string): number | null {
    const timeRegex = /(\d+)([ydhms])/g;
    let totalSeconds = 0;
    let match;

    while ((match = timeRegex.exec(timeStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'y':
                totalSeconds += value * 365 * 24 * 60 * 60;
                break;
            case 'd':
                totalSeconds += value * 24 * 60 * 60;
                break;
            case 'h':
                totalSeconds += value * 60 * 60;
                break;
            case 'm':
                totalSeconds += value * 60;
                break;
            case 's':
                totalSeconds += value;
                break;
        }
    }

    return totalSeconds > 0 ? totalSeconds : null;
}

// Format time string for display
function formatTime(seconds: number): string {
    const years = Math.floor(seconds / (365 * 24 * 60 * 60));
    const days = Math.floor((seconds % (365 * 24 * 60 * 60)) / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (years > 0) parts.push(`${years}y`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

export default {
    category: 'giveaway',
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Buat giveaway baru')
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('Durasi giveaway (format: angka+unit, contoh: 1d, 2h30m, 5h, 30m)')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('winner')
                .setDescription('Jumlah pemenang')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(50)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Role yang boleh mengikuti giveaway (opsional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('request')
                .setDescription('Request khusus untuk giveaway (opsional)')
                .setRequired(false)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel tempat giveaway akan diposting (opsional, default: channel saat ini)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

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

        const timeStr = interaction.options.getString('time', true);
        const winnerCount = interaction.options.getInteger('winner', true);
        const roleRequirement = interaction.options.getRole('role');
        const request = interaction.options.getString('request');
        const targetChannel = interaction.options.getChannel('channel');

        // Parse time
        const timeInSeconds = parseTime(timeStr);
        if (!timeInSeconds) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(
                    'Format waktu tidak valid!\n\n' +
                    '**Format yang benar:**\n' +
                    '• `y` = tahun\n' +
                    '• `d` = hari\n' +
                    '• `h` = jam\n' +
                    '• `m` = menit\n' +
                    '• `s` = detik\n\n' +
                    '**Contoh:**\n' +
                    '• `1d2h30m` = 1 hari, 2 jam, 30 menit\n' +
                    '• `5h` = 5 jam\n' +
                    '• `2d` = 2 hari\n' +
                    '• `30m` = 30 menit'
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Minimum time is 1 minute
        if (timeInSeconds < 60) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Durasi giveaway minimal 1 menit!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Calculate end time
        const endTime = Math.floor(Date.now() / 1000) + timeInSeconds;
        const endTimeDate = new Date(endTime * 1000);

        // Generate unique ID for giveaway
        const giveawayId = randomBytes(8).toString('hex');

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Baru!')
            .setDescription(
                (request ? `**Request:** ${request}\n\n` : '') +
                `**Durasi:** ${formatTime(timeInSeconds)}\n` +
                `**Pemenang:** ${winnerCount} ${winnerCount === 1 ? 'orang' : 'orang'}\n` +
                (roleRequirement ? `**Role Diperlukan:** <@&${roleRequirement.id}>\n` : '') +
                `**Berakhir:** ${time(endTime, TimestampStyles.RelativeTime)} (${time(endTime, TimestampStyles.ShortDateTime)})\n\n` +
                `Klik tombol di bawah untuk ikut giveaway!`
            )
            .setColor(0x00FF00)
            .setTimestamp(endTimeDate)
            .setFooter({ 
                text: getFooterText(`Dibuat oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        // Create button
        const joinButton = new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveawayId}`)
            .setLabel('Ikut Giveaway')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎁');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(joinButton);

        // Determine target channel
        let channel = interaction.channel;
        if (targetChannel) {
            if (!targetChannel.isTextBased()) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Channel yang dipilih bukan channel teks!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            channel = targetChannel;
        }

        if (!channel) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Tidak dapat menemukan channel untuk mengirim giveaway!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        // Send message
        const message = await channel.send({ 
            embeds: [embed], 
            components: [row] 
        });

        if (!message) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Gagal mengirim pesan giveaway!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        // Save to database
        createGiveaway(
            giveawayId,
            guild.id,
            message.channel.id,
            message.id,
            interaction.user.id,
            'Giveaway',
            request || '',
            endTime,
            winnerCount,
            roleRequirement?.id || null,
            request || null
        );

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Giveaway Dibuat!')
            .setDescription(
                `Giveaway berhasil dibuat!\n\n` +
                `**ID Giveaway:** \`${giveawayId}\`\n` +
                `**Berakhir:** ${time(endTime, TimestampStyles.RelativeTime)} (${time(endTime, TimestampStyles.ShortDateTime)})\n\n` +
                `Gunakan \`/gend ${giveawayId}\` untuk mengakhiri giveaway lebih awal.`
            )
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
    },
};

