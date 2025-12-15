import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getMiningUser, getMiningInventory, isMiningUserRegistered } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

const BACKPACK_CAPACITIES: Record<string, number> = {
    basic_backpack: 10,
    medium_backpack: 30,
    large_backpack: 60,
    epic_backpack: 120,
};

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('backpack')
        .setDescription('Lihat inventory hasil mining Anda'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered in mining system
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa melihat backpack!')
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

        const userData = getMiningUser(userId);
        
        if (!userData) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Data mining user tidak ditemukan. Silakan gunakan `/rpg-register` untuk mendaftar.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const { backpack } = userData;
        const capacity = BACKPACK_CAPACITIES[backpack] || BACKPACK_CAPACITIES.basic_backpack;
        
        const inventory = getMiningInventory(userId);
        const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
        
        // Ore emojis mapping
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

        const embed = new EmbedBuilder()
            .setTitle('🎒 Backpack Anda')
            .setDescription(`**Kapasitas:** ${totalItems}/${capacity} slot`)
            .setColor(0x5865F2)
            .setTimestamp();

        if (inventory.length === 0) {
            embed.addFields({
                name: '📦 Inventory Kosong',
                value: 'Anda belum memiliki ore apapun. Gunakan `/mining` untuk mulai mining!',
                inline: false
            });
        } else {
            // Group items and format
            let inventoryText = '';
            for (const item of inventory) {
                const emoji = oreEmojis[item.item_name] || '⚪';
                inventoryText += `${emoji} **${item.item_name}** x${item.quantity}\n`;
            }
            
            embed.addFields({
                name: '📦 Inventory',
                value: inventoryText,
                inline: false
            });
        }

        embed.addFields({
            name: '🎒 Backpack Saat Ini',
            value: getBackpackName(backpack),
            inline: true
        });

        embed.setFooter({
            text: `Gunakan /sell untuk menjual ore | Gunakan /buy untuk upgrade backpack`,
            iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
        });

        await interaction.editReply({ embeds: [embed] });
    },
};

function getBackpackName(backpackId: string): string {
    const names: Record<string, string> = {
        basic_backpack: 'Backpack Dasar',
        medium_backpack: 'Backpack Sedang',
        large_backpack: 'Backpack Besar',
        epic_backpack: 'Backpack Epic',
    };
    return names[backpackId] || 'Backpack Dasar';
}
