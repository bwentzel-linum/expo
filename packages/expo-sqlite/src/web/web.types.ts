import { type SQLiteOpenOptions } from '../NativeDatabase';
import {
  type SQLiteBindBlobParams,
  type SQLiteBindPrimitiveParams,
  type SQLiteColumnNames,
  type SQLiteColumnValues,
} from '../NativeStatement';
import { type SQLAction } from './SQLAction';

export interface SyncWorkerMessage {
  id: number;
  isSync: true;
  lockBuffer: SharedArrayBuffer;
  resultBuffer: SharedArrayBuffer;
}

export interface AsyncWorkerMessage {
  id: number;
  isSync: false;
}

export type BaseWorkerMessage = SyncWorkerMessage | AsyncWorkerMessage;

// Message types with numeric IDs
type OpenMessage = BaseWorkerMessage & {
  type: 'open';
  data: {
    nativeDatabaseId: number;
    databasePath: string;
    options: SQLiteOpenOptions;
    serializedData?: Uint8Array;
  };
};

type IsInTransactionMessage = BaseWorkerMessage & {
  type: 'isInTransaction';
  data: {
    nativeDatabaseId: number;
  };
};

type CloseMessage = BaseWorkerMessage & {
  type: 'close';
  data: {
    nativeDatabaseId: number;
  };
};

type ExecMessage = BaseWorkerMessage & {
  type: 'exec';
  data: {
    nativeDatabaseId: number;
    source: string;
  };
};

type PrepareMessage = BaseWorkerMessage & {
  type: 'prepare';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
    source: string;
  };
};

type RunMessage = BaseWorkerMessage & {
  type: 'run';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
    bindParams: SQLiteBindPrimitiveParams;
    bindBlobParams: SQLiteBindBlobParams;
    shouldPassAsArray: boolean;
  };
};

type StepMessage = BaseWorkerMessage & {
  type: 'step';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
  };
};

type GetAllMessage = BaseWorkerMessage & {
  type: 'getAll';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
  };
};

type ResetMessage = BaseWorkerMessage & {
  type: 'reset';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
  };
};

type GetColumnNamesMessage = BaseWorkerMessage & {
  type: 'getColumnNames';
  data: {
    nativeStatementId: number;
  };
};

type FinalizeMessage = BaseWorkerMessage & {
  type: 'finalize';
  data: {
    nativeDatabaseId: number;
    nativeStatementId: number;
  };
};

type DeleteDatabaseMessage = BaseWorkerMessage & {
  type: 'deleteDatabase';
  data: {
    databasePath: string;
  };
};

type SerializeMessage = BaseWorkerMessage & {
  type: 'serialize';
  data: {
    nativeDatabaseId: number;
    schemaName: string;
  };
};

type ImportAssetDatabaseMessage = BaseWorkerMessage & {
  type: 'importAssetDatabase';
  data: {
    databasePath: string;
    assetDatabasePath: string;
    forceOverwrite: boolean;
  };
};

export type SQLiteWorkerMessageType = keyof MessageTypeMap;
export type SQLiteWorkerMessage = MessageTypeMap[SQLiteWorkerMessageType];

// Message type mapping
export interface MessageTypeMap {
  open: OpenMessage;
  isInTransaction: IsInTransactionMessage;
  close: CloseMessage;
  exec: ExecMessage;
  prepare: PrepareMessage;
  run: RunMessage;
  step: StepMessage;
  getAll: GetAllMessage;
  reset: ResetMessage;
  getColumnNames: GetColumnNamesMessage;
  finalize: FinalizeMessage;
  deleteDatabase: DeleteDatabaseMessage;
  serialize: SerializeMessage;
  importAssetDatabase: ImportAssetDatabaseMessage;
}

// Result types
interface RunResult {
  lastInsertRowId: number;
  changes: number;
  firstRowValues: SQLiteColumnValues;
}

// Result type mapping
export interface ResultTypeMap {
  open: void;
  isInTransaction: boolean;
  close: void;
  exec: void;
  prepare: void;
  run: RunResult;
  step: SQLiteColumnValues | null;
  getAll: SQLiteColumnValues[];
  reset: void;
  getColumnNames: SQLiteColumnNames;
  finalize: void;
  deleteDatabase: void;
  serialize: Uint8Array;
}

export type ResultType = ResultTypeMap[keyof ResultTypeMap];

export type SQLiteWorkerResponse = {
  id: number;
  result?: ResultType;
  error?: Error;
};

// Continuous events
export interface OnDatabaseChangeMessage {
  type: 'onDatabaseChange';
  data: {
    databaseName: string | null;
    databaseFilePath: string | null;
    tableName: string | null;
    rowId: number | bigint;
    typeId: SQLAction;
  };
}
