// Bot settings untuk nama bot dan footer
// File ini dapat diubah untuk mengatur nama bot dan footer text
//
// CARA MENGGUNAKAN:
// 1. Import getFooterText di command file:
//    import { getFooterText } from '../../settings/bot.js';
//
// 2. Gunakan di embed footer:
//    .setFooter({
//        text: getFooterText(`Diminta oleh ${user.tag}`),
//        iconURL: user.displayAvatarURL({ forceStatic: false }) || undefined
//    });
//
// 3. Untuk mengubah nama bot atau footer, edit botConfig di bawah ini

export interface BotConfig {
    name: string;
    footerText: string;
}

// Default bot configuration
export const botConfig: BotConfig = {
    name: 'FortBot',
    footerText: '⚡ powered VTX Group'
};

// Helper function untuk mendapatkan footer text dengan user tag
export function getFooterText(userTag?: string): string {
    if (userTag) {
        return `${userTag} • ${botConfig.footerText}`;
    }
    return botConfig.footerText;
}

