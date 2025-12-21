// @ts-ignore - bun:sqlite is a built-in Bun module
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure db directory exists
const dbDir = join(__dirname, '../db');
if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
}

const economyDbPath = join(dbDir, 'economy.db');
const globalsDbPath = join(dbDir, 'globals.db');

// Create database connections
const db = new Database(economyDbPath); // Economy & RPG database
const globalsDb = new Database(globalsDbPath); // Global database (warnings, etc.)

// Initialize database tables
export async function initDatabase(): Promise<void> {
    try {
        // Users table
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                balance INTEGER DEFAULT 0,
                last_work INTEGER DEFAULT 0,
                registered INTEGER DEFAULT 0
            )
        `);

        // Transactions table for history
        db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // RPG Mining system tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS mining_users (
                user_id TEXT PRIMARY KEY,
                level INTEGER DEFAULT 1,
                xp INTEGER DEFAULT 0,
                pickaxe TEXT DEFAULT 'wooden_pickaxe',
                backpack TEXT DEFAULT 'basic_backpack',
                last_mining INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                rebirth_count INTEGER DEFAULT 0,
                mining_speed_bonus REAL DEFAULT 0,
                sell_bonus REAL DEFAULT 0
            )
        `);

        // Migration: Add missing columns if they don't exist (for existing tables)
        try {
            // Check if columns exist using PRAGMA
            const pragmaStmt = db.prepare("PRAGMA table_info(mining_users)");
            const columns = pragmaStmt.all() as Array<{ name: string }>;
            const columnNames = columns.map(col => col.name);
            
            // Add created_at if missing
            if (!columnNames.includes('created_at')) {
                db.exec(`ALTER TABLE mining_users ADD COLUMN created_at INTEGER DEFAULT (strftime('%s', 'now'))`);
                console.log('[DB] Migration: Added created_at column to mining_users');
                db.exec(`UPDATE mining_users SET created_at = strftime('%s', 'now') WHERE created_at IS NULL`);
            }
            
            // Add rebirth columns if missing
            if (!columnNames.includes('rebirth_count')) {
                db.exec(`ALTER TABLE mining_users ADD COLUMN rebirth_count INTEGER DEFAULT 0`);
                console.log('[DB] Migration: Added rebirth_count column to mining_users');
            }
            
            if (!columnNames.includes('mining_speed_bonus')) {
                db.exec(`ALTER TABLE mining_users ADD COLUMN mining_speed_bonus REAL DEFAULT 0`);
                console.log('[DB] Migration: Added mining_speed_bonus column to mining_users');
            }
            
            if (!columnNames.includes('sell_bonus')) {
                db.exec(`ALTER TABLE mining_users ADD COLUMN sell_bonus REAL DEFAULT 0`);
                console.log('[DB] Migration: Added sell_bonus column to mining_users');
            }
        } catch (error: any) {
            // If table doesn't exist yet, that's fine - it will be created with the columns
            if (!error.message?.includes('no such table')) {
                console.error('[DB] Migration error:', error);
            }
        }

        db.exec(`
            CREATE TABLE IF NOT EXISTS mining_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                UNIQUE(user_id, item_name)
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS mining_equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                equipment_type TEXT NOT NULL,
                equipment_name TEXT NOT NULL,
                UNIQUE(user_id, equipment_type)
            )
        `);

        console.log('[DB] Economy database tables initialized');

        // Initialize globals database (warnings, etc.)
        // Warnings system tables
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS warn_settings (
                guild_id TEXT PRIMARY KEY,
                max_warnings INTEGER DEFAULT 3,
                auto_ban_enabled INTEGER DEFAULT 1
            )
        `);

        // Initialize giveaway tables
        await initGiveawayTables();

        // Initialize ticket tables
        await initTicketTables();

        // Initialize AI tables
        await initAITables();

        // VIP users table for animelovers feature
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS vip_users (
                user_id TEXT PRIMARY KEY,
                is_vip INTEGER DEFAULT 0,
                last_animelovers_use TEXT
            )
        `);

        console.log('[DB] Globals database tables initialized');
    } catch (error) {
        console.error('[DB] Error initializing database:', error);
        throw error;
    }
}

// User registration functions
export function isUserRegistered(userId: string): boolean {
    try {
        const stmt = db.prepare('SELECT registered FROM users WHERE user_id = ?');
        const row = stmt.get(userId) as { registered: number } | undefined;
        return row ? row.registered === 1 : false;
    } catch (error) {
        console.error('[DB] Error checking user registration:', error);
        return false;
    }
}

export function registerUser(userId: string): void {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO users (user_id, registered) VALUES (?, 1)');
        stmt.run(userId);
    } catch (error) {
        console.error('[DB] Error registering user:', error);
        throw error;
    }
}

// User balance functions
export function getUserBalance(userId: string): number {
    try {
        const stmt = db.prepare('SELECT balance FROM users WHERE user_id = ?');
        const row = stmt.get(userId) as { balance: number } | undefined;
        if (!row) {
            // Don't auto-create user anymore - must register first
            return 0;
        }
        return row.balance;
    } catch (error) {
        console.error('[DB] Error getting user balance:', error);
        return 0;
    }
}

