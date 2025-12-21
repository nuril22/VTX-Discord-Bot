import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Client,
    MessageFlags,
} from 'discord.js';
import { deleteAISession, getAISession } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'ai',
    data: new SlashCommandBuilder()
        .setName('ai-delete')
        .setDescription('Hapus session AI chat Anda'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        if (!guild) {
            return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di server!' });
        }

        // Get user's AI session
        const userSessions = await Promise.all(
            Array.from(guild.channels.cache.values())
                .filter(c => c.isTextBased())
                .map(async (channel) => {
                    const session = getAISession(channel.id);
                    if (session && session.creator_id === interaction.user.id) {
                        return { channel, session };
                    }
                    return null;
                })
        );

        const activeSession = userSessions.find(s => s !== null);

        if (!activeSession) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak memiliki AI session yang aktif!')
                .setColor(0xFF0000)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        try {
            // Delete session from database
            deleteAISession(activeSession.channel.id);

            // Delete channel
            if (activeSession.channel.isTextBased() && 'deletable' in activeSession.channel && activeSession.channel.deletable) {
                await activeSession.channel.delete();
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Session Dihapus')
                    .setDescription('Session AI telah dihapus dari database.')
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Session Dihapus')
                .setDescription('Session AI Anda telah dihapus dan channel telah dihapus.')
                .setColor(0x00FF00)
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [successEmbed] });
            } catch (replyError: any) {
                // Interaction might be expired or deleted
                if (replyError.code === 10008 || replyError.code === 10062) {
                    // Interaction expired, don't try followup as it will also fail
                    console.warn('[AI] Interaction expired, skipping reply');
                } else {
                    // Other error, log it
                    console.error('[AI] Failed to edit reply:', replyError);
                }
            }
        } catch (error: any) {
            console.error('[AI] Error deleting AI session:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Gagal menghapus session: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError: any) {
                // Interaction might be expired or deleted
                if (replyError.code === 10008 || replyError.code === 10062) {
                    // Interaction expired, don't try followup as it will also fail
                    console.warn('[AI] Interaction expired, skipping error reply');
                } else {
                    // Other error, log it
                    console.error('[AI] Failed to edit error reply:', replyError);
                }
            }
        }
    },
};
