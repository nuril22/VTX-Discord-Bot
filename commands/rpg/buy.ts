import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { 
    getUserBalance, 
    subtractUserBalance, 
    updateMiningEquipment,
    getMiningUser,
    addTransaction,
    isMiningUserRegistered
} from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';
import { STORE_ITEMS } from './store.js';

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Beli item dari toko')
        .addStringOption(option =>
            option
                .setName('item')
                .setDescription('Nama item yang ingin dibeli')
                .setRequired(true)
                .addChoices(
                    { name: 'Pickaxe Batu', value: 'stone_pickaxe' },
                    { name: 'Pickaxe Besi', value: 'iron_pickaxe' },
                    { name: 'Pickaxe Emas', value: 'gold_pickaxe' },
                    { name: 'Pickaxe Diamond', value: 'diamond_pickaxe' },
                    { name: 'Backpack Sedang', value: 'medium_backpack' },
                    { name: 'Backpack Besar', value: 'large_backpack' },
                    { name: 'Backpack Epic', value: 'epic_backpack' }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered in mining system
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa membeli!')
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

        const itemId = interaction.options.getString('item', true);
        const storeItem = STORE_ITEMS.find(item => item.id === itemId);

        if (!storeItem) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Item Tidak Ditemukan')
                .setDescription('Item yang Anda cari tidak ditemukan di toko!')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check level requirement
        const userData = getMiningUser(userId);
        if (!userData) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Data mining user tidak ditemukan. Silakan gunakan `/rpg-register` untuk mendaftar.')
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

        if (storeItem.minLevel && userData.level < storeItem.minLevel) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Level Tidak Cukup')
                .setDescription(`Anda memerlukan level ${storeItem.minLevel} untuk membeli item ini!`)
                .addFields({
                    name: '📊 Level Anda',
                    value: `Level ${userData.level}`,
                    inline: false
                })
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if user already has this equipment
        const currentEquipment = storeItem.type === 'pickaxe' ? userData.pickaxe : userData.backpack;
        if (currentEquipment === itemId) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Sudah Memiliki Item Ini')
                .setDescription(`Anda sudah memiliki ${storeItem.name}!`)
                .setColor(0xFFA500)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check balance
        const balance = getUserBalance(userId);
        if (balance < storeItem.price) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Saldo Tidak Cukup')
                .setDescription(`Anda tidak memiliki cukup coins untuk membeli item ini!`)
                .addFields(
                    {
                        name: '💰 Harga Item',
                        value: `${storeItem.price.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '💵 Saldo Anda',
                        value: `${balance.toLocaleString('id-ID')} coins`,
                        inline: true
                    },
                    {
                        name: '💸 Kekurangan',
                        value: `${(storeItem.price - balance).toLocaleString('id-ID')} coins`,
                        inline: false
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Purchase item
        subtractUserBalance(userId, storeItem.price);
        updateMiningEquipment(userId, storeItem.type, itemId);
        addTransaction(userId, 'buy', -storeItem.price, `Membeli ${storeItem.name}`);

        const newBalance = getUserBalance(userId);

        const embed = new EmbedBuilder()
            .setTitle('✅ Pembelian Berhasil!')
            .setDescription(`Anda berhasil membeli ${storeItem.emoji} **${storeItem.name}**!`)
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
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({
                text: getFooterText(`Gunakan /mining untuk menggunakan ${storeItem.type === 'pickaxe' ? 'pickaxe baru' : 'backpack baru'} Anda!`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
