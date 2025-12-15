import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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
        .setName('gend')
        .setDescription('Akhiri giveaway dan pilih pemenang')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID giveaway yang akan diakhiri')
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

        // Check if already ended
        if (giveaway.ended === 1) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Giveaway ini sudah berakhir!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get participants
        const participants = getGiveawayParticipants(giveawayId);

        // Select winners
        const winners = selectWinners(participants, giveaway.winner_count);

        // End giveaway in database
        endGiveaway(giveawayId, winners);

        // Try to update the original message
        try {
            const channel = await guild.channels.fetch(giveaway.channel_id);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                
                if (message) {
                    // Disable button
                    const disabledButton = new ButtonBuilder()
                        .setCustomId(`giveaway_join_${giveawayId}`)
                        .setLabel('Giveaway Berakhir')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🎁')
                        .setDisabled(true);

                    const row = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(disabledButton);

                    // Create ended embed
                    const endedEmbed = new EmbedBuilder()
                        .setTitle('🎉 Giveaway Berakhir!')
                        .setDescription(
                            (giveaway.request ? `**Request:** ${giveaway.request}\n\n` : '') +
                            `**Pemenang:** ${giveaway.winner_count} ${giveaway.winner_count === 1 ? 'orang' : 'orang'}\n` +
                            (giveaway.role_requirement ? `**Role Diperlukan:** <@&${giveaway.role_requirement}>\n` : '') +
                            `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n\n` +
                            (winners.length > 0 
                                ? `**🎊 Pemenang:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                                : '**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)'
                            )
                        )
                        .setColor(0xFFA500)
                        .setTimestamp()
                        .setFooter({ 
                            text: getFooterText(`Diakhiri oleh ${interaction.user.tag}`), 
                            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                        });

                    await message.edit({ embeds: [endedEmbed], components: [row] });

                    // Mention creator and send announcement
                    try {
                        const creator = await guild.members.fetch(giveaway.creator_id).catch(() => null);
                        if (creator) {
                            const announcementText = winners.length > 0
                                ? `🎉 **Giveaway Berakhir!** <@${giveaway.creator_id}>\n\n**🎊 Pemenang:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                                : `🎉 **Giveaway Berakhir!** <@${giveaway.creator_id}>\n\n**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)`;
                            
                            await channel.send({ content: announcementText });
                        }
                    } catch (error) {
                        console.error('[GEND] Error sending announcement:', error);
                    }
                }
            }
        } catch (error) {
            console.error('[GEND] Error updating giveaway message:', error);
        }

        // Send DM to winners
        if (winners.length > 0) {
            for (const winnerId of winners) {
                try {
                    const winner = await client.users.fetch(winnerId).catch(() => null);
                    if (winner) {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🎉 Selamat! Anda Menang Giveaway!')
                            .setDescription(
                                `Anda telah memenangkan giveaway di **${guild.name}**!\n\n` +
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
                    console.error(`[GEND] Error sending DM to winner ${winnerId}:`, error);
                }
            }
        }

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Giveaway Diakhiri!')
            .setDescription(
                `Giveaway berhasil diakhiri!\n\n` +
                `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n` +
                (winners.length > 0 
                    ? `**🎊 Pemenang:**\n${winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')}`
                    : '**Tidak ada pemenang** (tidak ada peserta yang memenuhi syarat)'
                )
            )
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
    },
};

