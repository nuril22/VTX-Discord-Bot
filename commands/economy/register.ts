import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { isUserRegistered, registerUser, getUserBalance, addUserBalance, addTransaction } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'economy',
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Daftar ke sistem economy bot'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: 64 }); // 64 = Ephemeral

        const userId = interaction.user.id;

        // Check if already registered
        if (isUserRegistered(userId)) {
            const balance = getUserBalance(userId);
            const embed = new EmbedBuilder()
                .setTitle('✅ Sudah Terdaftar')
                .setDescription(`Anda sudah terdaftar di sistem economy!`)
                .setColor(0x00FF00)
                .addFields({
                    name: '💵 Saldo Anda',
                    value: `\`\`\`${balance.toLocaleString('id-ID')} coins\`\`\``,
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Show registration prompt
        const embed = new EmbedBuilder()
            .setTitle('📝 Pendaftaran Sistem Economy')
            .setDescription(
                `**Selamat datang di sistem economy bot!** 🎉\n\n` +
                `Dengan mendaftar, Anda akan:\n` +
                `• Mendapatkan akses ke semua fitur economy\n` +
                `• Bisa bekerja untuk mendapatkan uang\n` +
                `• Bisa bertransaksi dengan user lain\n` +
                `• Bisa bermain permainan gambling\n\n` +
                `**Klik tombol di bawah untuk mendaftar!**`
            )
            .setColor(0x5865F2)
            .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        const acceptButton = new ButtonBuilder()
            .setCustomId('register_accept')
            .setLabel('Terima & Daftar')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const cancelButton = new ButtonBuilder()
            .setCustomId('register_cancel')
            .setLabel('Batal')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(acceptButton, cancelButton);

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [row] 
        });

        // Create collector for button interaction
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i: ButtonInteraction) => 
                i.user.id === interaction.user.id && 
                (i.customId === 'register_accept' || i.customId === 'register_cancel'),
            time: 30000 // 30 seconds
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            if (i.customId === 'register_accept') {
                // Register user
                try {
                    // Check if this is a new registration (before registering)
                    const wasRegistered = isUserRegistered(userId);
                    
                    // Register the user
                    registerUser(userId);
                    
                    // Give 5000 coins bonus ONLY for truly new users
                    let bonusGiven = false;
                    if (!wasRegistered) {
                        addUserBalance(userId, 5000, true); // Skip registration check for initial bonus
                        addTransaction(userId, 'register_bonus', 5000, 'Bonus selamat datang untuk user baru');
                        bonusGiven = true;
                    }
                    
                    const balance = getUserBalance(userId);
                    
                    const successEmbed = new EmbedBuilder()
                        .setTitle('🎉 Pendaftaran Berhasil!')
                        .setDescription(
                            `**Selamat!** Anda telah terdaftar di sistem economy bot!\n\n` +
                            (bonusGiven ? `🎁 **Bonus Selamat Datang: +5,000 coins!**\nAnda mendapat bonus untuk user baru!\n\n` : '') +
                            `Mulai sekarang Anda bisa menggunakan semua fitur economy:\n` +
                            `• \`/work\` - Bekerja untuk mendapatkan uang\n` +
                            `• \`/balance\` - Lihat saldo Anda\n` +
                            `• \`/pay\` - Transfer uang ke user lain\n` +
                            `• \`/coinflip\` & \`/slot\` - Bermain gambling\n\n` +
                            `**Selamat menikmati!** 🎊`
                        )
                        .setColor(0x00FF00)
                        .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || undefined)
                        .addFields({
                            name: '💵 Saldo Anda',
                            value: `\`\`\`${balance.toLocaleString('id-ID')} coins\`\`\``,
                            inline: false
                        })
                        .setTimestamp();

                    await i.update({ embeds: [successEmbed], components: [] });
                } catch (error) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('Terjadi kesalahan saat mendaftar. Silakan coba lagi.')
                        .setColor(0xFF0000)
                        .setTimestamp();

                    await i.update({ embeds: [errorEmbed], components: [] });
                }
            } else if (i.customId === 'register_cancel') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Pendaftaran Dibatalkan')
                    .setDescription('Pendaftaran telah dibatalkan. Anda bisa menggunakan `/register` lagi kapan saja.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async () => {
            try {
                // Disable buttons when collector ends
                acceptButton.setDisabled(true);
                cancelButton.setDisabled(true);
                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(acceptButton, cancelButton);
                
                await interaction.editReply({ components: [disabledRow] });
            } catch (error) {
                // Message might have been deleted or already updated
            }
        });
    },
};
