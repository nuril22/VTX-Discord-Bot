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
import { getMiningUser, rebirthMiningUser, isMiningUserRegistered, getMiningInventory } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('rebirth')
        .setDescription('Rebirth untuk reset level dan mendapatkan bonus permanen'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: 64 }); // Ephemeral

        const userId = interaction.user.id;

        // Check if user is registered
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa rebirth!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const userData = getMiningUser(userId);
        if (!userData) {
            throw new Error('Failed to get mining user data');
        }

        const { level, rebirth_count, mining_speed_bonus, sell_bonus } = userData;

        // Check minimum level requirement (level 10 minimum)
        if (level < 10) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Level Tidak Cukup')
                .setDescription(`Anda harus mencapai minimal level 10 untuk bisa rebirth!`)
                .addFields({
                    name: '📊 Level Anda',
                    value: `Level ${level}`,
                    inline: false
                })
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if user has items in inventory (warn them)
        const inventory = getMiningInventory(userId);
        const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);

        // Calculate new bonuses
        const newRebirthCount = rebirth_count + 1;
        const newMiningSpeedBonus = newRebirthCount * 5;
        const newSellBonus = newRebirthCount * 5;

        // Show confirmation prompt
        const embed = new EmbedBuilder()
            .setTitle('🔄 Konfirmasi Rebirth')
            .setDescription(
                `**Rebirth akan mereset level Anda ke 1, tapi memberikan bonus permanen!**\n\n` +
                `**⚠️ PERINGATAN:**\n` +
                `• Level akan direset ke 1\n` +
                `• XP akan direset ke 0\n` +
                `• Pickaxe dan Backpack akan direset ke default\n` +
                `${totalItems > 0 ? `• **Inventory Anda akan tetap ada** (${totalItems} items)\n` : ''}\n` +
                `**✨ Bonus yang Didapat:**\n` +
                `• Mining Speed: +${newMiningSpeedBonus}% (sebelumnya +${mining_speed_bonus}%)\n` +
                `• Sell Bonus: +${newSellBonus}% (sebelumnya +${sell_bonus}%)\n` +
                `• Rebirth Count: ${newRebirthCount}x\n\n` +
                `**Apakah Anda yakin ingin rebirth?**`
            )
            .setColor(0x9B59B6)
            .addFields(
                {
                    name: '📊 Level Saat Ini',
                    value: `Level ${level}`,
                    inline: true
                },
                {
                    name: '🔄 Rebirth Saat Ini',
                    value: `${rebirth_count}x`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Rebirth tidak bisa dibatalkan setelah dikonfirmasi!`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        const confirmButton = new ButtonBuilder()
            .setCustomId('rebirth_confirm')
            .setLabel('Ya, Rebirth Sekarang')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄');

        const cancelButton = new ButtonBuilder()
            .setCustomId('rebirth_cancel')
            .setLabel('Batal')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(confirmButton, cancelButton);

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [row] 
        });

        // Create collector for button interaction
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i: ButtonInteraction) => 
                i.user.id === interaction.user.id && 
                (i.customId === 'rebirth_confirm' || i.customId === 'rebirth_cancel'),
            time: 30000 // 30 seconds
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            if (i.customId === 'rebirth_confirm') {
                try {
                    // Perform rebirth
                    const rebirthResult = rebirthMiningUser(userId);
                    
                    const successEmbed = new EmbedBuilder()
                        .setTitle('🔄 Rebirth Berhasil!')
                        .setDescription(
                            `**Selamat! Anda telah melakukan rebirth!** ✨\n\n` +
                            `**Status Baru:**\n` +
                            `• Level: 1 (dari ${level})\n` +
                            `• XP: 0\n` +
                            `• Pickaxe: Pickaxe Kayu (default)\n` +
                            `• Backpack: Backpack Dasar (default)\n` +
                            `${totalItems > 0 ? `• Inventory: ${totalItems} items (tetap ada)\n` : ''}\n` +
                            `**Bonus Permanen:**\n` +
                            `• Mining Speed: +${rebirthResult.mining_speed_bonus}%\n` +
                            `• Sell Bonus: +${rebirthResult.sell_bonus}%\n` +
                            `• Rebirth Count: ${rebirthResult.rebirth_count}x`
                        )
                        .setColor(0x00FF00)
                        .addFields({
                            name: '💡 Tips',
                            value: 'Gunakan `/mining` untuk mulai mining lagi dengan bonus speed yang lebih cepat!',
                            inline: false
                        })
                        .setTimestamp()
                        .setFooter({ 
                            text: getFooterText(`Selamat mining dengan bonus baru! ⛏️`), 
                            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                        });

                    await i.update({ embeds: [successEmbed], components: [] });
                } catch (error) {
                    console.error('[REBIRTH] Error:', error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('Terjadi kesalahan saat melakukan rebirth. Silakan coba lagi.')
                        .setColor(0xFF0000)
                        .setTimestamp();

                    await i.update({ embeds: [errorEmbed], components: [] });
                }
            } else if (i.customId === 'rebirth_cancel') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Rebirth Dibatalkan')
                    .setDescription('Anda membatalkan rebirth. Anda bisa melakukan rebirth kapan saja dengan `/rebirth`.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Waktu Habis')
                    .setDescription('Waktu untuk konfirmasi rebirth telah habis. Gunakan `/rebirth` lagi untuk mencoba.')
                    .setColor(0xFFA500)
                    .setTimestamp();

                try {
                    await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
                } catch (error) {
                    // Message might have been deleted
                    console.error('Error updating timeout message:', error);
                }
            }
        });
    },
};
