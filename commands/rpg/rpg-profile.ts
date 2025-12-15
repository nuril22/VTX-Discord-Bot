import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { getMiningUser, isMiningUserRegistered, getMiningInventory } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

const PICKAXE_NAMES: Record<string, string> = {
    wooden_pickaxe: 'Pickaxe Kayu',
    stone_pickaxe: 'Pickaxe Batu',
    iron_pickaxe: 'Pickaxe Besi',
    gold_pickaxe: 'Pickaxe Emas',
    diamond_pickaxe: 'Pickaxe Diamond',
};

const BACKPACK_NAMES: Record<string, string> = {
    basic_backpack: 'Backpack Dasar',
    medium_backpack: 'Backpack Sedang',
    large_backpack: 'Backpack Besar',
    epic_backpack: 'Backpack Epic',
};

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('rpg-profile')
        .setDescription('Lihat kartu identitas RPG Anda'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa melihat profil RPG!')
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
            throw new Error('Failed to get mining user data');
        }

        const { level, xp, pickaxe, backpack, created_at } = userData;
        
        // Calculate required XP for next level
        const requiredXP = level * 100;
        const xpProgress = xp;
        const xpPercentage = Math.floor((xpProgress / requiredXP) * 100);

        // Get inventory stats
        const inventory = getMiningInventory(userId);
        const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);

        // Format created date
        const createdDate = new Date(created_at * 1000);
        const formattedDate = createdDate.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Create profile embed
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Kartu Identitas RPG')
            .setDescription(`**Profil RPG dari ${interaction.user.username}**`)
            .setColor(0x9B59B6)
            .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false, size: 256 }) || null)
            .addFields(
                {
                    name: '👤 Username',
                    value: `\`${interaction.user.username}\``,
                    inline: true
                },
                {
                    name: '🆔 User ID',
                    value: `\`${userId}\``,
                    inline: true
                },
                {
                    name: '📅 Kartu Dibuat',
                    value: `\`${formattedDate}\``,
                    inline: false
                },
                {
                    name: '📊 Level & XP',
                    value: `**Level ${level}**\n\`${xpProgress}/${requiredXP} XP\` (${xpPercentage}%)`,
                    inline: true
                },
                {
                    name: '⛏️ Pickaxe',
                    value: `\`${PICKAXE_NAMES[pickaxe] || pickaxe}\``,
                    inline: true
                },
                {
                    name: '🎒 Backpack',
                    value: `\`${BACKPACK_NAMES[backpack] || backpack}\``,
                    inline: true
                },
                {
                    name: '📦 Inventory',
                    value: `**${totalItems}** item${totalItems !== 1 ? 's' : ''} di inventory`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: getFooterText(`Gunakan /mining untuk mulai mining! ⛏️`), 
                iconURL: client.user?.displayAvatarURL({ forceStatic: false }) || undefined 
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
