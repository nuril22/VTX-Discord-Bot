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
import { isMiningUserRegistered, registerMiningUser, getMiningUser, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('rpg-register')
        .setDescription('Daftar ke sistem RPG Mining'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: 64 }); // 64 = Ephemeral

        const userId = interaction.user.id;

        // Check if user is registered in economy system first
        if (!isUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar di Economy')
                .setDescription(
                    `Anda harus mendaftar di sistem economy terlebih dahulu sebelum bisa mendaftar ke sistem RPG Mining!\n\n` +
                    `Gunakan \`/register\` untuk mendaftar ke sistem economy terlebih dahulu.`
                )
                .setColor(0xFF0000)
                .addFields({
                    name: '💡 Langkah-langkah',
                    value: '1. Gunakan `/register` untuk mendaftar ke sistem economy\n2. Setelah itu, gunakan `/rpg-register` untuk mendaftar ke sistem RPG Mining',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if already registered in RPG system
        if (isMiningUserRegistered(userId)) {
            const userData = getMiningUser(userId);
            const embed = new EmbedBuilder()
                .setTitle('✅ Sudah Terdaftar')
                .setDescription(`Anda sudah terdaftar di sistem RPG Mining!`)
                .setColor(0x00FF00)
                .addFields({
                    name: '📊 Level & XP',
                    value: `Level ${userData?.level || 1} (${userData?.xp || 0} XP)`,
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Show registration prompt
        const embed = new EmbedBuilder()
            .setTitle('📝 Pendaftaran Sistem RPG Mining')
            .setDescription(
                `**Selamat datang di sistem RPG Mining!** ⚔️\n\n` +
                `Dengan mendaftar, Anda akan:\n` +
                `• Mendapatkan akses ke semua fitur mining\n` +
                `• Bisa mining ore untuk mendapatkan XP dan items\n` +
                `• Bisa membeli pickaxe dan backpack yang lebih baik\n` +
                `• Bisa menjual ore untuk mendapatkan coins\n` +
                `• Bisa naik level dan unlock ore yang lebih langka\n\n` +
                `**Klik tombol di bawah untuk mendaftar!**`
            )
            .addFields({
                name: '✅ Status Economy',
                value: 'Anda sudah terdaftar di sistem economy!',
                inline: false
            })
            .setColor(0x9B59B6)
            .setThumbnail(client.user?.displayAvatarURL({ forceStatic: false }) || null)
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        const acceptButton = new ButtonBuilder()
            .setCustomId('rpg_register_accept')
            .setLabel('Terima & Daftar')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const cancelButton = new ButtonBuilder()
            .setCustomId('rpg_register_cancel')
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
                (i.customId === 'rpg_register_accept' || i.customId === 'rpg_register_cancel'),
            time: 30000 // 30 seconds
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            if (i.customId === 'rpg_register_accept') {
                // Register user
                try {
                    // Check if already registered (double check)
                    if (isMiningUserRegistered(userId)) {
                        const userData = getMiningUser(userId);
                        const alreadyRegisteredEmbed = new EmbedBuilder()
                            .setTitle('✅ Sudah Terdaftar')
                            .setDescription(`Anda sudah terdaftar di sistem RPG Mining!`)
                            .setColor(0x00FF00)
                            .addFields({
                                name: '📊 Level & XP',
                                value: `Level ${userData?.level || 1} (${userData?.xp || 0} XP)`,
                                inline: false
                            })
                            .setTimestamp();

                        await i.update({ embeds: [alreadyRegisteredEmbed], components: [] });
                        return;
                    }

                    // Register the user
                    registerMiningUser(userId);
                    
                    // Verify registration was successful
                    if (!isMiningUserRegistered(userId)) {
                        throw new Error('Registration failed - user not found after registration');
                    }
                    
                    const userData = getMiningUser(userId);
                    if (!userData) {
                        throw new Error('Failed to get user data after registration');
                    }

                    const successEmbed = new EmbedBuilder()
                        .setTitle('🎉 Pendaftaran Berhasil!')
                        .setDescription(
                            `**Selamat! Anda telah terdaftar di sistem RPG Mining!** ⚔️\n\n` +
                            `Anda sekarang bisa:\n` +
                            `• Menggunakan \`/mining\` untuk mining ore\n` +
                            `• Menggunakan \`/store\` untuk melihat items yang dijual\n` +
                            `• Menggunakan \`/backpack\` untuk melihat inventory\n` +
                            `• Menggunakan \`/buy\` untuk membeli equipment\n` +
                            `• Menggunakan \`/sell\` untuk menjual ore\n` +
                            `• Menggunakan \`/rpg-profile\` untuk melihat profil RPG Anda`
                        )
                        .setColor(0x00FF00)
                        .addFields({
                            name: '📊 Status Awal',
                            value: `Level ${userData?.level || 1} | XP: ${userData?.xp || 0}`,
                            inline: false
                        })
                        .setTimestamp()
                        .setFooter({ 
                            text: getFooterText(`Selamat mining! ⛏️`), 
                            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                        });

                    await i.update({ embeds: [successEmbed], components: [] });
                } catch (error) {
                    console.error('[RPG-REGISTER] Error:', error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('Terjadi kesalahan saat mendaftar. Silakan coba lagi.')
                        .setColor(0xFF0000)
                        .setTimestamp();

                    await i.update({ embeds: [errorEmbed], components: [] });
                }
            } else if (i.customId === 'rpg_register_cancel') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Pendaftaran Dibatalkan')
                    .setDescription('Anda membatalkan pendaftaran. Anda bisa mendaftar kapan saja dengan `/rpg-register`.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Waktu Habis')
                    .setDescription('Waktu untuk mendaftar telah habis. Gunakan `/rpg-register` lagi untuk mendaftar.')
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
