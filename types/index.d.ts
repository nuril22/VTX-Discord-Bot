import { SlashCommandBuilder, ChatInputCommandInteraction, Message, Client, Collection } from 'discord.js';

export interface Command {
    category?: string;
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction | Message, client: Client, ...args: any[]) => Promise<void>;
}

declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, Command>;
    }
}
