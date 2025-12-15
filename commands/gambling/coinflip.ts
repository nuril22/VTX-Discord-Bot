import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getUserBalance, subtractUserBalance, addUserBalance, addTransaction, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'gambling',
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Lempar koin untuk bertaruh (head atau tail)')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Jumlah uang yang ingin dipertaruhkan')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option
                .setName('position')
                .setDescription('Pilih head atau tail')
                .setRequired(true)
                .addChoices(
                    { name: 'Head (Kepala)', value: 'head' },
                    { name: 'Tail (Ekor)', value: 'tail' }
                )
        )
        .addNumberOption(option =>
            option
                .setName('multiplier')
                .setDescription('Pilih multiplier (semakin besar multiplier, semakin kecil peluang menang)')
                .setRequired(false)
                .addChoices(
                    { name: '1.5x (Peluang: 67%)', value: 1.5 },
                    { name: '2.0x (Peluang: 50%) - Default', value: 2.0 },
                    { name: '3.0x (Peluang: 33%)', value: 3.0 },
                    { name: '5.0x (Peluang: 20%)', value: 5.0 }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered
        if (!isUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription(
                    `Anda belum terdaftar di sistem economy!\n\n` +
                    `Gunakan \`/register\` untuk mendaftar terlebih dahulu sebelum bisa bermain gambling.`
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const amount = interaction.options.getInteger('amount', true);
        const chosenPosition = interaction.options.getString('position', true);
        const multiplier = interaction.options.getNumber('multiplier') || 2.0;

        // Check balance
        const balance = getUserBalance(userId);
        
        if (balance < amount) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Saldo Tidak Cukup')
                .setDescription('**Anda tidak memiliki cukup uang untuk bertaruh!**')
                .setColor(0xFF0000)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '💵 Saldo Anda',
                    value: `\`\`\`${balance.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                })
                .addFields({
                    name: '💸 Yang Dibutuhkan',
                    value: `\`\`\`${amount.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                })
                .addFields({
                    name: '💡 Tips',
                    value: `Gunakan \`/work\` untuk mendapatkan uang lebih!`,
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Calculate win chance based on multiplier (lower multiplier = higher win chance)
        const winChance = 1 / multiplier; // 1.5x = 66.67%, 2x = 50%, 3x = 33.33%, 5x = 20%
        
        // Show loading embed with suspense
        const loadingEmbed = new EmbedBuilder()
            .setTitle('🪙 Koin Sedang Dilempar...')
            .setDescription('**Menunggu hasil lemparan koin...**\n\n⏳ `Sedang diproses...`')
            .setColor(0x5865F2)
            .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
            .addFields({
                name: '📊 Multiplier Dipilih',
                value: `\`\`\`${multiplier.toFixed(1)}x\`\`\``,
                inline: true
            })
            .addFields({
                name: '🎯 Peluang Menang',
                value: `\`\`\`${(winChance * 100).toFixed(1)}%\`\`\``,
                inline: true
            })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [loadingEmbed] });
        
        // Wait 2-3 seconds for suspense
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Determine result: use weighted random based on multiplier
        // If user wins (based on win chance), result matches their choice
        // Otherwise, result is the opposite
        const randomValue = Math.random();
        const userWins = randomValue < winChance;
        const result = userWins ? chosenPosition : (chosenPosition === 'head' ? 'tail' : 'head');
        const resultEmoji = result === 'head' ? '🪙' : '⭕';
        const resultText = result === 'head' ? 'Head (Kepala)' : 'Tail (Ekor)';

        // Check if won or lost (we already determined userWins, result matches choice if won)
        const won = userWins;
        
        if (won) {
            const winAmount = Math.floor(amount * multiplier);
            const profit = winAmount - amount;
            subtractUserBalance(userId, amount); // Subtract bet first
            const newBalance = addUserBalance(userId, winAmount); // Add winnings
            addTransaction(userId, 'coinflip_win', profit, `Menang ${multiplier.toFixed(1)}x - ${resultText}`);

            const embed = new EmbedBuilder()
                .setTitle(`🎉 Coinflip - MENANG! 🎉`)
                .setDescription(
                    `**Hasil: ${resultEmoji} ${resultText}**\n\n` +
                    `**Selamat!** Anda menebak dengan benar dan memenangkan taruhan! 🎊`
                )
                .setColor(0x00FF00)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields(
                    {
                        name: '💵 Taruhan',
                        value: `\`\`\`${amount.toLocaleString('id-ID')} coins\`\`\``,
                        inline: true
                    },
                    {
                        name: '🎁 Profit',
                        value: `\`\`\`+${profit.toLocaleString('id-ID')} coins\`\`\``,
                        inline: true
                    },
                    {
                        name: '💰 Saldo Baru',
                        value: `\`\`\`${newBalance.toLocaleString('id-ID')} coins\`\`\``,
                        inline: false
                    },
                    {
                        name: '📊 Multiplier',
                        value: `\`\`\`${multiplier.toFixed(1)}x\`\`\``,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await interaction.editReply({ embeds: [embed] });
        } else {
            subtractUserBalance(userId, amount);
            addTransaction(userId, 'coinflip_loss', -amount, `Kalah ${multiplier.toFixed(1)}x - Memilih ${chosenPosition === 'head' ? 'Head' : 'Tail'}, hasil ${resultText}`);
            const newBalance = getUserBalance(userId);

            const chosenText = chosenPosition === 'head' ? 'Head (Kepala)' : 'Tail (Ekor)';
            
            const embed = new EmbedBuilder()
                .setTitle(`😢 Coinflip - Kalah`)
                .setDescription(
                    `**Hasil: ${resultEmoji} ${resultText}**\n\n` +
                    `Anda memilih: **${chosenText}**\n` +
                    `Sayang sekali, Anda kalah! Coba lagi lain kali! 💪`
                )
                .setColor(0xFF0000)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields(
                    {
                        name: '💵 Taruhan',
                        value: `\`\`\`-${amount.toLocaleString('id-ID')} coins\`\`\``,
                        inline: true
                    },
                    {
                        name: '💰 Saldo Baru',
                        value: `\`\`\`${newBalance.toLocaleString('id-ID')} coins\`\`\``,
                        inline: true
                    },
                    {
                        name: '📊 Multiplier',
                        value: `\`\`\`${multiplier.toFixed(1)}x\`\`\``,
                        inline: true
                    },
                    {
                        name: '💡 Tips',
                        value: `Coba gunakan multiplier lebih rendah (1.5x) untuk peluang menang lebih besar!`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
