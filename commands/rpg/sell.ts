import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { 
    getMiningInventory,
    getMiningItemQuantity,
    removeMiningInventoryItem,
    addUserBalance,
    addTransaction,
    isMiningUserRegistered,
    getMiningUser
} from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

// Ore sell prices (base price, will be adjusted by rarity)
const ORE_PRICES: Record<string, number> = {
    'Batu': 5,
    'Besi': 10,
    'Emas': 25,
    'Perak': 20,
    'Diamond': 100,
    'Ruby': 200,
    'Sapphire': 250,
    'Emerald': 500,
};

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Jual ore dari inventory Anda')
        .addStringOption(option =>
            option
                .setName('ore')
                .setDescription('Nama ore yang ingin dijual')
                .setRequired(true)
                .addChoices(
                    { name: 'Semua Ore', value: 'all' },
                    { name: 'Batu', value: 'Batu' },
                    { name: 'Besi', value: 'Besi' },
                    { name: 'Emas', value: 'Emas' },
                    { name: 'Perak', value: 'Perak' },
                    { name: 'Diamond', value: 'Diamond' },
                    { name: 'Ruby', value: 'Ruby' },
                    { name: 'Sapphire', value: 'Sapphire' },
                    { name: 'Emerald', value: 'Emerald' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('jumlah')
                .setDescription('Jumlah ore yang ingin dijual (kosongkan untuk menjual semua)')
                .setRequired(false)
                .setMinValue(1)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered in mining system
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa menjual ore!')
                .setColor(0xFF0000)
                .addFields({
                    name: '💡 Tips',
                    value: 'Gunakan `/rpg-register` untuk mendaftar ke sistem RPG Mining.',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const oreName = interaction.options.getString('ore', true);
        const requestedQuantity = interaction.options.getInteger('jumlah');

        // Ore emojis
        const oreEmojis: Record<string, string> = {
            'Batu': '🪨',
            'Besi': '⚙️',
            'Emas': '🥇',
            'Perak': '🥈',
            'Diamond': '💎',
            'Ruby': '❤️',
            'Sapphire': '💙',
            'Emerald': '💚',
        };

        // Handle "sell all" option
        if (oreName === 'all') {
            const inventory = getMiningInventory(userId);
            
            if (inventory.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Inventory Kosong')
                    .setDescription('Anda tidak memiliki ore apapun untuk dijual!')
                    .addFields({
                        name: '💡 Tips',
                        value: 'Gunakan `/mining` untuk mining ore!',
                        inline: false
                    })
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get sell bonus
            const userData = getMiningUser(userId);
            const sellBonus = userData?.sell_bonus || 0;

            // Sell all ores
            let totalEarned = 0;
            const soldItems: Array<{ name: string; quantity: number; price: number }> = [];

            for (const item of inventory) {
                const basePrice = ORE_PRICES[item.item_name] || 0;
                if (basePrice > 0) {
                    // Apply sell bonus
                    const priceWithBonus = Math.floor(basePrice * (1 + sellBonus / 100));
                    const itemTotalPrice = priceWithBonus * item.quantity;
                    totalEarned += itemTotalPrice;
                    soldItems.push({
                        name: item.item_name,
                        quantity: item.quantity,
                        price: itemTotalPrice
                    });
                    removeMiningInventoryItem(userId, item.item_name, item.quantity);
                }
            }

            if (totalEarned === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Tidak Ada Ore yang Bisa Dijual')
                    .setDescription('Tidak ada ore yang valid untuk dijual!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const newBalance = addUserBalance(userId, totalEarned);
            addTransaction(userId, 'sell_all', totalEarned, `Menjual semua ore (${soldItems.length} jenis)`);

            // Format sold items list
            let soldItemsText = '';
            for (const item of soldItems) {
                const emoji = oreEmojis[item.name] || '⚪';
                soldItemsText += `${emoji} **${item.name}** x${item.quantity} - ${item.price.toLocaleString('id-ID')} coins\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Penjualan Semua Ore Berhasil!')
                .setDescription(`Anda berhasil menjual semua ore dari inventory!`)
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '📦 Ore yang Terjual',
                        value: soldItemsText || 'Tidak ada',
                        inline: false
                    },
                    {
                        name: '💰 Total Pendapatan',
                        value: `${totalEarned.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '💵 Saldo Sekarang',
                        value: `${newBalance.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '📊 Total Jenis Ore',
                        value: `${soldItems.length} jenis ore terjual`,
                        inline: false
                    }
                );

            if (sellBonus > 0) {
                embed.addFields({
                    name: '✨ Sell Bonus',
                    value: `+${sellBonus}% bonus dari rebirth`,
                    inline: false
                });
            }

            embed.setTimestamp()
                .setFooter({
                    text: getFooterText(`Inventory sekarang kosong! Gunakan /mining untuk mining lagi`),
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Handle single ore selling (existing logic)
        const quantity = getMiningItemQuantity(userId, oreName);
        
        if (quantity === 0) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Ore Tidak Ditemukan')
                .setDescription(`Anda tidak memiliki **${oreName}** di inventory Anda!`)
                .addFields({
                    name: '💡 Tips',
                    value: 'Gunakan `/backpack` untuk melihat inventory Anda atau `/mining` untuk mining ore!',
                    inline: false
                })
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Determine sell quantity
        const sellQuantity = requestedQuantity ? Math.min(requestedQuantity, quantity) : quantity;

        // Get price with sell bonus
        const userData = getMiningUser(userId);
        const sellBonus = userData?.sell_bonus || 0;
        const basePrice = ORE_PRICES[oreName] || 0;
        if (basePrice === 0) {
            throw new Error(`Price not found for ore: ${oreName}`);
        }

        // Apply sell bonus
        const priceWithBonus = Math.floor(basePrice * (1 + sellBonus / 100));
        const totalPrice = priceWithBonus * sellQuantity;

        // Sell ore
        removeMiningInventoryItem(userId, oreName, sellQuantity);
        const newBalance = addUserBalance(userId, totalPrice);
        addTransaction(userId, 'sell', totalPrice, `Menjual ${sellQuantity}x ${oreName}`);

        const emoji = oreEmojis[oreName] || '⚪';
        const remaining = quantity - sellQuantity;

        const embed = new EmbedBuilder()
            .setTitle('✅ Penjualan Berhasil!')
            .setDescription(`Anda berhasil menjual ${emoji} **${oreName}**!`)
            .setColor(0x00FF00)
            .addFields(
                {
                    name: '📦 Ore Terjual',
                    value: `${emoji} **${oreName}** x${sellQuantity}`,
                    inline: true
                },
                {
                    name: '💰 Total Harga',
                    value: `${totalPrice.toLocaleString('id-ID')} coins`,
                    inline: true
                },
                {
                    name: '💵 Saldo Sekarang',
                    value: `${newBalance.toLocaleString('id-ID')} coins`,
                    inline: false
                }
            );

        if (sellBonus > 0) {
            embed.addFields({
                name: '✨ Sell Bonus',
                value: `+${sellBonus}% bonus dari rebirth`,
                inline: false
            });
        }

        if (remaining > 0) {
            embed.addFields({
                name: '📦 Sisa di Inventory',
                value: `${emoji} **${oreName}** x${remaining}`,
                inline: false
            });
        }

        embed.setTimestamp()
            .setFooter({
                text: getFooterText(`Gunakan /sell untuk menjual ore lainnya`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
