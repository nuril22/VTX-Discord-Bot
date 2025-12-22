import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Client,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { createAISession, getAIConfig, getUserAISessions } from '../../database/db.js';
import { getFooterText, botConfig } from '../../settings/bot.js';

// Generate natural browser headers with more variation
function getNaturalHeaders(): Record<string, string> {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const acceptLanguages = [
        'en-US,en;q=0.9',
        'en-US,en;q=0.9,id;q=0.8',
        'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'en-GB,en;q=0.9',
    ];
    const randomLang = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];
    
    // Randomly include/exclude some headers to add variation
    const headers: Record<string, string> = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': randomLang,
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': randomUA,
        'Referer': 'https://ryzumi.vip/',
        'Origin': 'https://ryzumi.vip',
        'Connection': 'keep-alive',
    };
    
    // Randomly add Sec-Fetch headers (not always present in real browsers)
    if (Math.random() > 0.3) {
        headers['Sec-Fetch-Dest'] = 'empty';
        headers['Sec-Fetch-Mode'] = 'cors';
        headers['Sec-Fetch-Site'] = 'same-site';
    }
    
    // Sometimes add DNT header
    if (Math.random() > 0.5) {
        headers['DNT'] = '1';
    }
    
    return headers;
}

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
                // System prompt to inform AI about Discord context with Gen Z style
                // Removed dynamic timestamp to avoid spam detection (timestamp changes every second and makes each request unique)
                
                // Minimal prompt - short but clear about Discord context and bot name
                // Include actual timestamp in prompt so AI understands the format, but keep it short
                const currentTime = Math.floor(Date.now() / 1000);
                const discordPrompt = `[You are ${botConfig.name}, a Gen Z AI assistant in Discord. Use slang. You're chatting in a private Discord channel. IMPORTANT: Discord messages have a 2000 character limit. Keep responses under 2000 characters. If you need to say more, be concise or split into shorter messages. For code blocks, use EXACT format: \`\`\`language\\ncode\\n\`\`\` (three backticks, language name, newline, code, newline, three backticks). NO spaces between backticks and language. For time/date questions, use Discord timestamps like <t:${currentTime}:F> or <t:${currentTime}:R>. Calculate current timestamp when needed. Say "close" to end.]\n\nUser: Hello`;
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:139',message:'Before building API URL',data:{discordPromptLength:discordPrompt.length,sessionId:sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                
                // Build API URL with proper encoding
                const encodedPrompt = encodeURIComponent(discordPrompt);
                const encodedSession = encodeURIComponent(sessionId);
                const apiUrl = `https://api.ryzumi.vip/api/ai/chatgpt?text=${encodedPrompt}&session=${encodedSession}`;
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:143',message:'After building API URL',data:{urlLength:apiUrl.length,encodedPromptLength:encodedPrompt.length,encodedSessionLength:encodedSession.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                
                // Log API call for debugging (without sensitive data)
                console.log(`[AI] Calling API: https://api.ryzumi.vip/api/ai/chatgpt?text=[...]&session=${sessionId.substring(0, 20)}...`);
                
                // Add longer random delay before first request to avoid detection
                const initialDelay = 3000 + Math.random() * 3000; // 3-6s random delay
                console.log(`[AI] Initial delay: ${Math.round(initialDelay)}ms before first request`);
                await new Promise(resolve => setTimeout(resolve, initialDelay));
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:150',message:'Before fetch API call',data:{method:'POST/GET',urlLength:apiUrl.length,initialDelay:Math.round(initialDelay)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                
                // API only supports GET method, use it directly
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: getNaturalHeaders(),
                });
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:153',message:'After fetch response',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:157',message:'Error response details',data:{status:response.status,errorTextStart:errorText.substring(0,200),errorTextLength:errorText.length,responseUrl:response.url?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    
                    console.error(`[AI] API returned status ${response.status}`);
                    console.error(`[AI] Response URL: ${response.url}`);
                    console.error(`[AI] Response headers:`, Object.fromEntries(response.headers.entries()));
                    console.error(`[AI] Error text (first 500 chars):`, errorText.substring(0, 500));
                    
                    // Handle specific status codes
                    if (response.status === 403) {
                        console.warn('[AI] API returned 403 Forbidden - API might be rate limited or blocked');
                        await aiChannel.send('**AI:** Hello! How can I assist you today?');
                        return;
                    }
                    
                    if (response.status === 404) {
                        console.warn('[AI] API returned 404 Not Found - API endpoint might be incorrect or unavailable');
                        console.warn(`[AI] Requested URL: ${apiUrl.substring(0, 150)}...`);
                        console.warn(`[AI] Full URL length: ${apiUrl.length} characters`);
                        // Try to send a Gen Z style fallback message
                        await aiChannel.send('**AI:** Yoo wassup bestie! 👋 Ready to chat? Let\'s vibe! 🔥');
                        return;
                    }
                    
                    if (response.status === 429) {
                        console.warn('[AI] API returned 429 Too Many Requests - Rate limited');
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
                
                let data: { success: boolean; result?: string; response?: string; message?: string; session?: string };
                
                try {
                    data = JSON.parse(text) as { success: boolean; result?: string; response?: string; message?: string; session?: string };
                } catch (parseError) {
                    console.error('[AI] Failed to parse JSON response. Status:', response.status);
                    console.error('[AI] Response text (first 500 chars):', text.substring(0, 500));
                    await aiChannel.send('**AI:** Hello! How can I assist you today?');
                    return;
                }
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:216',message:'Parsed API response',data:{success:data.success,hasResult:!!data.result,hasResponse:!!data.response,hasMessage:!!data.message,messageText:data.message?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                // Check for error response structure (response field indicates error)
                if (data.response && data.message) {
                    console.warn('[AI] API returned error response:', data);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/2de3269f-eda5-4801-9525-f939f04eacc7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ai-create.ts:222',message:'API error response detected',data:{response:data.response,message:data.message,urlLength:apiUrl.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    
                    // Handle specific error messages
                    if (data.message.includes('smart filter triggered')) {
                        console.warn('[AI] Ryzumi Network smart filter triggered - request may be too fast or suspicious');
                        await aiChannel.send('**AI:** Yoo wassup bestie! 👋 Ready to chat? Let\'s vibe! 🔥');
                    } else if (data.response.includes('ENCONNRESET') || data.response.includes('Connection reset')) {
                        console.warn('[AI] Connection reset by peer - network issue or rate limiting');
                        await aiChannel.send('**AI:** Yoo wassup bestie! 👋 Ready to chat? Let\'s vibe! 🔥');
                    } else {
                        await aiChannel.send('**AI:** Hello! How can I assist you today?');
                    }
                    return;
                }
                
                if (data.success && data.result) {
                    // Check message length (Discord limit is 2000 characters)
                    const aiResponse = data.result;
                    const MAX_MESSAGE_LENGTH = 2000;
                    
                    if (aiResponse.length > MAX_MESSAGE_LENGTH) {
                        // Split message into chunks
                        const chunks: string[] = [];
                        let currentChunk = '';
                        
                        // Try to split by sentences first, then by words, then by characters
                        const sentences = aiResponse.split(/(?<=[.!?])\s+/);
                        
                        for (const sentence of sentences) {
                            if ((currentChunk + sentence).length <= MAX_MESSAGE_LENGTH - 50) {
                                // Leave 50 chars for continuation marker
                                currentChunk += sentence + ' ';
                            } else {
                                if (currentChunk.trim()) {
                                    chunks.push(currentChunk.trim());
                                }
                                // If single sentence is too long, split by words
                                if (sentence.length > MAX_MESSAGE_LENGTH - 50) {
                                    const words = sentence.split(/\s+/);
                                    let wordChunk = '';
                                    for (const word of words) {
                                        if ((wordChunk + word).length <= MAX_MESSAGE_LENGTH - 50) {
                                            wordChunk += word + ' ';
                                        } else {
                                            if (wordChunk.trim()) {
                                                chunks.push(wordChunk.trim());
                                            }
                                            // If single word is too long, split by characters
                                            if (word.length > MAX_MESSAGE_LENGTH - 50) {
                                                for (let i = 0; i < word.length; i += MAX_MESSAGE_LENGTH - 50) {
                                                    chunks.push(word.substring(i, i + MAX_MESSAGE_LENGTH - 50));
                                                }
                                            } else {
                                                wordChunk = word + ' ';
                                            }
                                        }
                                    }
                                    if (wordChunk.trim()) {
                                        currentChunk = wordChunk;
                                    } else {
                                        currentChunk = '';
                                    }
                                } else {
                                    currentChunk = sentence + ' ';
                                }
                            }
                        }
                        
                        if (currentChunk.trim()) {
                            chunks.push(currentChunk.trim());
                        }
                        
                        // Send chunks with continuation markers
                        for (let i = 0; i < chunks.length; i++) {
                            const chunk = chunks[i];
                            const isLast = i === chunks.length - 1;
                            const messageText = isLast ? chunk : `${chunk}\n\n*[Pesan terlalu panjang, dilanjutkan...]*`;
                            
                            if (i === 0) {
                                await aiChannel.send(`**${botConfig.name}:** ${messageText}`);
                            } else {
                                await aiChannel.send(`**${botConfig.name}:** ${messageText}`);
                            }
                            
                            // Small delay between chunks to avoid rate limiting
                            if (!isLast) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    } else {
                        // Fix code block formatting if needed (ensure proper format for Discord)
                        let formattedResponse = aiResponse;
                        
                        // Fix common code block formatting issues
                        // Replace ```language with ```language (ensure no spaces)
                        formattedResponse = formattedResponse.replace(/```\s*(\w+)\s*\n/g, '```$1\n');
                        // Ensure closing backticks are on new line
                        formattedResponse = formattedResponse.replace(/\n\s*```/g, '\n```');
                        // Fix any triple backticks with spaces
                        formattedResponse = formattedResponse.replace(/```\s+/g, '```');
                        formattedResponse = formattedResponse.replace(/\s+```/g, '```');
                        
                        await aiChannel.send(`**${botConfig.name}:** ${formattedResponse}`);
                    }
                } else {
                    console.warn('[AI] API response indicates failure:', data);
                    await aiChannel.send(`**${botConfig.name}:** Hello! How can I assist you today?`);
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
