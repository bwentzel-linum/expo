import { type SQLiteOpenOptions } from '../NativeDatabase';
export declare class SQLiteOptions implements SQLiteOpenOptions {
    enableChangeListener: boolean;
    useNewConnection: boolean;
    finalizeUnusedStatementsBeforeClosing: boolean;
    constructor(optionsObject: SQLiteOpenOptions);
    equals(other: SQLiteOptions): boolean;
    toString(): string;
}
//# sourceMappingURL=SQLiteOptions.d.ts.map