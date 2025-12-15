import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getUserBalance, subtractUserBalance, addUserBalance, addTransaction, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'economy',
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Transfer uang ke user lain')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin Anda kirim uang')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Jumlah uang yang ingin dikirim')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        // Check if sender is registered
        if (!isUserRegistered(senderId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription(
                    `Anda belum terdaftar di sistem economy!\n\n` +
                    `Gunakan \`/register\` untuk mendaftar terlebih dahulu sebelum bisa melakukan transfer.`
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if receiver is registered
        if (!isUserRegistered(receiver.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ User Belum Terdaftar')
                .setDescription(
                    `${receiver.tag} belum terdaftar di sistem economy!\n\n` +
                    `User tersebut harus mendaftar menggunakan \`/register\` terlebih dahulu sebelum bisa menerima transfer.`
                )
                .setColor(0xFF0000)
                .setThumbnail(receiver.displayAvatarURL({ forceStatic: false }) || null)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if trying to pay self
        if (receiver.id === senderId) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat mengirim uang ke diri sendiri!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if receiver is a bot
        if (receiver.bot) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak dapat mengirim uang ke bot!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check sender balance
        const senderBalance = getUserBalance(senderId);
        
        if (senderBalance < amount) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Saldo Tidak Cukup')
                .setDescription(`**Anda tidak memiliki cukup uang untuk melakukan transfer ini!**`)
                .setColor(0xFF0000)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '💵 Saldo Anda',
                    value: `\`\`\`${senderBalance.toLocaleString('id-ID')} coins\`\`\``,
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
                .setTimestamp()
                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Perform transfer
        const newSenderBalance = subtractUserBalance(senderId, amount);
        const newReceiverBalance = addUserBalance(receiver.id, amount);

        // Add transactions
        addTransaction(senderId, 'pay_sent', -amount, `Mengirim ke ${receiver.tag}`);
        addTransaction(receiver.id, 'pay_received', amount, `Menerima dari ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
            .setTitle('✅ Transfer Berhasil!')
            .setDescription(`**Transfer Anda berhasil dikirim!** 🎉\n\n${receiver.tag} telah menerima uang dari Anda.`)
            .setColor(0x00FF00)
            .setThumbnail(receiver.displayAvatarURL({ forceStatic: false }) || null)
            .addFields(
                {
                    name: '💵 Jumlah Transfer',
                    value: `\`\`\`${amount.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                },
                {
                    name: '💰 Saldo Anda',
                    value: `\`\`\`${newSenderBalance.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                },
                {
                    name: '👤 Penerima',
                    value: `${receiver.tag}`,
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
