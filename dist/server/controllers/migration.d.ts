import { Context } from '@nocobase/actions';
type Id = string | number;
export interface ExportBody {
    collections?: string[];
    workflows?: Id[];
    uiSchemas?: string[];
}
export interface FieldRow {
    name: string;
    type?: string;
    interface?: string;
    options?: any;
}
export interface CollectionBundle {
    name: string;
    title?: string;
    primaryKey?: string;
    fields?: FieldRow[];
}
export declare class MigrationController {
    static export(ctx: Context): Promise<void>;
    static import(ctx: Context): Promise<void>;
    static list(ctx: Context): Promise<void>;
    static validate(ctx: Context): Promise<void>;
    static apply(ctx: Context): Promise<void>;
}
export {};
