import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getLastWorkTime, setLastWorkTime, addUserBalance, addTransaction, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

const WORK_COOLDOWN = 60 * 1000; // 1 menit dalam milliseconds
const MIN_REWARD = 10;
const MAX_REWARD = 100;

function getRandomReward(): number {
    return Math.floor(Math.random() * (MAX_REWARD - MIN_REWARD + 1)) + MIN_REWARD;
}

export default {
    category: 'economy',
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Bekerja untuk mendapatkan uang (cooldown 1 menit)'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered
        if (!isUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription(
                    `Anda belum terdaftar di sistem economy!\n\n` +
                    `Gunakan \`/register\` untuk mendaftar terlebih dahulu sebelum bisa bekerja.`
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const now = Date.now();
        const lastWork = getLastWorkTime(userId);
        const timeLeft = (lastWork + WORK_COOLDOWN) - now;

        if (timeLeft > 0) {
            const secondsLeft = Math.ceil(timeLeft / 1000);
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;

            const embed = new EmbedBuilder()
                .setTitle('⏰ Cooldown Aktif')
                .setDescription(`**Anda harus menunggu sebelum bekerja lagi!** ⏳`)
                .setColor(0xFF9900)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '⏱️ Waktu Tersisa',
                    value: `\`\`\`${minutes} menit ${seconds} detik\`\`\``,
                    inline: false
                })
                .addFields({
                    name: '💡 Tips',
                    value: `Sabar ya! Setelah cooldown selesai, Anda bisa bekerja lagi untuk mendapatkan 10-100 coins!`,
                    inline: false
                })
                .setTimestamp()
                .setFooter({ 
                    text: `Diminta oleh ${interaction.user.tag}`, 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // User can work
        const reward = getRandomReward();
        const newBalance = addUserBalance(userId, reward);
        setLastWorkTime(userId, now);
        addTransaction(userId, 'work', reward, 'Bekerja');

        const workMessages = [
            'Anda bekerja sebagai programmer dan mendapatkan bayaran! 💻',
            'Anda bekerja sebagai designer dan menghasilkan uang! 🎨',
            'Anda bekerja sebagai freelancer dan dibayar! 💼',
            'Anda bekerja paruh waktu dan mendapat gaji! 📝',
            'Anda bekerja keras dan mendapatkan reward! 💪'
        ];
        const randomMessage = workMessages[Math.floor(Math.random() * workMessages.length)];

        const embed = new EmbedBuilder()
            .setTitle('💼 Bekerja - Berhasil!')
            .setDescription(`**${randomMessage}**\n\nSelamat atas kerja keras Anda! 🎉`)
            .setColor(0x00FF00)
            .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
            .addFields(
                {
                    name: '💰 Reward',
                    value: `\`\`\`+${reward.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                },
                {
                    name: '💵 Balance Baru',
                    value: `\`\`\`${newBalance.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                },
                {
                    name: '⏰ Cooldown',
                    value: `\`\`\`1 menit\`\`\``,
                    inline: true
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
