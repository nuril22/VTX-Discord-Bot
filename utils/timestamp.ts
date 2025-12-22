import { time, TimestampStyles } from 'discord.js';

/**
 * Format timestamp Discord dengan berbagai style
 * @param date - Date object atau Unix timestamp (seconds)
 * @param style - Style timestamp (default: ShortDateTime)
 * @returns Formatted Discord timestamp string
 */
export function formatDiscordTimestamp(
    date: Date | number,
    style: TimestampStyles = TimestampStyles.ShortDateTime
): string {
    const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : date;
    return time(timestamp, style);
}

/**
 * Format tanggal dan waktu lengkap dengan Discord timestamp
 * @param date - Date object atau Unix timestamp (seconds)
 * @returns String dengan format: "Tanggal (Discord timestamp)"
 */
export function formatDateWithTimestamp(date: Date | number): string {
    const dateObj = date instanceof Date ? date : new Date(date * 1000);
    const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : date;
    
    const formattedDate = dateObj.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    });
    
    return `${formattedDate} (${time(timestamp, TimestampStyles.RelativeTime)})`;
}

/**
 * Format waktu relatif dengan Discord timestamp
 * @param date - Date object atau Unix timestamp (seconds)
 * @returns String dengan format: "Relative time (Discord timestamp)"
 */
export function formatRelativeTime(date: Date | number): string {
    const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : date;
    return time(timestamp, TimestampStyles.RelativeTime);
}

/**
 * Format waktu lengkap dengan semua style Discord timestamp
 * @param date - Date object atau Unix timestamp (seconds)
 * @returns Object dengan semua format timestamp
 */
export function getAllTimestampFormats(date: Date | number) {
    const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : date;
    
    return {
        shortTime: time(timestamp, TimestampStyles.ShortTime),        // 16:20
        longTime: time(timestamp, TimestampStyles.LongTime),          // 16:20:30
        shortDate: time(timestamp, TimestampStyles.ShortDate),        // 20/04/2021
        longDate: time(timestamp, TimestampStyles.LongDate),           // 20 April 2021
        shortDateTime: time(timestamp, TimestampStyles.ShortDateTime), // 20/04/2021 16:20
        longDateTime: time(timestamp, TimestampStyles.LongDateTime),   // 20 April 2021 16:20
        relativeTime: time(timestamp, TimestampStyles.RelativeTime)   // 2 hours ago
    };
}

/**
 * Helper untuk mendapatkan informasi waktu saat ini dengan timestamp Discord
 * @returns String dengan informasi waktu lengkap
 */
export function getCurrentTimeInfo(): string {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    
    const dayName = now.toLocaleDateString('id-ID', { weekday: 'long' });
    const date = now.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const time = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
    });
    
    return `**Hari:** ${dayName}\n**Tanggal:** ${date}\n**Waktu:** ${time}\n**Timestamp:** ${time(timestamp, TimestampStyles.RelativeTime)} (${time(timestamp, TimestampStyles.LongDateTime)})`;
}
