import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    ComponentType
} from 'discord.js';
import { getWarnSettings, updateWarnSettings } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'moderator',
    data: new SlashCommandBuilder()
        .setName('warn-settings')
        .setDescription('Atur pengaturan sistem warn')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

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

        const settings = getWarnSettings(guild.id);

        // Create buttons
        const maxWarnButtons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('warn_set_max_1')
                    .setLabel('1')
                    .setStyle(settings.max_warnings === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('warn_set_max_2')
                    .setLabel('2')
                    .setStyle(settings.max_warnings === 2 ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('warn_set_max_3')
                    .setLabel('3')
                    .setStyle(settings.max_warnings === 3 ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('warn_set_max_5')
                    .setLabel('5')
                    .setStyle(settings.max_warnings === 5 ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('warn_set_max_10')
                    .setLabel('10')
                    .setStyle(settings.max_warnings === 10 ? ButtonStyle.Success : ButtonStyle.Secondary)
            );

        const autoBanButtons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('warn_toggle_autoban')
                    .setLabel(settings.auto_ban_enabled ? 'Nonaktifkan Auto-ban' : 'Aktifkan Auto-ban')
                    .setStyle(settings.auto_ban_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            );

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Pengaturan Sistem Warn')
            .setDescription('Gunakan tombol di bawah untuk mengatur pengaturan sistem warn')
            .setColor(0x5865F2)
            .addFields({
                name: '⚠️ Batas Maksimal Warn',
                value: `**${settings.max_warnings}** warnings\n\nPilih batas maksimal warn sebelum user di-ban otomatis:`,
                inline: false
            })
            .addFields({
                name: '🔨 Auto-ban',
                value: settings.auto_ban_enabled 
                    ? '✅ **Aktif**\nUser akan di-ban otomatis jika melebihi batas warn'
                    : '❌ **Nonaktif**\nUser tidak akan di-ban otomatis',
                inline: false
            })
            .setTimestamp()
            .setFooter({
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [maxWarnButtons, autoBanButtons] 
        });

        // Create collector
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i: ButtonInteraction) => 
                i.user.id === interaction.user.id && i.customId.startsWith('warn_'),
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            await i.deferUpdate();

            if (i.customId.startsWith('warn_set_max_')) {
                // Set max warnings
                const maxWarn = parseInt(i.customId.split('_').pop() || '3');
                updateWarnSettings(guild.id, maxWarn, undefined);
                
                const newSettings = getWarnSettings(guild.id);
                
                // Update buttons
                const newMaxWarnButtons = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_1')
                            .setLabel('1')
                            .setStyle(newSettings.max_warnings === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_2')
                            .setLabel('2')
                            .setStyle(newSettings.max_warnings === 2 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_3')
                            .setLabel('3')
                            .setStyle(newSettings.max_warnings === 3 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_5')
                            .setLabel('5')
                            .setStyle(newSettings.max_warnings === 5 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_10')
                            .setLabel('10')
                            .setStyle(newSettings.max_warnings === 10 ? ButtonStyle.Success : ButtonStyle.Secondary)
                    );

                const newAutoBanButtons = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('warn_toggle_autoban')
                            .setLabel(newSettings.auto_ban_enabled ? 'Nonaktifkan Auto-ban' : 'Aktifkan Auto-ban')
                            .setStyle(newSettings.auto_ban_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                    );

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('⚙️ Pengaturan Sistem Warn')
                    .setDescription('Gunakan tombol di bawah untuk mengatur pengaturan sistem warn')
                    .setColor(0x5865F2)
                    .addFields({
                        name: '⚠️ Batas Maksimal Warn',
                        value: `**${newSettings.max_warnings}** warnings\n\nPilih batas maksimal warn sebelum user di-ban otomatis:`,
                        inline: false
                    })
                    .addFields({
                        name: '🔨 Auto-ban',
                        value: newSettings.auto_ban_enabled 
                            ? '✅ **Aktif**\nUser akan di-ban otomatis jika melebihi batas warn'
                            : '❌ **Nonaktif**\nUser tidak akan di-ban otomatis',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await i.editReply({ 
                    embeds: [updatedEmbed], 
                    components: [newMaxWarnButtons, newAutoBanButtons] 
                });
            } else if (i.customId === 'warn_toggle_autoban') {
                // Toggle auto-ban - get current settings first
                const currentSettings = getWarnSettings(guild.id);
                const newAutoBanEnabled = !currentSettings.auto_ban_enabled;
                updateWarnSettings(guild.id, undefined, newAutoBanEnabled);
                
                const newSettings = getWarnSettings(guild.id);
                
                // Update buttons
                const newMaxWarnButtons = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_1')
                            .setLabel('1')
                            .setStyle(newSettings.max_warnings === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_2')
                            .setLabel('2')
                            .setStyle(newSettings.max_warnings === 2 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_3')
                            .setLabel('3')
                            .setStyle(newSettings.max_warnings === 3 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_5')
                            .setLabel('5')
                            .setStyle(newSettings.max_warnings === 5 ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('warn_set_max_10')
                            .setLabel('10')
                            .setStyle(newSettings.max_warnings === 10 ? ButtonStyle.Success : ButtonStyle.Secondary)
                    );

                const newAutoBanButtons = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('warn_toggle_autoban')
                            .setLabel(newSettings.auto_ban_enabled ? 'Nonaktifkan Auto-ban' : 'Aktifkan Auto-ban')
                            .setStyle(newSettings.auto_ban_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                    );

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('⚙️ Pengaturan Sistem Warn')
                    .setDescription('Gunakan tombol di bawah untuk mengatur pengaturan sistem warn')
                    .setColor(0x5865F2)
                    .addFields({
                        name: '⚠️ Batas Maksimal Warn',
                        value: `**${newSettings.max_warnings}** warnings\n\nPilih batas maksimal warn sebelum user di-ban otomatis:`,
                        inline: false
                    })
                    .addFields({
                        name: '🔨 Auto-ban',
                        value: newSettings.auto_ban_enabled 
                            ? '✅ **Aktif**\nUser akan di-ban otomatis jika melebihi batas warn'
                            : '❌ **Nonaktif**\nUser tidak akan di-ban otomatis',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await i.editReply({ 
                    embeds: [updatedEmbed], 
                    components: [newMaxWarnButtons, newAutoBanButtons] 
                });
            }
        });

        collector.on('end', async () => {
            // Disable buttons when collector ends
            const disabledMaxWarnButtons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('warn_set_max_1')
                        .setLabel('1')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('warn_set_max_2')
                        .setLabel('2')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('warn_set_max_3')
                        .setLabel('3')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('warn_set_max_5')
                        .setLabel('5')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('warn_set_max_10')
                        .setLabel('10')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            const disabledAutoBanButtons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('warn_toggle_autoban')
                        .setLabel('Nonaktifkan Auto-ban')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            try {
                await interaction.editReply({ components: [disabledMaxWarnButtons, disabledAutoBanButtons] });
            } catch (error) {
                // Message might have been deleted
                console.error('Error disabling buttons:', error);
            }
        });
    },
};

