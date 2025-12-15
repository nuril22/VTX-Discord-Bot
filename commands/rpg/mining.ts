import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { 
    getMiningUser, 
    addMiningXP, 
    setLastMiningTime, 
    getLastMiningTime,
    addMiningInventoryItem,
    isMiningUserRegistered,
    getMiningInventory
} from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

// Base cooldown: 2 menit (120 detik)
const BASE_COOLDOWN_MS = 2 * 60 * 1000;
// Max cooldown: 2 jam (7200 detik)
const MAX_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Ore types dengan rarity, XP, dan sell price
interface Ore {
    name: string;
    emoji: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    baseXP: number;
    basePrice: number;
    minLevel: number;
    chance: number; // Percentage chance (0-100)
}

const ORES: Ore[] = [
    { name: 'Batu', emoji: '🪨', rarity: 'common', baseXP: 1, basePrice: 5, minLevel: 1, chance: 40 },
    { name: 'Besi', emoji: '⚙️', rarity: 'common', baseXP: 2, basePrice: 10, minLevel: 1, chance: 30 },
    { name: 'Emas', emoji: '🥇', rarity: 'uncommon', baseXP: 5, basePrice: 25, minLevel: 3, chance: 15 },
    { name: 'Perak', emoji: '🥈', rarity: 'uncommon', baseXP: 4, basePrice: 20, minLevel: 2, chance: 8 },
    { name: 'Diamond', emoji: '💎', rarity: 'rare', baseXP: 15, basePrice: 100, minLevel: 5, chance: 4 },
    { name: 'Ruby', emoji: '❤️', rarity: 'epic', baseXP: 25, basePrice: 200, minLevel: 10, chance: 2 },
    { name: 'Sapphire', emoji: '💙', rarity: 'epic', baseXP: 30, basePrice: 250, minLevel: 12, chance: 1.5 },
    { name: 'Emerald', emoji: '💚', rarity: 'legendary', baseXP: 50, basePrice: 500, minLevel: 15, chance: 0.5 },
];

// Pickaxe bonuses
const PICKAXE_BONUSES: Record<string, { speed: number; luck: number; name: string }> = {
    wooden_pickaxe: { speed: 1, luck: 0, name: 'Pickaxe Kayu' },
    stone_pickaxe: { speed: 1.2, luck: 5, name: 'Pickaxe Batu' },
    iron_pickaxe: { speed: 1.5, luck: 10, name: 'Pickaxe Besi' },
    gold_pickaxe: { speed: 2, luck: 15, name: 'Pickaxe Emas' },
    diamond_pickaxe: { speed: 3, luck: 25, name: 'Pickaxe Diamond' },
};

// Backpack capacities
const BACKPACK_CAPACITIES: Record<string, number> = {
    basic_backpack: 10,
    medium_backpack: 30,
    large_backpack: 60,
    epic_backpack: 120,
};

// Calculate cooldown based on level (2 menit base, increases with level, max 2 jam)
function calculateCooldown(level: number): number {
    // Cooldown increases by 1 menit per 10 levels, capped at 2 jam
    const additionalMinutes = Math.min(Math.floor(level / 10), 118); // Max 118 menit additional (120 total = 2 jam)
    return BASE_COOLDOWN_MS + (additionalMinutes * 60 * 1000);
}

// Get mined ore
function getMinedOre(level: number, pickaxe: string): Ore {
    const pickaxeBonus = PICKAXE_BONUSES[pickaxe] || PICKAXE_BONUSES.wooden_pickaxe;
    const luckBonus = pickaxeBonus.luck;
    
    // Filter ores by level requirement
    const availableOres = ORES.filter(ore => ore.minLevel <= level);
    
    // Adjust chances with luck bonus
    const adjustedOres = availableOres.map(ore => ({
        ...ore,
        adjustedChance: ore.chance + (luckBonus * (ore.chance / 100))
    }));
    
    // Total chance
    const totalChance = adjustedOres.reduce((sum, ore) => sum + ore.adjustedChance, 0);
    
    // Random roll
    let roll = Math.random() * totalChance;
    
    for (const ore of adjustedOres) {
        roll -= ore.adjustedChance;
        if (roll <= 0) {
            return ore;
        }
    }
    
    // Fallback to first available ore
    return availableOres[0];
}

function calculateXP(ore: Ore, level: number): number {
    // Higher level = more XP bonus
    const levelBonus = 1 + (level * 0.05);
    const xp = Math.floor(ore.baseXP * levelBonus);
    // Ensure minimum 1 XP
    return Math.max(1, xp);
}