export function setUserBalance(userId: string, amount: number): void {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO users (user_id, balance) VALUES (?, ?)');
        stmt.run(userId, amount);
    } catch (error) {
        console.error('[DB] Error setting user balance:', error);
        throw error;
    }
}

export function addUserBalance(userId: string, amount: number, skipRegistrationCheck: boolean = false): number {
    try {
        // Check registration unless explicitly skipped (for initial registration bonus)
        if (!skipRegistrationCheck && !isUserRegistered(userId)) {
            throw new Error('User not registered');
        }
        
        // Ensure user exists in database
        const checkStmt = db.prepare('SELECT user_id FROM users WHERE user_id = ?');
        const userExists = checkStmt.get(userId);
        
        if (!userExists) {
            // Create user if doesn't exist (for registration bonus)
            const insertStmt = db.prepare('INSERT INTO users (user_id, balance) VALUES (?, ?)');
            insertStmt.run(userId, amount);
        } else {
            const stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ?');
            stmt.run(amount, userId);
        }
        
        return getUserBalance(userId);
    } catch (error) {
        console.error('[DB] Error adding user balance:', error);
        throw error;
    }
}

export function subtractUserBalance(userId: string, amount: number): number {
    try {
        const stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ?');
        stmt.run(amount, userId);
        return getUserBalance(userId);
    } catch (error) {
        console.error('[DB] Error subtracting user balance:', error);
        throw error;
    }
}

// Work cooldown functions
export function getLastWorkTime(userId: string): number {
    try {
        const stmt = db.prepare('SELECT last_work FROM users WHERE user_id = ?');
        const row = stmt.get(userId) as { last_work: number } | undefined;
        if (!row) {
            return 0;
        }
        return row.last_work;
    } catch (error) {
        console.error('[DB] Error getting last work time:', error);
        return 0;
    }
}

export function setLastWorkTime(userId: string, timestamp: number): void {
    try {
        const stmt = db.prepare('UPDATE users SET last_work = ? WHERE user_id = ?');
        const result = stmt.run(timestamp, userId);
        if (result.changes === 0) {
            // User doesn't exist, but should be registered at this point
            const insertStmt = db.prepare('INSERT INTO users (user_id, last_work) VALUES (?, ?)');
            insertStmt.run(userId, timestamp);
        }
    } catch (error) {
        console.error('[DB] Error setting last work time:', error);
        throw error;
    }
}

// Transaction history
export function addTransaction(
    userId: string, 
    type: string, 
    amount: number, 
    description?: string
): void {
    try {
        const stmt = db.prepare(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)'
        );
        stmt.run(userId, type, amount, description || null);
    } catch (error) {
        console.error('[DB] Error adding transaction:', error);
    }
}

// Close database connections
export function closeDatabase(): void {
    try {
        db.close();
        globalsDb.close();
        console.log('[DB] Database connections closed');
    } catch (error) {
        console.error('[DB] Error closing databases:', error);
    }
}

// ========== RPG MINING SYSTEM ==========

// Get mining user data
export function getMiningUser(userId: string): { level: number; xp: number; pickaxe: string; backpack: string; last_mining: number; created_at: number; rebirth_count: number; mining_speed_bonus: number; sell_bonus: number } | null {
    try {
        const stmt = db.prepare('SELECT level, xp, pickaxe, backpack, last_mining, created_at, rebirth_count, mining_speed_bonus, sell_bonus FROM mining_users WHERE user_id = ?');
        const row = stmt.get(userId) as { level: number; xp: number; pickaxe: string; backpack: string; last_mining: number; created_at: number; rebirth_count: number; mining_speed_bonus: number; sell_bonus: number } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting mining user:', error);
        return null;
    }
}

// Initialize mining user
export function initMiningUser(userId: string): void {
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO mining_users (user_id, level, xp, pickaxe, backpack, last_mining, created_at, rebirth_count, mining_speed_bonus, sell_bonus) VALUES (?, 1, 0, ?, ?, 0, strftime(\'%s\', \'now\'), 0, 0, 0)');
        stmt.run(userId, 'wooden_pickaxe', 'basic_backpack');
    } catch (error) {
        console.error('[DB] Error initializing mining user:', error);
    }
}

// Check if mining user is registered
export function isMiningUserRegistered(userId: string): boolean {
    try {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM mining_users WHERE user_id = ?');
        const row = stmt.get(userId) as { count: number } | undefined;
        const isRegistered = row !== undefined && row !== null && row.count > 0;
        return isRegistered;
    } catch (error) {
        console.error('[DB] Error checking mining user registration:', error);
        return false;
    }
}

