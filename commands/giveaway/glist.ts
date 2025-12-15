import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits
} from 'discord.js';
import { getGiveaway, getGiveawayParticipants } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'giveaway',
    data: new SlashCommandBuilder()
        .setName('glist')
        .setDescription('Lihat daftar peserta giveaway')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID giveaway yang ingin dilihat pesertanya')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: 64 }); // Ephemeral

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

        // Get participants
        const participants = getGiveawayParticipants(giveawayId);

        // Format participants list
        let participantsList = '';
        if (participants.length === 0) {
            participantsList = 'Tidak ada peserta.';
        } else {
            // Try to fetch user info for better display
            const participantMentions: string[] = [];
            for (const userId of participants) {
                try {
                    const user = await guild.members.fetch(userId).catch(() => null);
                    if (user) {
                        participantMentions.push(`${participantMentions.length + 1}. ${user.user.tag} (<@${userId}>)`);
                    } else {
                        participantMentions.push(`${participantMentions.length + 1}. <@${userId}>`);
                    }
                } catch {
                    participantMentions.push(`${participantMentions.length + 1}. <@${userId}>`);
                }
            }
            participantsList = participantMentions.join('\n');
            
            // Discord embed field limit is 1024 characters
            if (participantsList.length > 1024) {
                participantsList = participantsList.substring(0, 1021) + '...';
            }
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('📋 Daftar Peserta Giveaway')
            .setDescription(
                `**ID Giveaway:** \`${giveawayId}\`\n` +
                `**Total Peserta:** ${participants.length} ${participants.length === 1 ? 'orang' : 'orang'}\n` +
                `**Pemenang:** ${giveaway.winner_count} ${giveaway.winner_count === 1 ? 'orang' : 'orang'}\n` +
                `**Status:** ${giveaway.ended === 1 ? '✅ Berakhir' : '⏳ Berlangsung'}`
            )
            .addFields({
                name: '👥 Peserta',
                value: participantsList || 'Tidak ada peserta.',
                inline: false
            })
            .setColor(0x0099FF)
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        await interaction.editReply({ embeds: [embed] });
    },
};