export default {
    category: 'rpg',
    data: new SlashCommandBuilder()
        .setName('mining')
        .setDescription('Ambil ore yang terkumpul dari mining AFK'),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const userId = interaction.user.id;

        // Check if user is registered in mining system
        if (!isMiningUserRegistered(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Belum Terdaftar')
                .setDescription('Anda harus mendaftar dulu dengan `/rpg-register` sebelum bisa mining!')
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

        // Get user data
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

        const { level, pickaxe, last_mining, mining_speed_bonus, rebirth_count } = userData;
        const now = Date.now();
        const lastMiningTime = last_mining || now;
        
        // Calculate cooldown with level and rebirth bonus
        const baseCooldown = calculateCooldown(level);
        const speedBonus = 1 + (mining_speed_bonus / 100); // Convert percentage to multiplier
        const actualCooldown = Math.floor(baseCooldown / speedBonus);
        
        // Calculate time passed since last mining
        const timePassed = now - lastMiningTime;
        
        // Calculate next full cooldown timestamp for Discord
        const nextFullCooldown = lastMiningTime + actualCooldown;
        const nextFullCooldownSeconds = Math.floor(nextFullCooldown / 1000);
        
        // Check if mining early (before full cooldown)
        const isEarlyMining = timePassed < actualCooldown;
        const progress = isEarlyMining ? (timePassed / actualCooldown) * 100 : 100;
        const penaltyMultiplier = isEarlyMining ? Math.max(0.3, progress / 100) : 1.0; // Minimum 30% even if very early
        
        // Check backpack capacity before mining
        const inventory = getMiningInventory(userId);
        const currentItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
        const capacity = BACKPACK_CAPACITIES[userData.backpack] || BACKPACK_CAPACITIES.basic_backpack;
        
        // Calculate ore amount based on time passed (more fair system)
        // Base: 1 ore per 24 seconds (5 ore per 2 minutes cooldown)
        // Formula: ore = (timePassed / 24000) dengan minimum dan maksimal yang wajar
        const baseOrePerSecond = 1 / 24; // 1 ore per 24 seconds
        let calculatedOre = Math.floor(timePassed / 24000); // Convert to ore count
        
        // Apply minimum and maximum bounds
        if (isEarlyMining) {
            // Early mining: minimum 1-3 ore based on progress, maximum based on time
            const progressRatio = timePassed / actualCooldown;
            const minOre = Math.max(1, Math.floor(progressRatio * 3)); // 1-3 ore minimum based on progress
            const maxOre = Math.floor(progressRatio * 10); // Up to 10 ore if almost full
            calculatedOre = Math.max(minOre, Math.min(calculatedOre, maxOre));
        } else {
            // Full cooldown: base 5 ore per full cycle, plus bonus for waiting longer
            const fullCycles = Math.floor(timePassed / actualCooldown);
            const baseOrePerCycle = 5; // Base 5 ore per full cooldown
            const bonusOre = Math.floor((timePassed % actualCooldown) / 24000); // Bonus for partial cycle
            calculatedOre = (fullCycles * baseOrePerCycle) + bonusOre;
            // Cap at reasonable amount (max 100 ore for very long wait)
            calculatedOre = Math.min(calculatedOre, 100);
        }
        
        // Ensure minimum 1 ore
        let miningCycles = Math.max(1, calculatedOre);
        
        // Estimate how many ore will be mined (worst case: all different types)
        const estimatedOreCount = miningCycles;
        
        // Check if backpack has enough space
        if (currentItems >= capacity) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Backpack Penuh!')
                .setDescription(`Backpack Anda sudah penuh! Jual beberapa ore terlebih dahulu sebelum mining.`)
                .setColor(0xFF0000)
                .addFields(
                    {
                        name: '📦 Kapasitas',
                        value: `${currentItems}/${capacity} slot`,
                        inline: true
                    },
                    {
                        name: '💡 Tips',
                        value: `Gunakan \`/sell ore: Semua Ore\` untuk menjual semua ore, atau \`/sell\` untuk menjual ore tertentu.`,
                        inline: false
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        // Check if estimated ore will exceed capacity
        const availableSpace = capacity - currentItems;
        if (estimatedOreCount > availableSpace) {
            // Reduce mining cycles to fit available space
            miningCycles = Math.max(1, availableSpace);
            
            // Show warning but continue with reduced cycles
            const warningEmbed = new EmbedBuilder()
                .setTitle('⚠️ Backpack Hampir Penuh')
                .setDescription(
                    `Backpack Anda hampir penuh! Hanya bisa mining ${miningCycles} ore karena keterbatasan space.`
                )
                .setColor(0xFFA500)
                .addFields(
                    {
                        name: '📦 Space Tersedia',
                        value: `${availableSpace}/${capacity} slot`,
                        inline: true
                    },
                    {
                        name: '💡 Tips',
                        value: `Jual beberapa ore dengan \`/sell\` untuk mendapatkan lebih banyak space!`,
                        inline: false
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [warningEmbed] });
            // Continue with reduced mining cycles
        }
        
        // Mine ore for each cycle (with penalty if early)
        const oreResults: Record<string, number> = {};
        let totalXP = 0;
        
        for (let i = 0; i < miningCycles; i++) {
            const minedOre = getMinedOre(level, pickaxe);
            const xpGained = calculateXP(minedOre, level);
            
            // Add to results
            if (!oreResults[minedOre.name]) {
                oreResults[minedOre.name] = 0;
            }
            
            // Apply penalty if early mining
            if (isEarlyMining) {
                // Early mining: guaranteed ore but with reduced XP
                oreResults[minedOre.name]++;
                totalXP += Math.floor(xpGained * penaltyMultiplier);
            } else {
                // Full cycles - normal amount
                oreResults[minedOre.name]++;
                totalXP += xpGained;
            }
        }
        
        // Ensure minimum ore amount (guaranteed at least 3-5 ore)
        const totalOreCount = Object.values(oreResults).reduce((sum, qty) => sum + qty, 0);
        if (totalOreCount === 0) {
            // Guaranteed minimum ore
            const minOreCount = isEarlyMining ? 3 : 5;
            for (let i = 0; i < minOreCount; i++) {
                const minedOre = getMinedOre(level, pickaxe);
                const xpGained = calculateXP(minedOre, level);
                if (!oreResults[minedOre.name]) {
                    oreResults[minedOre.name] = 0;
                }
                oreResults[minedOre.name]++;
                totalXP += isEarlyMining ? Math.max(1, Math.floor(xpGained * penaltyMultiplier)) : xpGained;
            }
        }
        
        // Ensure minimum XP (at least 1 XP per ore)
        if (totalXP === 0 && totalOreCount > 0) {
            // If somehow totalXP is 0 but we have ore, give minimum XP
            totalXP = Math.max(1, totalOreCount);
        }

        // Check capacity again before adding ores (final check)
        const finalInventory = getMiningInventory(userId);
        const finalCurrentItems = finalInventory.reduce((sum, item) => sum + item.quantity, 0);
        const finalAvailableSpace = capacity - finalCurrentItems;
        
        // Add ores to inventory, respecting capacity
        let totalAdded = 0;
        for (const [oreName, quantity] of Object.entries(oreResults)) {
            if (totalAdded >= finalAvailableSpace) {
                break; // Stop if no more space
            }
            
            const remainingSpace = finalAvailableSpace - totalAdded;
            const addQuantity = Math.min(quantity, remainingSpace);
            
            if (addQuantity > 0) {
                addMiningInventoryItem(userId, oreName, addQuantity);
                totalAdded += addQuantity;
            }
        }
        
        // Calculate total ore mined and adjust XP if some were lost
        const totalOreMined = Object.values(oreResults).reduce((sum, qty) => sum + qty, 0);
        const lostOre = Math.max(0, totalOreMined - totalAdded);
        
        // Adjust XP based on actual ore added (if some were lost)
        if (lostOre > 0 && totalOreMined > 0) {
            const xpRatio = totalAdded / totalOreMined;
            totalXP = Math.floor(totalXP * xpRatio);
        }

        // Ensure totalXP is valid (at least 1)
        const finalTotalXP = Math.max(1, Math.floor(totalXP));
        
        // Add XP
        const { level: newLevel, xp: newXP, leveledUp } = addMiningXP(userId, finalTotalXP);
        
        console.log(`[MINING] User ${userId}: Added ${finalTotalXP} XP (was ${totalXP}), New level: ${newLevel}, New XP: ${newXP}`);

        // Update last mining time
        setLastMiningTime(userId, now);

        // Format ore results (show what was actually added)
        let oreText = '';
        const finalInventoryAfter = getMiningInventory(userId);
        const oreAdded: Record<string, number> = {};
        
        // Calculate what was actually added by comparing before/after
        for (const item of finalInventoryAfter) {
            const beforeQty = inventory.find(i => i.item_name === item.item_name)?.quantity || 0;
            const afterQty = item.quantity;
            const added = afterQty - beforeQty;
            if (added > 0) {
                oreAdded[item.item_name] = added;
            }
        }
        
        // If no ore was added (all were duplicates), show original results
        if (Object.keys(oreAdded).length === 0) {
            for (const [oreName, quantity] of Object.entries(oreResults)) {
                const ore = ORES.find(o => o.name === oreName);
                const emoji = ore?.emoji || '⚪';
                oreText += `${emoji} **${oreName}** x${quantity}\n`;
            }
        } else {
            for (const [oreName, quantity] of Object.entries(oreAdded)) {
                const ore = ORES.find(o => o.name === oreName);
                const emoji = ore?.emoji || '⚪';
                oreText += `${emoji} **${oreName}** x${quantity}\n`;
            }
        }
        
        // Calculate total ore actually added (for display)
        const totalOreAdded = Object.keys(oreAdded).length > 0 
            ? Object.values(oreAdded).reduce((sum, qty) => sum + qty, 0)
            : totalAdded;
        
        // Recalculate lostOre based on actual added (more accurate)
        const actualLostOre = Math.max(0, totalOreMined - totalOreAdded);

        // Calculate next cooldown timestamp
        const nextCooldownSeconds = Math.floor((now + actualCooldown) / 1000);
        
        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(isEarlyMining ? '⛏️ Mining (Early) Berhasil!' : '⛏️ Mining AFK Berhasil!')
            .setDescription(
                isEarlyMining 
                    ? `Anda mengambil ore sebelum cooldown penuh! (${Math.floor(penaltyMultiplier * 100)}% dari normal)`
                    : `Anda mengambil ore yang terkumpul selama AFK!`
            )
            .setColor(isEarlyMining ? 0xFFA500 : 0x00FF00)
            .addFields(
                {
                    name: '📦 Ore yang Didapat',
                    value: oreText || 'Tidak ada ore',
                    inline: false
                },
                {
                    name: '⭐ Total XP Diterima',
                    value: `+${finalTotalXP} XP${isEarlyMining ? ` (${Math.floor(penaltyMultiplier * 100)}%)` : ''}`,
                    inline: true
                },
                {
                    name: '📊 Level & XP',
                    value: `Level ${newLevel} (${newXP}/${newLevel * 100} XP)`,
                    inline: true
                },
                {
                    name: '⏱️ Cooldown',
                    value: `${Math.floor(actualCooldown / 60000)} menit\nFull: <t:${nextCooldownSeconds}:R> (<t:${nextCooldownSeconds}:t>)`,
                    inline: true
                }
            );

        if (leveledUp) {
            embed.addFields({
                name: '🎉 Level Up!',
                value: `Selamat! Anda naik ke level ${newLevel}!`,
                inline: false
            });
        }

        // Suggest rebirth at level 100
        if (newLevel >= 100 && newLevel % 100 === 0) {
            embed.addFields({
                name: '💡 Saran Rebirth',
                value: `Anda sudah mencapai level ${newLevel}! Pertimbangkan untuk menggunakan \`/rebirth\` untuk mendapatkan bonus mining speed dan sell bonus.`,
                inline: false
            });
        }

        // Add warning if some ore was lost due to capacity
        if (actualLostOre > 0) {
            embed.addFields({
                name: '⚠️ Backpack Penuh!',
                value: `**${actualLostOre} ore** tidak bisa ditambahkan karena backpack penuh!\nGunakan \`/sell\` untuk menjual ore terlebih dahulu.`,
                inline: false
            });
            embed.setColor(0xFFA500); // Change to warning color
        }
        
        // Add backpack capacity info
        const finalInventoryCheck = getMiningInventory(userId);
        const finalItemsCount = finalInventoryCheck.reduce((sum, item) => sum + item.quantity, 0);
        embed.addFields({
            name: '🎒 Backpack',
            value: `${finalItemsCount}/${capacity} slot digunakan`,
            inline: true
        });

        if (rebirth_count > 0) {
            embed.addFields({
                name: '✨ Rebirth Bonus',
                value: `Rebirth: ${rebirth_count}x | Mining Speed: +${mining_speed_bonus}% | Sell Bonus: +${userData.sell_bonus}%`,
                inline: false
            });
        }

        embed.setTimestamp()
            .setFooter({
                text: getFooterText(`Mining dengan ${PICKAXE_BONUSES[pickaxe]?.name || 'Pickaxe Kayu'} | ${miningCycles} cycle${miningCycles > 1 ? 's' : ''} terkumpul`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        await interaction.editReply({ embeds: [embed] });
    },
};
