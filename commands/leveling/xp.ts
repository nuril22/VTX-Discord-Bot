import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getMiningUser, isMiningUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'leveling',
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Lihat XP dan level Anda atau user lain')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin dilihat XP dan levelnya')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const isSelf = targetUser.id === interaction.user.id;

        // Check if target user is registered
        if (!isMiningUserRegistered(targetUser.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ User Belum Terdaftar')
                .setDescription(
                    isSelf
                        ? `Anda belum terdaftar di sistem leveling!\n\nGunakan \`/rpg-register\` untuk mendaftar terlebih dahulu.`
                        : `${targetUser.tag} belum terdaftar di sistem leveling.`
                )
                .setColor(0xFF0000)
                .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }) || null)
                .setTimestamp()
                .setFooter({
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const userData = getMiningUser(targetUser.id);
        if (!userData) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Gagal mengambil data user.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const { level, xp } = userData;

        // Calculate required XP for current level and next level
        const requiredXPForCurrentLevel = level * 100;
        const requiredXPForNextLevel = (level + 1) * 100;
        const xpProgress = xp;
        const xpNeededForNextLevel = requiredXPForNextLevel - xpProgress;
        const xpPercentage = Math.floor((xpProgress / requiredXPForCurrentLevel) * 100);

        // Create progress bar
        const progressBarLength = 20;
        const filledLength = Math.floor((xpProgress / requiredXPForCurrentLevel) * progressBarLength);
        const emptyLength = progressBarLength - filledLength;
        const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Statistik Level & XP ${isSelf ? 'Anda' : targetUser.username}`)
            .setDescription(
                isSelf
                    ? `**Statistik level dan XP Anda**`
                    : `**Statistik level dan XP dari ${targetUser.tag}**`
            )
            .setColor(0x9B59B6)
            .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false, size: 256 }) || null)
            .addFields(
                {
                    name: '📈 Level',
                    value: `**${level}**`,
                    inline: true
                },
                {
                    name: '⭐ XP Saat Ini',
                    value: `**${xpProgress.toLocaleString('id-ID')}**`,
                    inline: true
                },
                {
                    name: '🎯 XP Diperlukan',
                    value: `**${xpNeededForNextLevel.toLocaleString('id-ID')}** XP untuk level ${level + 1}`,
                    inline: false
                },
                {
                    name: '📊 Progress ke Level Berikutnya',
                    value: `\`${progressBar}\` ${xpPercentage}%\n\n**${xpProgress.toLocaleString('id-ID')}** / **${requiredXPForCurrentLevel.toLocaleString('id-ID')}** XP`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
