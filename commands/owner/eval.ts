import { SlashCommandBuilder, EmbedBuilder, codeBlock, ChatInputCommandInteraction, Message, Client } from 'discord.js';

function isOwner(userId: string): boolean {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim());
    return ownerIds.includes(userId);
}

function clean(text: any): string {
    if (typeof text === 'string') {
        return text
            .replace(/`/g, '`' + String.fromCharCode(8203))
            .replace(/@/g, '@' + String.fromCharCode(8203))
            .replace(process.env.TOKEN || '', '[TOKEN REDACTED]');
    }
    return String(text);
}

export default {
    category: 'owner',
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluasi kode JavaScript (Hanya Owner)')
        .addStringOption(option =>
            option
                .setName('code')
                .setDescription('Kode yang akan dievaluasi')
                .setRequired(true)
        ),
    async execute(
        interaction: ChatInputCommandInteraction | Message, 
        client: Client, 
        code?: string, 
        isPrefix: boolean = false
    ) {
        const userId = 'user' in interaction ? interaction.user.id : interaction.author.id;
        
        if (!isOwner(userId)) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription('❌ Anda tidak memiliki izin untuk menggunakan command ini.');
            
            if (isPrefix && 'reply' in interaction) {
                return interaction.reply({ embeds: [errorEmbed] });
            }
            if ('reply' in interaction && 'options' in interaction) {
                return interaction.reply({ embeds: [errorEmbed], flags: 64 }); // 64 = Ephemeral
            }
            return;
        }
        
        const codeToEval = code || ('options' in interaction ? interaction.options.getString('code') : null);
        
        if (!codeToEval) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription('❌ Silakan berikan kode untuk dievaluasi.');
            
            if (isPrefix && 'reply' in interaction) {
                return interaction.reply({ embeds: [errorEmbed] });
            }
            if ('reply' in interaction && 'options' in interaction) {
                return interaction.reply({ embeds: [errorEmbed], flags: 64 }); // 64 = Ephemeral
            }
            return;
        }
        
        try {
            const start = Date.now();
            // eslint-disable-next-line no-eval
            let evaled = eval(codeToEval);
            
            if (evaled instanceof Promise) {
                evaled = await evaled;
            }
            
            const end = Date.now();
            const executionTime = end - start;
            
            const result = clean(String(evaled));
            const type = typeof evaled;
            
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .addFields(
                    { 
                        name: '📥 Input', 
                        value: codeBlock('js', codeToEval.length > 1000 ? codeToEval.substring(0, 1000) + '...' : codeToEval), 
                        inline: false 
                    },
                    { 
                        name: '📤 Output', 
                        value: codeBlock('js', result.length > 1000 ? result.substring(0, 1000) + '...' : result || 'undefined'), 
                        inline: false 
                    },
                    { name: '⏱️ Waktu Eksekusi', value: `\`\`\`${executionTime}ms\`\`\``, inline: true },
                    { name: '📋 Tipe', value: `\`\`\`${type}\`\`\``, inline: true }
                )
                .setTimestamp();
            
            if ('reply' in interaction) {
                await interaction.reply({ embeds: [successEmbed] });
            }
        } catch (error) {
            const errorMessage = clean(error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .addFields(
                    { 
                        name: '📥 Input', 
                        value: codeBlock('js', codeToEval.length > 1000 ? codeToEval.substring(0, 1000) + '...' : codeToEval), 
                        inline: false 
                    },
                    { 
                        name: '❌ Kesalahan', 
                        value: codeBlock('js', errorMessage.length > 1000 ? errorMessage.substring(0, 1000) + '...' : errorMessage), 
                        inline: false 
                    }
                )
                .setTimestamp();
            
            if ('reply' in interaction) {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    },
};