// Register mining user
export function registerMiningUser(userId: string): void {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO mining_users (user_id, level, xp, pickaxe, backpack, last_mining, created_at, rebirth_count, mining_speed_bonus, sell_bonus) VALUES (?, 1, 0, ?, ?, 0, strftime(\'%s\', \'now\'), 0, 0, 0)');
        const result = stmt.run(userId, 'wooden_pickaxe', 'basic_backpack');
        
        // Verify registration was successful
        if (result.changes === 0) {
            throw new Error('No rows were inserted/updated');
        }
        
        // Double check that user exists
        if (!isMiningUserRegistered(userId)) {
            throw new Error('User registration verification failed');
        }
    } catch (error) {
        console.error('[DB] Error registering mining user:', error);
        throw error;
    }
}

// Rebirth user (reset level, add bonuses)
export function rebirthMiningUser(userId: string): { rebirth_count: number; mining_speed_bonus: number; sell_bonus: number } {
    try {
        const user = getMiningUser(userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        const newRebirthCount = user.rebirth_count + 1;
        // Each rebirth gives 5% mining speed bonus and 5% sell bonus (stacking)
        const newMiningSpeedBonus = newRebirthCount * 5;
        const newSellBonus = newRebirthCount * 5;
        
        const stmt = db.prepare('UPDATE mining_users SET level = 1, xp = 0, pickaxe = ?, backpack = ?, rebirth_count = ?, mining_speed_bonus = ?, sell_bonus = ? WHERE user_id = ?');
        stmt.run('wooden_pickaxe', 'basic_backpack', newRebirthCount, newMiningSpeedBonus, newSellBonus, userId);
        
        return {
            rebirth_count: newRebirthCount,
            mining_speed_bonus: newMiningSpeedBonus,
            sell_bonus: newSellBonus
        };
    } catch (error) {
        console.error('[DB] Error rebirthing mining user:', error);
        throw error;
    }
}

// Add XP and level up
export function addMiningXP(userId: string, xpGain: number): { level: number; xp: number; leveledUp: boolean } {
    try {
        // Ensure user exists
        const checkUser = getMiningUser(userId);
        if (!checkUser) {
            initMiningUser(userId);
        }
        
        // Ensure xpGain is at least 1
        const actualXpGain = Math.max(1, Math.floor(xpGain));
        
        const stmt = db.prepare('UPDATE mining_users SET xp = xp + ? WHERE user_id = ?');
        const result = stmt.run(actualXpGain, userId);
        
        if (result.changes === 0) {
            // User doesn't exist, create them
            initMiningUser(userId);
            stmt.run(actualXpGain, userId);
        }
        
        const user = getMiningUser(userId);
        if (!user) throw new Error('User not found after XP update');
        
        // Calculate required XP for level (level * 100)
        const requiredXP = user.level * 100;
        let leveledUp = false;
        
        if (user.xp >= requiredXP) {
            // Level up
            const newLevel = user.level + 1;
            const newXP = user.xp - requiredXP;
            const levelUpStmt = db.prepare('UPDATE mining_users SET level = ?, xp = ? WHERE user_id = ?');
            levelUpStmt.run(newLevel, newXP, userId);
            leveledUp = true;
            return { level: newLevel, xp: newXP, leveledUp: true };
        }
        
        return { level: user.level, xp: user.xp, leveledUp: false };
    } catch (error) {
        console.error('[DB] Error adding mining XP:', error);
        throw error;
    }
}

// Set last mining time
export function setLastMiningTime(userId: string, timestamp: number): void {
    try {
        initMiningUser(userId);
        const stmt = db.prepare('UPDATE mining_users SET last_mining = ? WHERE user_id = ?');
        stmt.run(timestamp, userId);
    } catch (error) {
        console.error('[DB] Error setting last mining time:', error);
    }
}

// Get last mining time
export function getLastMiningTime(userId: string): number {
    try {
        const user = getMiningUser(userId);
        return user?.last_mining || 0;
    } catch (error) {
        console.error('[DB] Error getting last mining time:', error);
        return 0;
    }
}

// Update equipment
export function updateMiningEquipment(userId: string, equipmentType: 'pickaxe' | 'backpack', equipmentName: string): void {
    try {
        initMiningUser(userId);
        const stmt = db.prepare(`UPDATE mining_users SET ${equipmentType} = ? WHERE user_id = ?`);
        stmt.run(equipmentName, userId);
    } catch (error) {
        console.error('[DB] Error updating mining equipment:', error);
        throw error;
    }
}

// Add item to inventory
export function addMiningInventoryItem(userId: string, itemName: string, quantity: number): void {
    try {
        initMiningUser(userId);
        const stmt = db.prepare('INSERT INTO mining_inventory (user_id, item_name, quantity) VALUES (?, ?, ?) ON CONFLICT(user_id, item_name) DO UPDATE SET quantity = quantity + ?');
        stmt.run(userId, itemName, quantity, quantity);
    } catch (error) {
        console.error('[DB] Error adding mining inventory item:', error);
        throw error;
    }
}

// Remove item from inventory
export function removeMiningInventoryItem(userId: string, itemName: string, quantity: number): void {
    try {
        const stmt = db.prepare('UPDATE mining_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_name = ?');
        stmt.run(quantity, userId, itemName);
        
        // Remove if quantity <= 0
        const deleteStmt = db.prepare('DELETE FROM mining_inventory WHERE user_id = ? AND item_name = ? AND quantity <= 0');
        deleteStmt.run(userId, itemName);
    } catch (error) {
        console.error('[DB] Error removing mining inventory item:', error);
        throw error;
    }
}

// Get all inventory items
export function getMiningInventory(userId: string): Array<{ item_name: string; quantity: number }> {
    try {
        const stmt = db.prepare('SELECT item_name, quantity FROM mining_inventory WHERE user_id = ? AND quantity > 0 ORDER BY item_name');
        const rows = stmt.all(userId) as Array<{ item_name: string; quantity: number }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting mining inventory:', error);
        return [];
    }
}

// Get item quantity
export function getMiningItemQuantity(userId: string, itemName: string): number {
    try {
        const stmt = db.prepare('SELECT quantity FROM mining_inventory WHERE user_id = ? AND item_name = ?');
        const row = stmt.get(userId, itemName) as { quantity: number } | undefined;
        return row?.quantity || 0;
    } catch (error) {
        console.error('[DB] Error getting mining item quantity:', error);
        return 0;
    }
}

// ========== WARNINGS SYSTEM (using globals.db) ==========

// Add warning to user
export function addWarning(guildId: string, userId: string, moderatorId: string, reason: string): number {
    try {
        const stmt = globalsDb.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)');
        stmt.run(guildId, userId, moderatorId, reason);
        
        // Get warning count
        return getWarningCount(guildId, userId);
    } catch (error) {
        console.error('[DB] Error adding warning:', error);
        throw error;
    }
}

