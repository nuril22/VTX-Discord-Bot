// Activity settings untuk bot
// File ini akan di-update oleh command /setactivity

export interface ActivityConfig {   
    status: 'online' | 'idle' | 'dnd' | 'invisible';
    activities: Array<{
        name: string;
        type: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing';
    }>;
}

// Default activity configuration
export const activityConfig: ActivityConfig = {
    status: 'idle',
    activities: [
        {
            name: 'Discord.js v14',
            type: 'Playing'
        },
        {
            name: 'test',
            type: 'Watching'
        }
    ]
};
