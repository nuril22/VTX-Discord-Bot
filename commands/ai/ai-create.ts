import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Client,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { createAISession, getAIConfig, getUserAISessions } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'ai',
    data: new SlashCommandBuilder()
        .setName('ai-create')
        .setDescription('Buat channel AI chat pribadi'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        if (!guild) {
            return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di server!' });
        }

        // Check if AI system is setup
        const config = getAIConfig(guild.id);
        if (!config) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('AI system belum diatur! Gunakan `/ai-setup` terlebih dahulu.')
                .setColor(0xFF0000)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Check if user already has an AI session
        const userSessions = getUserAISessions(interaction.user.id, guild.id);
        const openSession = userSessions.find(s => {
            const channel = guild.channels.cache.get(s.channel_id);
            return channel && channel.isTextBased();
        });
        
        if (openSession) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Anda sudah memiliki AI channel yang aktif: <#${openSession.channel_id}>\n\nGunakan \`/ai-delete\` untuk menghapus session sebelumnya.`)
                .setColor(0xFF0000)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        try {
            // Get or create AI category
            let aiCategory = guild.channels.cache.find(
                c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'ai chat'
            );

            if (!aiCategory) {
                aiCategory = await guild.channels.create({
                    name: 'AI Chat',
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: ['ViewChannel'],
                        },
                    ],
                });
            }

            // Generate session ID (this will be used as channel name)
            const sessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}-chatgpt-${Math.floor(Date.now() / 1000)}`;
            const channelName = sessionId; // Use session ID as channel name

            // Create AI channel
            const aiChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: aiCategory.id,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: interaction.user.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                    },
                    {
                        id: client.user!.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                    },
                ],
            });

            // Create session in database
            createAISession(aiChannel.id, guild.id, interaction.user.id, sessionId);

            // Send welcome message and trigger AI first message
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🤖 AI Chat Channel')
                .setDescription(`Halo <@${interaction.user.id}>!\n\nChannel AI chat Anda telah dibuat. Mulai chat dengan AI sekarang!\n\n**Session ID:** \`${sessionId}\`\n\nGunakan \`/ai-delete\` untuk menghapus channel ini.`)
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({
                    text: getFooterText(`Session ID: ${sessionId}`),
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await aiChannel.send({ embeds: [welcomeEmbed] });

            // Send first message to AI to create session
            try {
                // System prompt to inform AI about Discord context
                const discordPrompt = `[System: You are an AI assistant in a Discord server. This is a private Discord channel. The user can type messages and you will respond. If the user wants to close this chat, they will say "close", "delete", "end session", or similar. Be helpful, friendly, and conversational. Keep responses concise but informative.]\n\nUser: Hello`;
                
                const response = await fetch(`https://api.ryzumi.vip/api/ai/chatgpt?text=${encodeURIComponent(discordPrompt)}&session=${sessionId}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    console.error(`[AI] API returned status ${response.status}:`, errorText.substring(0, 200));
                    
                    // Handle specific status codes
                    if (response.status === 403) {
                        console.warn('[AI] API returned 403 Forbidden - API might be rate limited or blocked');
                        await aiChannel.send('**AI:** Hello! How can I assist you today?');
                        return;
                    }
                    
                    throw new Error(`API returned status ${response.status}`);
                }
                
                const contentType = response.headers.get('content-type') || '';
                const text = await response.text();
                
                // Check if response is JSON
                if (!contentType.includes('application/json') && !text.trim().startsWith('{')) {
                    console.error('[AI] Response is not JSON, content-type:', contentType, 'body:', text.substring(0, 200));
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                    return;
                }
                
                let data: { success: boolean; result: string; session: string };
                
                try {
                    data = JSON.parse(text) as { success: boolean; result: string; session: string };
                } catch (parseError) {
                    console.error('[AI] Failed to parse JSON response. Status:', response.status);
                    console.error('[AI] Response text (first 500 chars):', text.substring(0, 500));
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                    return;
                }
                
                if (data.success && data.result) {
                    await aiChannel.send(`**AI:** ${data.result}`);
                } else {
                    console.warn('[AI] API response indicates failure:', data);
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                }
            } catch (error: any) {
                console.error('[AI] Error sending first message to AI:', error);
                console.error('[AI] Error details:', {
                    message: error.message,
                    stack: error.stack,
                });
                // Send fallback message
                try {
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                } catch (sendError) {
                    console.error('[AI] Failed to send fallback message:', sendError);
                }
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ AI Channel Berhasil Dibuat')
                .setDescription(`Channel AI Anda telah dibuat: ${aiChannel}`)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error: any) {
            console.error('[AI] Error creating AI channel:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Gagal membuat AI channel: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
