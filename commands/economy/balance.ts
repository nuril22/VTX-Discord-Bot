import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getUserBalance, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'economy',
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Lihat saldo uang Anda atau user lain')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin dilihat saldonya')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const isSelf = targetUser.id === interaction.user.id;

        // Check if target user is registered
        if (!isUserRegistered(targetUser.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ User Belum Terdaftar')
                .setDescription(
                    isSelf 
                        ? `Anda belum terdaftar di sistem economy!\n\nGunakan \`/register\` untuk mendaftar terlebih dahulu.`
                        : `${targetUser.tag} belum terdaftar di sistem economy.`
                )
                .setColor(0xFF0000)
                .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const balance = getUserBalance(targetUser.id);

        // Calculate rank or stats if needed
        const balanceText = balance === 0 
            ? '💸 Belum memiliki uang\nGunakan `/work` untuk mulai bekerja!'
            : `💵 **${balance.toLocaleString('id-ID')} coins**`;

        const embed = new EmbedBuilder()
            .setTitle(`💰 ${isSelf ? 'Saldo Anda' : `Saldo ${targetUser.username}`}`)
            .setDescription(
                isSelf 
                    ? `**Halo ${interaction.user.username}!** 👋\n\nIni adalah saldo Anda saat ini:`
                    : `**Saldo ${targetUser.username}**\n\nBerikut adalah saldo user ini:`
            )
            .setColor(0x00FF00)
            .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
            .addFields({
                name: balance === 0 ? '💸 Status' : '💵 Balance',
                value: balanceText,
                inline: false
            })
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
