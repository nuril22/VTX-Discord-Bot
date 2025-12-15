import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChatInputCommandInteraction, 
    Client,
    PresenceStatus,
    UserFlags,
    ActivityType
} from 'discord.js';
import { getWarningCount } from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

// Helper function to format date
function formatDate(date: Date): string {
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Helper function to get relative time
function getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} tahun yang lalu`;
    if (months > 0) return `${months} bulan yang lalu`;
    if (days > 0) return `${days} hari yang lalu`;
    if (hours > 0) return `${hours} jam yang lalu`;
    if (minutes > 0) return `${minutes} menit yang lalu`;
    return 'Baru saja';
}

// Helper function to get status emoji
function getStatusEmoji(status: PresenceStatus | null | undefined): string {
    switch (status) {
        case 'online': return '🟢';
        case 'idle': return '🟡';
        case 'dnd': return '🔴';
        case 'invisible': return '⚫';
        default: return '⚪';
    }
}

// Helper function to get status text
function getStatusText(status: PresenceStatus | null | undefined): string {
    switch (status) {
        case 'online': return 'Online';
        case 'idle': return 'Idle';
        case 'dnd': return 'Do Not Disturb';
        case 'invisible': return 'Offline';
        default: return 'Tidak diketahui';
    }
}

// Helper function to get user badges
function getUserBadges(user: any): string[] {
    const badges: string[] = [];
    
    if (user.flags) {
        if (user.flags.has(UserFlags.Staff)) badges.push('👨‍💼 Discord Staff');
        if (user.flags.has(UserFlags.Partner)) badges.push('🤝 Partner');
        if (user.flags.has(UserFlags.Hypesquad)) badges.push('🎉 HypeSquad Events');
        if (user.flags.has(UserFlags.BugHunterLevel1)) badges.push('🐛 Bug Hunter');
        if (user.flags.has(UserFlags.BugHunterLevel2)) badges.push('🐛 Bug Hunter Gold');
        if (user.flags.has(UserFlags.PremiumEarlySupporter)) badges.push('⭐ Early Supporter');
        if (user.flags.has(UserFlags.VerifiedDeveloper)) badges.push('👨‍💻 Verified Developer');
        if (user.flags.has(UserFlags.CertifiedModerator)) badges.push('🛡️ Certified Moderator');
        if (user.flags.has(UserFlags.ActiveDeveloper)) badges.push('⚡ Active Developer');
        if (user.flags.has(UserFlags.HypeSquadOnlineHouse1)) badges.push('💎 Bravery');
        if (user.flags.has(UserFlags.HypeSquadOnlineHouse2)) badges.push('💎 Brilliance');
        if (user.flags.has(UserFlags.HypeSquadOnlineHouse3)) badges.push('💎 Balance');
    }
    
    return badges;
}

export default {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Menampilkan informasi lengkap tentang user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang ingin dilihat informasinya')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guild = interaction.guild;

        // Get member if in guild
        const member = guild ? await guild.members.fetch(targetUser.id).catch(() => null) : null;

        // Get user status
        const presence = member?.presence;
        const status = presence?.status || null;
        const activities = presence?.activities || [];

        // Get account creation date
        const accountCreated = targetUser.createdAt;
        const accountCreatedRelative = getRelativeTime(accountCreated);

        // Get server join date
        const joinedAt = member?.joinedAt;
        const joinedAtRelative = joinedAt ? getRelativeTime(joinedAt) : null;

        // Get roles
        const roles = member?.roles.cache
            .filter(role => role.id !== guild?.id) // Remove @everyone role
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 20) || [];

        // Get permissions
        const permissions = member?.permissions;
        const keyPermissions: string[] = [];
        if (permissions) {
            if (permissions.has('Administrator')) keyPermissions.push('Administrator');
            if (permissions.has('ManageGuild')) keyPermissions.push('Manage Server');
            if (permissions.has('ManageChannels')) keyPermissions.push('Manage Channels');
            if (permissions.has('ManageMessages')) keyPermissions.push('Manage Messages');
            if (permissions.has('KickMembers')) keyPermissions.push('Kick Members');
            if (permissions.has('BanMembers')) keyPermissions.push('Ban Members');
            if (permissions.has('ModerateMembers')) keyPermissions.push('Moderate Members');
        }

        // Get badges
        const badges = getUserBadges(targetUser);

        // Get warnings count if in guild
        let warningCount = 0;
        if (guild) {
            warningCount = getWarningCount(guild.id, targetUser.id);
        }

        // Build embed
        const embed = new EmbedBuilder()
            .setTitle(`👤 Informasi User - ${targetUser.tag}`)
            .setColor(member?.displayColor || 0x5865F2)
            .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false, size: 256 }) || null)
            .setImage(targetUser.bannerURL({ size: 512 }) || null)
            .addFields(
                {
                    name: '🆔 ID',
                    value: `\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '🤖 Bot',
                    value: targetUser.bot ? '✅ Ya' : '❌ Tidak',
                    inline: true
                },
                {
                    name: `${getStatusEmoji(status)} Status`,
                    value: getStatusText(status),
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({
                text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

        // Add account creation date
        const accountCreatedTimestamp = Math.floor(accountCreated.getTime() / 1000);
        embed.addFields({
            name: '📅 Akun Dibuat',
            value: `<t:${accountCreatedTimestamp}:f> (<t:${accountCreatedTimestamp}:R>)`,
            inline: true
        });

        // Add server join date if in guild
        if (joinedAt) {
            const timestamp = Math.floor(joinedAt.getTime() / 1000);
            embed.addFields({
                name: '📥 Bergabung Server',
                value: `<t:${timestamp}:f> (<t:${timestamp}:R>)`,
                inline: true
            });
        }

        // Add badges if any
        if (badges.length > 0) {
            embed.addFields({
                name: '🏆 Badges',
                value: badges.join('\n'),
                inline: false
            });
        }

        // Add roles if in guild
        if (roles.length > 0) {
            const rolesText = roles.length > 10 
                ? `${roles.slice(0, 10).join(', ')} dan ${roles.length - 10} role lainnya`
                : roles.join(', ');
            
            embed.addFields({
                name: `👥 Roles [${roles.length}]`,
                value: rolesText || 'Tidak ada roles',
                inline: false
            });
        }

        // Add key permissions if in guild
        if (keyPermissions.length > 0) {
            embed.addFields({
                name: '🔐 Key Permissions',
                value: keyPermissions.join(', '),
                inline: false
            });
        }

        // Add activities if any
        if (activities.length > 0) {
            const activityText = activities
                .map(activity => {
                    let typeEmoji = '📌';
                    if (activity.type === ActivityType.Playing) typeEmoji = '🎮';
                    else if (activity.type === ActivityType.Streaming) typeEmoji = '📺';
                    else if (activity.type === ActivityType.Listening) typeEmoji = '🎵';
                    else if (activity.type === ActivityType.Watching) typeEmoji = '👀';
                    else if (activity.type === ActivityType.Competing) typeEmoji = '🏆';
                    else if (activity.type === ActivityType.Custom) typeEmoji = '💬';
                    
                    return `${typeEmoji} ${activity.name}${activity.details ? ` - ${activity.details}` : ''}`;
                })
                .join('\n');
            
            embed.addFields({
                name: '🎯 Aktivitas',
                value: activityText,
                inline: false
            });
        }

        // Add warnings if in guild
        if (guild && warningCount > 0) {
            embed.addFields({
                name: '⚠️ Warnings',
                value: `${warningCount} warning${warningCount > 1 ? 's' : ''}`,
                inline: true
            });
        }

        // Add highest role if in guild
        if (member && member.roles.highest.id !== guild?.id) {
            embed.addFields({
                name: '⭐ Highest Role',
                value: member.roles.highest.toString(),
                inline: true
            });
        }

        // Add nickname if in guild
        if (member?.nickname) {
            embed.addFields({
                name: '📝 Nickname',
                value: member.nickname,
                inline: true
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