// Get warning count for user
export function getWarningCount(guildId: string, userId: string): number {
    try {
        const stmt = globalsDb.prepare('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?');
        const row = stmt.get(guildId, userId) as { count: number } | undefined;
        return row?.count || 0;
    } catch (error) {
        console.error('[DB] Error getting warning count:', error);
        return 0;
    }
}

// Get all warnings for user
export function getUserWarnings(guildId: string, userId: string): Array<{ id: number; moderator_id: string; reason: string; timestamp: number }> {
    try {
        const stmt = globalsDb.prepare('SELECT id, moderator_id, reason, timestamp FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC');
        const rows = stmt.all(guildId, userId) as Array<{ id: number; moderator_id: string; reason: string; timestamp: number }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting user warnings:', error);
        return [];
    }
}

// Remove warning by ID
export function removeWarning(guildId: string, warningId: number): boolean {
    try {
        const stmt = globalsDb.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ?');
        const result = stmt.run(warningId, guildId);
        return result.changes > 0;
    } catch (error) {
        console.error('[DB] Error removing warning:', error);
        return false;
    }
}

// Remove all warnings for user
export function removeAllWarnings(guildId: string, userId: string): number {
    try {
        const stmt = globalsDb.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?');
        const result = stmt.run(guildId, userId);
        return result.changes;
    } catch (error) {
        console.error('[DB] Error removing all warnings:', error);
        return 0;
    }
}

// Get warning settings for guild
export function getWarnSettings(guildId: string): { max_warnings: number; auto_ban_enabled: boolean } {
    try {
        const stmt = globalsDb.prepare('SELECT max_warnings, auto_ban_enabled FROM warn_settings WHERE guild_id = ?');
        const row = stmt.get(guildId) as { max_warnings: number; auto_ban_enabled: number } | undefined;
        
        if (!row) {
            // Return default settings
            return { max_warnings: 3, auto_ban_enabled: true };
        }
        
        return {
            max_warnings: row.max_warnings,
            auto_ban_enabled: row.auto_ban_enabled === 1
        };
    } catch (error) {
        console.error('[DB] Error getting warn settings:', error);
        return { max_warnings: 3, auto_ban_enabled: true };
    }
}

// Update warn settings
export function updateWarnSettings(guildId: string, maxWarnings?: number, autoBanEnabled?: boolean): void {
    try {
        // Check if settings exist
        const checkStmt = globalsDb.prepare('SELECT guild_id FROM warn_settings WHERE guild_id = ?');
        const exists = checkStmt.get(guildId);
        
        if (exists) {
            // Update existing
            if (maxWarnings !== undefined && autoBanEnabled !== undefined) {
                const stmt = globalsDb.prepare('UPDATE warn_settings SET max_warnings = ?, auto_ban_enabled = ? WHERE guild_id = ?');
                stmt.run(maxWarnings, autoBanEnabled ? 1 : 0, guildId);
            } else if (maxWarnings !== undefined) {
                const stmt = globalsDb.prepare('UPDATE warn_settings SET max_warnings = ? WHERE guild_id = ?');
                stmt.run(maxWarnings, guildId);
            } else if (autoBanEnabled !== undefined) {
                const stmt = globalsDb.prepare('UPDATE warn_settings SET auto_ban_enabled = ? WHERE guild_id = ?');
                stmt.run(autoBanEnabled ? 1 : 0, guildId);
            }
        } else {
            // Insert new
            const maxWarn = maxWarnings !== undefined ? maxWarnings : 3;
            const autoBan = autoBanEnabled !== undefined ? autoBanEnabled : true;
            const stmt = globalsDb.prepare('INSERT INTO warn_settings (guild_id, max_warnings, auto_ban_enabled) VALUES (?, ?, ?)');
            stmt.run(guildId, maxWarn, autoBan ? 1 : 0);
        }
    } catch (error) {
        console.error('[DB] Error updating warn settings:', error);
        throw error;
    }
}

