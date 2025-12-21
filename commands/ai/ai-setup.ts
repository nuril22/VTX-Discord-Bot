import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Client,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { setAIConfig, getAIConfig } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'ai',
    data: new SlashCommandBuilder()
        .setName('ai-setup')
        .setDescription('Setup channel untuk AI chat system (mod only)')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel untuk mengirim embed AI')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Anda tidak memiliki permission untuk menggunakan command ini!')
                .setColor(0xFF0000)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        const channel = interaction.options.getChannel('channel', true);

        try {
            // Save config to database
            setAIConfig(interaction.guildId!, channel.id);

            // Create embed for AI
            const embed = new EmbedBuilder()
                .setTitle('🤖 AI Chat System')
                .setDescription('Klik button di bawah untuk membuat channel AI chat pribadi Anda!\n\nAnda dapat berinteraksi dengan AI ChatGPT di channel yang dibuat.')
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({
                    text: getFooterText(),
                    iconURL: client.user?.displayAvatarURL({ forceStatic: false }) || undefined
                });

            // Create button
            const createButton = new ButtonBuilder()
                .setCustomId('ai_create')
                .setLabel('Create AI')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🤖');

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(createButton);

            // Send embed to channel
            const aiChannel = await interaction.guild?.channels.fetch(channel.id);
            if (aiChannel && aiChannel.isTextBased()) {
                await aiChannel.send({ embeds: [embed], components: [row] });
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ AI System Setup Berhasil')
                .setDescription(`AI system telah diatur!\n\n**Channel:** ${channel}`)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error: any) {
            console.error('[AI] Error setting up AI:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Gagal setup AI system: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
