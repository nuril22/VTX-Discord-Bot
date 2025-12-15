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
import { getFooterText } from '../../settings/bot.js';
import { 
    isMiningUserRegistered, 
    getMiningUser, 
    getUserBalance,
    subtractUserBalance,
    updateMiningEquipment,
    addTransaction
} from '../../database/db.js';

interface StoreItem {
    id: string;
    name: string;
    emoji: string;
    type: 'pickaxe' | 'backpack';
    price: number;
    description: string;
    minLevel?: number;
}

const STORE_ITEMS: StoreItem[] = [
    // Pickaxes
    {
        id: 'stone_pickaxe',
        name: 'Pickaxe Batu',
        emoji: '⛏️',
        type: 'pickaxe',
        price: 500,
        description: 'Speed +20%, Luck +5%',
        minLevel: 2
    },
    {
        id: 'iron_pickaxe',
        name: 'Pickaxe Besi',
        emoji: '⛏️',
        type: 'pickaxe',
        price: 1500,
        description: 'Speed +50%, Luck +10%',
        minLevel: 5
    },
    {
        id: 'gold_pickaxe',
        name: 'Pickaxe Emas',
        emoji: '⛏️',
        type: 'pickaxe',
        price: 5000,
        description: 'Speed +100%, Luck +15%',
        minLevel: 10
    },
    {
        id: 'diamond_pickaxe',
        name: 'Pickaxe Diamond',
        emoji: '⛏️',
        type: 'pickaxe',
        price: 20000,
        description: 'Speed +200%, Luck +25%',
        minLevel: 15
    },
    // Backpacks
    {
        id: 'medium_backpack',
        name: 'Backpack Sedang',
        emoji: '🎒',
        type: 'backpack',
        price: 1000,
        description: 'Kapasitas +20 slot',
        minLevel: 3
    },
    {
        id: 'large_backpack',
        name: 'Backpack Besar',
        emoji: '🎒',
        type: 'backpack',
        price: 5000,
        description: 'Kapasitas +50 slot',
        minLevel: 8
    },
    {
        id: 'epic_backpack',
        name: 'Backpack Epic',
        emoji: '🎒',
        type: 'backpack',
        price: 25000,
        description: 'Kapasitas +100 slot',
        minLevel: 15
    },
];

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('Lihat toko untuk membeli peralatan mining'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa melihat store!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const userData = getMiningUser(userId);
        const balance = getUserBalance(userId);

        // Group items by type
        const pickaxes = STORE_ITEMS.filter(item => item.type === 'pickaxe');
        const backpacks = STORE_ITEMS.filter(item => item.type === 'backpack');

        const embed = new EmbedBuilder()
            .setTitle('🛒 Toko Mining')
            .setDescription('Beli peralatan untuk meningkatkan kemampuan mining Anda!')
            .setColor(0x5865F2)
            .addFields({
                name: '💵 Saldo Anda',
                value: `${balance.toLocaleString('id-ID')} coins`,
                inline: true
            })
            .addFields({
                name: '📊 Level Anda',
                value: `Level ${userData?.level || 1}`,
                inline: true
            })
            .setTimestamp();

        // Add pickaxes
        let pickaxeField = '';
        for (const pickaxe of pickaxes) {
            const levelReq = pickaxe.minLevel ? ` (Level ${pickaxe.minLevel}+)` : '';
            const canBuy = !pickaxe.minLevel || (userData?.level || 1) >= pickaxe.minLevel;
            const hasBalance = balance >= pickaxe.price;
            const status = canBuy && hasBalance ? '✅' : canBuy ? '💰' : '🔒';
            pickaxeField += `${status} ${pickaxe.emoji} **${pickaxe.name}** - ${pickaxe.price.toLocaleString('id-ID')} coins${levelReq}\n${pickaxe.description}\n\n`;
        }
        embed.addFields({
            name: '⛏️ Pickaxes',
            value: pickaxeField || 'Tidak ada pickaxe tersedia',
            inline: false
        });

        // Add backpacks
        let backpackField = '';
        for (const backpack of backpacks) {
            const levelReq = backpack.minLevel ? ` (Level ${backpack.minLevel}+)` : '';
            const canBuy = !backpack.minLevel || (userData?.level || 1) >= backpack.minLevel;
            const hasBalance = balance >= backpack.price;
            const status = canBuy && hasBalance ? '✅' : canBuy ? '💰' : '🔒';
            backpackField += `${status} ${backpack.emoji} **${backpack.name}** - ${backpack.price.toLocaleString('id-ID')} coins${levelReq}\n${backpack.description}\n\n`;
        }
        embed.addFields({
            name: '🎒 Backpacks',
            value: backpackField || 'Tidak ada backpack tersedia',
            inline: false
        });

        embed.addFields({
            name: '💡 Cara Membeli',
            value: 'Klik button di bawah untuk membeli item, atau gunakan `/buy item: <nama_item>`',
            inline: false
        });

        embed                .setFooter({ 
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`), 
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined 
                });

        // Create buttons for each item (max 5 buttons per row, Discord limit)
        const buttons: ButtonBuilder[] = [];
        
        // Add pickaxe buttons
        for (const pickaxe of pickaxes) {
            const canBuy = !pickaxe.minLevel || (userData?.level || 1) >= pickaxe.minLevel;
            const hasBalance = balance >= pickaxe.price;
            
            const button = new ButtonBuilder()
                .setCustomId(`buy_${pickaxe.id}`)
                .setLabel(`${pickaxe.name} - ${pickaxe.price.toLocaleString('id-ID')}`)
                .setStyle(canBuy && hasBalance ? ButtonStyle.Success : canBuy ? ButtonStyle.Secondary : ButtonStyle.Danger)
                .setEmoji(pickaxe.emoji)
                .setDisabled(!canBuy || !hasBalance);
            
            buttons.push(button);
        }
        
        // Add backpack buttons
        for (const backpack of backpacks) {
            const canBuy = !backpack.minLevel || (userData?.level || 1) >= backpack.minLevel;
            const hasBalance = balance >= backpack.price;
            
            const button = new ButtonBuilder()
                .setCustomId(`buy_${backpack.id}`)
                .setLabel(`${backpack.name} - ${backpack.price.toLocaleString('id-ID')}`)
                .setStyle(canBuy && hasBalance ? ButtonStyle.Success : canBuy ? ButtonStyle.Secondary : ButtonStyle.Danger)
                .setEmoji(backpack.emoji)
                .setDisabled(!canBuy || !hasBalance);
            
            buttons.push(button);
        }

        // Split buttons into rows (max 5 per row)
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: rows 
        });

        // Create collector for button interactions
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i: ButtonInteraction) => 
                i.user.id === interaction.user.id && i.customId.startsWith('buy_'),
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            const itemId = i.customId.replace('buy_', '');
            const storeItem = STORE_ITEMS.find(item => item.id === itemId);

            if (!storeItem) {
                await i.reply({ content: '❌ Item tidak ditemukan!', flags: 64 });
                return;
            }

            // Re-check conditions
            const currentUserData = getMiningUser(userId);
            const currentBalance = getUserBalance(userId);

            if (!currentUserData) {
                await i.reply({ content: '❌ Data user tidak ditemukan!', flags: 64 });
                return;
            }

            // Check level requirement
            if (storeItem.minLevel && currentUserData.level < storeItem.minLevel) {
                await i.reply({ 
                    content: `❌ Anda memerlukan level ${storeItem.minLevel} untuk membeli item ini!`, 
                    flags: 64 
                });
                return;
            }

            // Check if user already has this equipment
            const currentEquipment = storeItem.type === 'pickaxe' ? currentUserData.pickaxe : currentUserData.backpack;
            if (currentEquipment === itemId) {
                await i.reply({ 
                    content: `⚠️ Anda sudah memiliki ${storeItem.name}!`, 
                    flags: 64 
                });
                return;
            }

            // Check balance
            if (currentBalance < storeItem.price) {
                await i.reply({ 
                    content: `❌ Saldo tidak cukup! Dibutuhkan: ${storeItem.price.toLocaleString('id-ID')} coins`, 
                    flags: 64 
                });
                return;
            }

            // Purchase item
            subtractUserBalance(userId, storeItem.price);
            updateMiningEquipment(userId, storeItem.type, itemId);
            addTransaction(userId, 'buy', -storeItem.price, `Membeli ${storeItem.name}`);

            const newBalance = getUserBalance(userId);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Pembelian Berhasil!')
                .setDescription(`Anda berhasil membeli ${storeItem.emoji} **${storeItem.name}**!`)
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '💰 Harga',
                        value: `${storeItem.price.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '💵 Saldo Sekarang',
                        value: `${newBalance.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '📝 Deskripsi',
                        value: storeItem.description,
                        inline: false
                    }
                )
                .setTimestamp();

            await i.reply({ embeds: [successEmbed], flags: 64 });
            
            // Update store message with new balance
            const updatedEmbed = embed.setFields(
                {
                    name: '💵 Saldo Anda',
                    value: `${newBalance.toLocaleString('id-ID')} coins`,
                    inline: true
                },
                {
                    name: '📊 Level Anda',
                    value: `Level ${currentUserData.level}`,
                    inline: true
                },
                ...embed.data.fields?.slice(2) || []
            );

            // Update button states
            const updatedButtons: ButtonBuilder[] = [];
            for (const item of STORE_ITEMS) {
                const canBuy = !item.minLevel || currentUserData.level >= (item.minLevel || 0);
                const hasBalance = newBalance >= item.price;
                const isOwned = (item.type === 'pickaxe' ? currentUserData.pickaxe : currentUserData.backpack) === item.id;
                
                const button = new ButtonBuilder()
                    .setCustomId(`buy_${item.id}`)
                    .setLabel(`${item.name} - ${item.price.toLocaleString('id-ID')}`)
                    .setStyle(canBuy && hasBalance && !isOwned ? ButtonStyle.Success : canBuy ? ButtonStyle.Secondary : ButtonStyle.Danger)
                    .setEmoji(item.emoji)
                    .setDisabled(!canBuy || !hasBalance || isOwned);
                
                updatedButtons.push(button);
            }

            const updatedRows: ActionRowBuilder<ButtonBuilder>[] = [];
            for (let i = 0; i < updatedButtons.length; i += 5) {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(updatedButtons.slice(i, i + 5));
                updatedRows.push(row);
            }

            await interaction.editReply({ embeds: [updatedEmbed], components: updatedRows });
        });

        collector.on('end', async () => {
            // Disable all buttons when collector ends
            const disabledButtons = buttons.map(btn => btn.setDisabled(true));
            const disabledRows: ActionRowBuilder<ButtonBuilder>[] = [];
            for (let i = 0; i < disabledButtons.length; i += 5) {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(disabledButtons.slice(i, i + 5));
                disabledRows.push(row);
            }

            try {
                await interaction.editReply({ components: disabledRows });
            } catch (error) {
                // Message might have been deleted
                console.error('Error disabling buttons:', error);
            }
        });
    },
};

// Export store items for use in buy command
export { STORE_ITEMS };
