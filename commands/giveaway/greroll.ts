import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { getGiveaway, endGiveaway, getGiveawayParticipants } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

// Select random winners from participants
function selectWinners(participants: string[], winnerCount: number): string[] {
    if (participants.length === 0) return [];
    
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(winnerCount, participants.length));
}

export default {
    category: 'giveaway',
    data: new SlashCommandBuilder()
        .setName('greroll')
        .setDescription('Acak ulang pemenang giveaway')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID giveaway yang akan di-acak ulang')
                .setRequired(true)
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

        const giveawayId = interaction.options.getString('id', true);

        // Get giveaway
        const giveaway = getGiveaway(giveawayId);
        if (!giveaway) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Giveaway dengan ID \`${giveawayId}\` tidak ditemukan!`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if giveaway is from this guild
        if (giveaway.guild_id !== guild.id) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Giveaway ini bukan dari server ini!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if giveaway has ended
        if (giveaway.ended === 0) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Giveaway ini belum berakhir! Gunakan `/gend` untuk mengakhiri giveaway terlebih dahulu.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if giveaway can still be rerolled (must be less than 1 day old)
        const { canRerollGiveaway } = await import('../../database/db.js');
        if (!canRerollGiveaway(giveawayId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Giveaway ini sudah lebih dari 1 hari sejak berakhir dan tidak dapat di-acak ulang lagi. Data giveaway telah dihapus.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get participants
        const participants = getGiveawayParticipants(giveawayId);

        if (participants.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Tidak ada peserta dalam giveaway ini!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Select new winners
        const winners = selectWinners(participants, giveaway.winner_count);

        // Update winners in database
        endGiveaway(giveawayId, winners);

        // Try to update the original message
        try {
            const channel = await guild.channels.fetch(giveaway.channel_id);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                
                if (message) {
                    // Create rerolled embed
                    const rerolledEmbed = new EmbedBuilder()
                        .setTitle('🎉 Giveaway - Pemenang Baru!')
                        .setDescription(
                            (giveaway.request ? `**Request:** ${giveaway.request}\n\n` : '') +
                            `**Pemenang:** ${giveaway.winner_count} ${giveaway.winner_count === 1 ? 'orang' : 'orang'}\n` +
                            (giveaway.role_requirement ? `**Role Diperlukan:** <@&${giveaway.role_requirement}>\n` : '') +
                            `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n\n` +
                            (winners.length > 0 
                                ? `**🎊 Pemenang Baru:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                                : '**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)'
                            )
                        )
                        .setColor(0xFFA500)
                        .setTimestamp()
                        .setFooter({ 
                            text: getFooterText(`Di-acak ulang oleh ${interaction.user.tag}`), 
                            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                        });

                    await message.edit({ embeds: [rerolledEmbed] });

                    // Mention creator and send announcement
                    try {
                        const creator = await guild.members.fetch(giveaway.creator_id).catch(() => null);
                        if (creator) {
                            const announcementText = winners.length > 0
                                ? `🎉 **Pemenang Baru!** <@${giveaway.creator_id}>\n\n**🎊 Pemenang Baru:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                                : `🎉 **Pemenang Di-acak Ulang!** <@${giveaway.creator_id}>\n\n**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)`;
                            
                            await channel.send({ content: announcementText });
                        }
                    } catch (error) {
                        console.error('[GREROLL] Error sending announcement:', error);
                    }
                }
            }
        } catch (error) {
            console.error('[GREROLL] Error updating giveaway message:', error);
        }

        // Send DM to new winners
        if (winners.length > 0) {
            for (const winnerId of winners) {
                try {
                    const winner = await client.users.fetch(winnerId).catch(() => null);
                    if (winner) {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🎉 Selamat! Anda Menang Giveaway!')
                            .setDescription(
                                `Anda telah memenangkan giveaway di **${guild.name}** (hasil acak ulang)!\n\n` +
                                `**Giveaway ID:** \`${giveawayId}\`\n` +
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
                    console.error(`[GREROLL] Error sending DM to winner ${winnerId}:`, error);
                }
            }
        }

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Pemenang Di-acak Ulang!')
            .setDescription(
                `Pemenang giveaway berhasil di-acak ulang!\n\n` +
                `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n` +
                (winners.length > 0 
                    ? `**🎊 Pemenang Baru:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                    : '**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)'
                )
            )
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
    },
};

