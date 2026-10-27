import { sqliteTable,text } from 'drizzle-orm/sqlite-core';
export const snapshots=sqliteTable('fare_snapshots',{id:text('id').primaryKey(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const credentials=sqliteTable('service_credentials',{id:text('id').primaryKey(),ciphertext:text('ciphertext').notNull(),updatedAt:text('updated_at').notNull()});
