import { NativeModule } from 'expo';
import { type SQLiteOpenOptions } from '../NativeDatabase';
import { type SQLiteBindBlobParams, type SQLiteBindPrimitiveParams, type SQLiteColumnNames, type SQLiteColumnValues, type SQLiteRunResult } from '../NativeStatement';
declare class NativeDatabase {
    readonly databasePath: string;
    readonly options?: SQLiteOpenOptions | undefined;
    private serializedData?;
    readonly id: number;
    constructor(databasePath: string, options?: SQLiteOpenOptions | undefined, serializedData?: Uint8Array | undefined);
    initAsync(): Promise<void>;
    initSync(): void;
    isInTransactionAsync(): Promise<boolean>;
    isInTransactionSync(): boolean;
    closeAsync(): Promise<void>;
    closeSync(): void;
    execAsync(source: string): Promise<void>;
    execSync(source: string): void;
    serializeAsync(schemaName: string): Promise<Uint8Array>;
    serializeSync(schemaName: string): Uint8Array;
    prepareAsync(nativeStatement: NativeStatement, source: string): Promise<void>;
    prepareSync(nativeStatement: NativeStatement, source: string): void;
    importAssetDatabaseAsync(data: Uint8Array): Promise<void>;
}
declare class NativeStatement {
    readonly id: number;
    constructor();
    runAsync(database: NativeDatabase, bindParams: SQLiteBindPrimitiveParams, bindBlobParams: SQLiteBindBlobParams, shouldPassAsArray: boolean): Promise<SQLiteRunResult & {
        firstRowValues: SQLiteColumnValues;
    }>;
    runSync(database: NativeDatabase, bindParams: SQLiteBindPrimitiveParams, bindBlobParams: SQLiteBindBlobParams, shouldPassAsArray: boolean): SQLiteRunResult & {
        firstRowValues: SQLiteColumnValues;
    };
    stepAsync(database: NativeDatabase): Promise<SQLiteColumnValues | null>;
    stepSync(database: NativeDatabase): SQLiteColumnValues | null;
    getAllAsync(database: NativeDatabase): Promise<SQLiteColumnValues[]>;
    getAllSync(database: NativeDatabase): SQLiteColumnValues[];
    resetAsync(database: NativeDatabase): Promise<void>;
    resetSync(database: NativeDatabase): void;
    getColumnNamesAsync(): Promise<SQLiteColumnNames>;
    getColumnNamesSync(): SQLiteColumnNames;
    finalizeAsync(database: NativeDatabase): Promise<void>;
    finalizeSync(database: NativeDatabase): void;
}
export declare class SQLiteModule extends NativeModule {
    private hasListeners;
    readonly defaultDatabaseDirectory = ".";
    startObserving(): void;
    stopObserving(): void;
    deleteDatabaseAsync(databasePath: string): Promise<void>;
    deleteDatabaseSync(databasePath: string): void;
    ensureDatabasePathExistsAsync(databasePath: string): Promise<void>;
    ensureDatabasePathExistsSync(databasePath: string): void;
    importAssetDatabaseAsync(databasePath: string, assetDatabasePath: string, forceOverwrite: boolean): Promise<void>;
    readonly NativeDatabase: typeof NativeDatabase;
    readonly NativeStatement: typeof NativeStatement;
}
declare const SQLiteModuleInstance: typeof SQLiteModule;
export default SQLiteModuleInstance;
//# sourceMappingURL=SQLiteModule.d.ts.map