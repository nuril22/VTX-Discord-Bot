import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getUserBalance, subtractUserBalance, addUserBalance, addTransaction, isUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

const SYMBOLS = ['🍎', '🍋', '🍊', '🍇', '🍒', '⭐', '💎'];
const JACKPOT_SYMBOL = '💎';

function spinSlot(): string[] {
    return [
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    ];
}

function calculatePayout(reels: string[], betAmount: number, multiplier: number = 2.0): number {
    const [a, b, c] = reels;
    let baseMultiplier = 0;

    // Jackpot - 3 diamonds
    if (a === JACKPOT_SYMBOL && b === JACKPOT_SYMBOL && c === JACKPOT_SYMBOL) {
        baseMultiplier = 10; // 10x base multiplier
    }
    // All three same (non-diamond)
    else if (a === b && b === c) {
        baseMultiplier = 5; // 5x base multiplier
    }
    // Two same
    else if (a === b || b === c || a === c) {
        baseMultiplier = 2; // 2x base multiplier
    }
    // Loss
    else {
        return 0;
    }

    // Apply multiplier to base payout (same as coinflip)
    return Math.floor(betAmount * baseMultiplier * multiplier);
}

export default {
    category: 'gambling',
    data: new SlashCommandBuilder()
        .setName('slot')
        .setDescription('Mainkan mesin slot untuk mendapatkan hadiah')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Jumlah uang yang ingin dipertaruhkan')
                .setRequired(true)
                .setMinValue(1)
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
        const multiplier = interaction.options.getNumber('multiplier') || 2.0;
        
        // Calculate win chance based on multiplier (same as coinflip)
        const winChance = 1 / multiplier; // 1.5x = 66.67%, 2x = 50%, 3x = 33.33%, 5x = 20%

        // Check balance
        const balance = getUserBalance(userId);
        
        if (balance < amount) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Saldo Tidak Cukup')
                .setDescription('**Anda tidak memiliki cukup uang untuk bermain slot!**')
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

        // Spin animation - show spinning reels with visual feedback
        const animationFrames = 4; // Number of animation frames (kept low to avoid rate limits)
        const frameDelay = 700; // Delay between frames in ms (700ms = safe from rate limits)
        
        // Generate random symbols for animation
        function getRandomSymbol(): string {
            return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        }
        
        // Show initial loading embed
        let frameEmbed = new EmbedBuilder()
            .setTitle('🎰 Mesin Slot Sedang Berputar...')
            .setDescription(`**${getRandomSymbol()} ┃ ${getRandomSymbol()} ┃ ${getRandomSymbol()}**\n\n⏳ \`Sedang diproses...\``)
            .setColor(0x5865F2)
            .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
            .addFields({
                name: '💵 Taruhan',
                value: `\`\`\`${amount.toLocaleString('id-ID')} coins\`\`\``,
                inline: true
            })
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
        
        await interaction.editReply({ embeds: [frameEmbed] });
        
        // Animate spinning reels - update embed with new random symbols
        for (let i = 0; i < animationFrames - 1; i++) {
            await new Promise(resolve => setTimeout(resolve, frameDelay));
            
            frameEmbed = new EmbedBuilder()
                .setTitle('🎰 Mesin Slot Sedang Berputar...')
                .setDescription(`**${getRandomSymbol()} ┃ ${getRandomSymbol()} ┃ ${getRandomSymbol()}**\n\n⏳ \`Sedang diproses...\``)
                .setColor(0x5865F2)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }) || null)
                .addFields({
                    name: '💵 Taruhan',
                    value: `\`\`\`${amount.toLocaleString('id-ID')} coins\`\`\``,
                    inline: true
                })
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
            
            try {
                await interaction.editReply({ embeds: [frameEmbed] });
            } catch (error: any) {
                // If rate limited or other error, continue with final result
                if (error.code === 50035 || error.code === 50006) {
                    console.log('[Slot] Rate limit atau error saat edit, lanjut ke hasil final...');
                    break;
                }
            }
        }
        
        // Small delay before final result
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Final spin - get actual result with adjusted probability (same logic as coinflip)
        // Use weighted random based on multiplier - if user wins, generate winning combo
        const randomValue = Math.random();
        const userWins = randomValue < winChance;
        
        let reels: string[];
        let payout = 0;
        
        if (userWins) {
            // User wins - generate winning combination based on win type probability
            const winType = Math.random();
            if (winType < 0.02) {
                // Jackpot (2% of wins) - very rare
                reels = [JACKPOT_SYMBOL, JACKPOT_SYMBOL, JACKPOT_SYMBOL];
            } else if (winType < 0.25) {
                // Triple match (23% of wins)
                const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                reels = [symbol, symbol, symbol];
            } else {
                // Double match (73% of wins) - most common win
                const symbol1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                let symbol2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                while (symbol2 === symbol1) {
                    symbol2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                }
                // Create double match: two same, one different
                const diffPos = Math.floor(Math.random() * 3);
                reels = [symbol1, symbol1, symbol1];
                reels[diffPos] = symbol2;
            }
            payout = calculatePayout(reels, amount, multiplier);
        } else {
            // User loses - generate losing combination (all different)
            reels = spinSlot();
            const [a, b, c] = reels;
            
            // Ensure it's a losing combination (all different)
            let attempts = 0;
            while ((a === b || b === c || a === c) && attempts < 50) {
                reels = spinSlot();
                const [a2, b2, c2] = reels;
                if (a2 !== b2 && b2 !== c2 && a2 !== c2) {
                    break;
                }
                attempts++;
            }
            payout = 0;
        }
        
        const won = payout > 0;

        // Update balance
        if (won) {
            const profit = payout - amount;
            const newBalance = addUserBalance(userId, profit);
            addTransaction(userId, 'slot_win', profit, `Slot: ${reels.join(' ')}`);

            // Calculate base multiplier (without bonus multiplier)
            const basePayout = payout / multiplier;
            const baseMultiplier = basePayout / amount;
            
            const isJackpot = baseMultiplier === 10;
            const winMessages = {
                10: '🎰 JACKPOT!!! Semua Diamond! 🎰',
                5: '🎉 Triple Match! Kombinasi sempurna!',
                2: '✨ Double Match! Nice!'
            };
            const message = isJackpot 
                ? winMessages[10] 
                : baseMultiplier === 5 
                    ? winMessages[5] 
                    : winMessages[2];

            const embed = new EmbedBuilder()
                .setTitle(isJackpot ? '🎰 JACKPOT!!! 🎰' : '🎰 Slot - MENANG!')
                .setDescription(
                    `**${reels.join(' ┃ ')}**\n\n` +
                    `**${message}**\n\n` +
                    `Selamat atas kemenangan Anda! 🎊`
                )
                .setColor(isJackpot ? 0xFFD700 : 0x00FF00)
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
            addTransaction(userId, 'slot_loss', -amount, `Slot: ${reels.join(' ')}`);
            const newBalance = getUserBalance(userId);

            const embed = new EmbedBuilder()
                .setTitle('🎰 Slot - Tidak Menang')
                .setDescription(
                    `**${reels.join(' ┃ ')}**\n\n` +
                    `**Tidak ada kombinasi yang menang!**\n\n` +
                    `Coba lagi untuk mendapatkan kombinasi yang menang! 🍀`
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
                        name: '💡 Kombinasi Menang',
                        value: `• **3 sama** = ${(5 * multiplier).toFixed(1)}x\n• **2 sama** = ${(2 * multiplier).toFixed(1)}x\n• **3 💎** = ${(10 * multiplier).toFixed(1)}x (JACKPOT)`,
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