// ========== GIVEAWAY SYSTEM (using globals.db) ==========

// Initialize giveaway tables
export async function initGiveawayTables(): Promise<void> {
    try {
        // Giveaways table
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS giveaways (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                creator_id TEXT NOT NULL,
                title TEXT,
                description TEXT,
                end_time INTEGER NOT NULL,
                winner_count INTEGER NOT NULL,
                role_requirement TEXT,
                request TEXT,
                participants TEXT DEFAULT '[]',
                winners TEXT DEFAULT '[]',
                ended INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        console.log('[DB] Giveaway tables initialized');
    } catch (error) {
        console.error('[DB] Error initializing giveaway tables:', error);
        throw error;
    }
}

// Create giveaway
export function createGiveaway(
    id: string,
    guildId: string,
    channelId: string,
    messageId: string,
    creatorId: string,
    title: string,
    description: string,
    endTime: number,
    winnerCount: number,
    roleRequirement?: string,
    request?: string
): void {
    try {
        const stmt = globalsDb.prepare(`
            INSERT INTO giveaways (
                id, guild_id, channel_id, message_id, creator_id, 
                title, description, end_time, winner_count, 
                role_requirement, request, participants, winners, ended
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0)
        `);
        stmt.run(
            id, guildId, channelId, messageId, creatorId,
            title, description, endTime, winnerCount,
            roleRequirement || null, request || null
        );
    } catch (error) {
        console.error('[DB] Error creating giveaway:', error);
        throw error;
    }
}

// Get giveaway
export function getGiveaway(id: string): {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    creator_id: string;
    title: string;
    description: string;
    end_time: number;
    winner_count: number;
    role_requirement: string | null;
    request: string | null;
    participants: string;
    winners: string;
    ended: number;
    created_at: number;
} | null {
    try {
        const stmt = globalsDb.prepare('SELECT * FROM giveaways WHERE id = ?');
        const row = stmt.get(id) as any;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting giveaway:', error);
        return null;
    }
}

// Get all active giveaways
export function getActiveGiveaways(): Array<{
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    creator_id: string;
    title: string;
    description: string;
    end_time: number;
    winner_count: number;
    role_requirement: string | null;
    request: string | null;
    participants: string;
    winners: string;
    ended: number;
    created_at: number;
}> {
    try {
        const stmt = globalsDb.prepare('SELECT * FROM giveaways WHERE ended = 0');
        const rows = stmt.all() as any[];
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting active giveaways:', error);
        return [];
    }
}

// Get expired giveaways
export function getExpiredGiveaways(): Array<{
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    creator_id: string;
    title: string;
    description: string;
    end_time: number;
    winner_count: number;
    role_requirement: string | null;
    request: string | null;
    participants: string;
    winners: string;
    ended: number;
    created_at: number;
}> {
    try {
        const currentTime = Math.floor(Date.now() / 1000);
        const stmt = globalsDb.prepare('SELECT * FROM giveaways WHERE ended = 0 AND end_time <= ?');
        const rows = stmt.all(currentTime) as any[];
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting expired giveaways:', error);
        return [];
    }
}

// Add participant to giveaway
export function addGiveawayParticipant(id: string, userId: string): boolean {
    try {
        const giveaway = getGiveaway(id);
        if (!giveaway || giveaway.ended === 1) return false;

        const participants = JSON.parse(giveaway.participants || '[]') as string[];
        if (participants.includes(userId)) return false; // Already participating

        participants.push(userId);
        const stmt = globalsDb.prepare('UPDATE giveaways SET participants = ? WHERE id = ?');
        stmt.run(JSON.stringify(participants), id);
        return true;
    } catch (error) {
        console.error('[DB] Error adding giveaway participant:', error);
        return false;
    }
}

// Remove participant from giveaway
export function removeGiveawayParticipant(id: string, userId: string): boolean {
    try {
        const giveaway = getGiveaway(id);
        if (!giveaway || giveaway.ended === 1) return false;

        const participants = JSON.parse(giveaway.participants || '[]') as string[];
        const index = participants.indexOf(userId);
        if (index === -1) return false; // Not participating

        participants.splice(index, 1);
        const stmt = globalsDb.prepare('UPDATE giveaways SET participants = ? WHERE id = ?');
        stmt.run(JSON.stringify(participants), id);
        return true;
    } catch (error) {
        console.error('[DB] Error removing giveaway participant:', error);
        return false;
    }
}

// Get giveaway participants
export function getGiveawayParticipants(id: string): string[] {
    try {
        const giveaway = getGiveaway(id);
        if (!giveaway) return [];
        return JSON.parse(giveaway.participants || '[]') as string[];
    } catch (error) {
        console.error('[DB] Error getting giveaway participants:', error);
        return [];
    }
}

// End giveaway and set winners
export function endGiveaway(id: string, winners: string[]): void {
    try {
        const stmt = globalsDb.prepare('UPDATE giveaways SET ended = 1, winners = ? WHERE id = ?');
        stmt.run(JSON.stringify(winners), id);
    } catch (error) {
        console.error('[DB] Error ending giveaway:', error);
        throw error;
    }
}

// Delete giveaway
export function deleteGiveaway(id: string): boolean {
    try {
        const stmt = globalsDb.prepare('DELETE FROM giveaways WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } catch (error) {
        console.error('[DB] Error deleting giveaway:', error);
        return false;
    }
}

// Get giveaways that ended more than 1 day ago (for cleanup)
export function getOldEndedGiveaways(): Array<{
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    creator_id: string;
    title: string;
    description: string;
    end_time: number;
    winner_count: number;
    role_requirement: string | null;
    request: string | null;
    participants: string;
    winners: string;
    ended: number;
    created_at: number;
}> {
    try {
        const currentTime = Math.floor(Date.now() / 1000);
        const oneDayInSeconds = 24 * 60 * 60; // 1 day
        const oneDayAgo = currentTime - oneDayInSeconds;
        
        // Get giveaways that ended more than 1 day ago
        const stmt = globalsDb.prepare('SELECT * FROM giveaways WHERE ended = 1 AND end_time <= ?');
        const rows = stmt.all(oneDayAgo) as any[];
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting old ended giveaways:', error);
        return [];
    }
}

// Check if giveaway can be rerolled (must be ended and less than 1 day old)
export function canRerollGiveaway(id: string): boolean {
    try {
        const giveaway = getGiveaway(id);
        if (!giveaway || giveaway.ended === 0) return false;
        
        const currentTime = Math.floor(Date.now() / 1000);
        const oneDayInSeconds = 24 * 60 * 60; // 1 day
        const oneDayAgo = currentTime - oneDayInSeconds;
        
        // Can reroll if ended less than 1 day ago
        return giveaway.end_time > oneDayAgo;
    } catch (error) {
        console.error('[DB] Error checking if giveaway can be rerolled:', error);
        return false;
    }
}

// ========== VIP USERS SYSTEM (using globals.db) ==========

// Check if user is VIP
export function isVipUser(userId: string): boolean {
    try {
        const stmt = globalsDb.prepare('SELECT is_vip FROM vip_users WHERE user_id = ?');
        const row = stmt.get(userId) as { is_vip: number } | undefined;
        return row ? row.is_vip === 1 : false;
    } catch (error) {
        console.error('[DB] Error checking VIP user:', error);
        return false;
    }
}

// Set VIP status for user
export function setVipUser(userId: string, isVip: boolean): void {
    try {
        const stmt = globalsDb.prepare('INSERT OR REPLACE INTO vip_users (user_id, is_vip) VALUES (?, ?)');
        stmt.run(userId, isVip ? 1 : 0);
    } catch (error) {
        console.error('[DB] Error setting VIP user:', error);
        throw error;
    }
}

// Get last animelovers use date
export function getLastAnimeloversUse(userId: string): string | null {
    try {
        const stmt = globalsDb.prepare('SELECT last_animelovers_use FROM vip_users WHERE user_id = ?');
        const row = stmt.get(userId) as { last_animelovers_use: string | null } | undefined;
        return row?.last_animelovers_use || null;
    } catch (error) {
        console.error('[DB] Error getting last animelovers use:', error);
        return null;
    }
}

// Set last animelovers use date
export function setLastAnimeloversUse(userId: string, date: string): void {
    try {
        // Ensure user exists in table
        const checkStmt = globalsDb.prepare('SELECT user_id FROM vip_users WHERE user_id = ?');
        const exists = checkStmt.get(userId);
        
        if (exists) {
            const stmt = globalsDb.prepare('UPDATE vip_users SET last_animelovers_use = ? WHERE user_id = ?');
            stmt.run(date, userId);
        } else {
            const stmt = globalsDb.prepare('INSERT INTO vip_users (user_id, last_animelovers_use) VALUES (?, ?)');
            stmt.run(userId, date);
        }
    } catch (error) {
        console.error('[DB] Error setting last animelovers use:', error);
        throw error;
    }
}

// ========== LEADERBOARD SYSTEM ==========

// Get top users by level (from mining_users)
export function getTopUsersByLevel(limit: number = 10, userIds?: string[]): Array<{ user_id: string; level: number; xp: number }> {
    try {
        let query = 'SELECT user_id, level, xp FROM mining_users';
        const params: any[] = [];
        
        if (userIds && userIds.length > 0) {
            const placeholders = userIds.map(() => '?').join(',');
            query += ` WHERE user_id IN (${placeholders})`;
            params.push(...userIds);
        }
        
        query += ' ORDER BY level DESC, xp DESC LIMIT ?';
        params.push(limit);
        
        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Array<{ user_id: string; level: number; xp: number }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting top users by level:', error);
        return [];
    }
}

// Get top users by balance (from users)
export function getTopUsersByBalance(limit: number = 10, userIds?: string[]): Array<{ user_id: string; balance: number }> {
    try {
        let query = 'SELECT user_id, balance FROM users WHERE registered = 1';
        const params: any[] = [];
        
        if (userIds && userIds.length > 0) {
            const placeholders = userIds.map(() => '?').join(',');
            query += ` AND user_id IN (${placeholders})`;
            params.push(...userIds);
        }
        
        query += ' ORDER BY balance DESC LIMIT ?';
        params.push(limit);
        
        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Array<{ user_id: string; balance: number }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting top users by balance:', error);
        return [];
    }
}

// ========== TICKET SYSTEM (using globals.db) ==========

// Initialize ticket tables
export async function initTicketTables(): Promise<void> {
    try {
        // Ticket config per guild
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS ticket_configs (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                role_id TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Active tickets
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                creator_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                closed_at INTEGER,
                is_closed INTEGER DEFAULT 0
            )
        `);

        // Ticket members (users who have access to ticket)
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS ticket_members (
                ticket_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                added_at INTEGER DEFAULT (strftime('%s', 'now')),
                PRIMARY KEY (ticket_id, user_id),
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            )
        `);

        console.log('[DB] Ticket tables initialized');
    } catch (error) {
        console.error('[DB] Error initializing ticket tables:', error);
        throw error;
    }
}

// Ticket config functions
export function getTicketConfig(guildId: string): { channel_id: string; role_id: string | null; description: string | null } | null {
    try {
        const stmt = globalsDb.prepare('SELECT channel_id, role_id, description FROM ticket_configs WHERE guild_id = ?');
        const row = stmt.get(guildId) as { channel_id: string; role_id: string | null; description: string | null } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting ticket config:', error);
        return null;
    }
}

export function setTicketConfig(guildId: string, channelId: string, roleId?: string | null, description?: string | null): void {
    try {
        const stmt = globalsDb.prepare('INSERT OR REPLACE INTO ticket_configs (guild_id, channel_id, role_id, description) VALUES (?, ?, ?, ?)');
        stmt.run(guildId, channelId, roleId || null, description || null);
    } catch (error) {
        console.error('[DB] Error setting ticket config:', error);
        throw error;
    }
}

export function deleteTicketConfig(guildId: string): void {
    try {
        const stmt = globalsDb.prepare('DELETE FROM ticket_configs WHERE guild_id = ?');
        stmt.run(guildId);
    } catch (error) {
        console.error('[DB] Error deleting ticket config:', error);
        throw error;
    }
}

// Ticket functions
export function createTicket(ticketId: string, guildId: string, channelId: string, creatorId: string): void {
    try {
        const stmt = globalsDb.prepare('INSERT INTO tickets (id, guild_id, channel_id, creator_id) VALUES (?, ?, ?, ?)');
        stmt.run(ticketId, guildId, channelId, creatorId);
        
        // Add creator as member
        addTicketMember(ticketId, creatorId);
    } catch (error) {
        console.error('[DB] Error creating ticket:', error);
        throw error;
    }
}

export function getTicket(ticketId: string): { id: string; guild_id: string; channel_id: string; creator_id: string; created_at: number; closed_at: number | null; is_closed: number } | null {
    try {
        const stmt = globalsDb.prepare('SELECT * FROM tickets WHERE id = ?');
        const row = stmt.get(ticketId) as { id: string; guild_id: string; channel_id: string; creator_id: string; created_at: number; closed_at: number | null; is_closed: number } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting ticket:', error);
        return null;
    }
}

export function getTicketByChannel(channelId: string): { id: string; guild_id: string; channel_id: string; creator_id: string; created_at: number; closed_at: number | null; is_closed: number } | null {
    try {
        const stmt = globalsDb.prepare('SELECT * FROM tickets WHERE channel_id = ?');
        const row = stmt.get(channelId) as { id: string; guild_id: string; channel_id: string; creator_id: string; created_at: number; closed_at: number | null; is_closed: number } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting ticket by channel:', error);
        return null;
    }
}

export function getUserTickets(userId: string, guildId: string): Array<{ id: string; channel_id: string; created_at: number; is_closed: number }> {
    try {
        const stmt = globalsDb.prepare(`
            SELECT t.id, t.channel_id, t.created_at, t.is_closed 
            FROM tickets t
            WHERE t.creator_id = ? AND t.guild_id = ?
            ORDER BY t.created_at DESC
        `);
        const rows = stmt.all(userId, guildId) as Array<{ id: string; channel_id: string; created_at: number; is_closed: number }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting user tickets:', error);
        return [];
    }
}

export function closeTicket(ticketId: string): void {
    try {
        const stmt = globalsDb.prepare('UPDATE tickets SET is_closed = 1, closed_at = strftime("%s", "now") WHERE id = ?');
        stmt.run(ticketId);
    } catch (error) {
        console.error('[DB] Error closing ticket:', error);
        throw error;
    }
}

export function deleteTicket(ticketId: string): void {
    try {
        // Delete members first (CASCADE should handle this, but explicit is better)
        const deleteMembersStmt = globalsDb.prepare('DELETE FROM ticket_members WHERE ticket_id = ?');
        deleteMembersStmt.run(ticketId);
        
        // Delete ticket
        const deleteTicketStmt = globalsDb.prepare('DELETE FROM tickets WHERE id = ?');
        deleteTicketStmt.run(ticketId);
    } catch (error) {
        console.error('[DB] Error deleting ticket:', error);
        throw error;
    }
}

// Ticket member functions
export function addTicketMember(ticketId: string, userId: string): void {
    try {
        const stmt = globalsDb.prepare('INSERT OR IGNORE INTO ticket_members (ticket_id, user_id) VALUES (?, ?)');
        stmt.run(ticketId, userId);
    } catch (error) {
        console.error('[DB] Error adding ticket member:', error);
        throw error;
    }
}

export function removeTicketMember(ticketId: string, userId: string): void {
    try {
        const stmt = globalsDb.prepare('DELETE FROM ticket_members WHERE ticket_id = ? AND user_id = ?');
        stmt.run(ticketId, userId);
    } catch (error) {
        console.error('[DB] Error removing ticket member:', error);
        throw error;
    }
}

export function getTicketMembers(ticketId: string): string[] {
    try {
        const stmt = globalsDb.prepare('SELECT user_id FROM ticket_members WHERE ticket_id = ?');
        const rows = stmt.all(ticketId) as Array<{ user_id: string }>;
        return rows.map(row => row.user_id);
    } catch (error) {
        console.error('[DB] Error getting ticket members:', error);
        return [];
    }
}

// ========== AI CHAT SYSTEM (using globals.db) ==========

// Initialize AI tables
export async function initAITables(): Promise<void> {
    try {
        // AI config per guild
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS ai_configs (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // AI sessions per channel
        globalsDb.exec(`
            CREATE TABLE IF NOT EXISTS ai_sessions (
                channel_id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                creator_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        console.log('[DB] AI tables initialized');
    } catch (error) {
        console.error('[DB] Error initializing AI tables:', error);
        throw error;
    }
}

// AI config functions
export function getAIConfig(guildId: string): { channel_id: string } | null {
    try {
        const stmt = globalsDb.prepare('SELECT channel_id FROM ai_configs WHERE guild_id = ?');
        const row = stmt.get(guildId) as { channel_id: string } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting AI config:', error);
        return null;
    }
}

export function setAIConfig(guildId: string, channelId: string): void {
    try {
        const stmt = globalsDb.prepare('INSERT OR REPLACE INTO ai_configs (guild_id, channel_id) VALUES (?, ?)');
        stmt.run(guildId, channelId);
    } catch (error) {
        console.error('[DB] Error setting AI config:', error);
        throw error;
    }
}

export function deleteAIConfig(guildId: string): void {
    try {
        const stmt = globalsDb.prepare('DELETE FROM ai_configs WHERE guild_id = ?');
        stmt.run(guildId);
    } catch (error) {
        console.error('[DB] Error deleting AI config:', error);
        throw error;
    }
}

// AI session functions
export function createAISession(channelId: string, guildId: string, creatorId: string, sessionId: string): void {
    try {
        const stmt = globalsDb.prepare('INSERT OR REPLACE INTO ai_sessions (channel_id, guild_id, creator_id, session_id) VALUES (?, ?, ?, ?)');
        stmt.run(channelId, guildId, creatorId, sessionId);
    } catch (error) {
        console.error('[DB] Error creating AI session:', error);
        throw error;
    }
}

export function getAISession(channelId: string): { channel_id: string; guild_id: string; creator_id: string; session_id: string; created_at: number } | null {
    try {
        const stmt = globalsDb.prepare('SELECT * FROM ai_sessions WHERE channel_id = ?');
        const row = stmt.get(channelId) as { channel_id: string; guild_id: string; creator_id: string; session_id: string; created_at: number } | undefined;
        return row || null;
    } catch (error) {
        console.error('[DB] Error getting AI session:', error);
        return null;
    }
}

export function deleteAISession(channelId: string): void {
    try {
        const stmt = globalsDb.prepare('DELETE FROM ai_sessions WHERE channel_id = ?');
        stmt.run(channelId);
    } catch (error) {
        console.error('[DB] Error deleting AI session:', error);
        throw error;
    }
}

export function getUserAISessions(userId: string, guildId: string): Array<{ channel_id: string; session_id: string }> {
    try {
        const stmt = globalsDb.prepare('SELECT channel_id, session_id FROM ai_sessions WHERE creator_id = ? AND guild_id = ?');
        const rows = stmt.all(userId, guildId) as Array<{ channel_id: string; session_id: string }>;
        return rows || [];
    } catch (error) {
        console.error('[DB] Error getting user AI sessions:', error);
        return [];
    }
}

// Export database instances if needed
export { db, globalsDb };
