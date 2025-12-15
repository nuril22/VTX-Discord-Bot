/// <reference types="bun-types" />

declare module 'bun:sqlite' {
    export interface Statement {
        run(...params: any[]): { changes: number; lastInsertRowid: number };
        get(...params: any[]): any;
        all(...params: any[]): any[];
        finalize(): void;
    }

    export class Database {
        constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
        
        exec(sql: string): void;
        prepare(sql: string): Statement;
        query(sql: string): Statement;
        close(): void;
    }
}
