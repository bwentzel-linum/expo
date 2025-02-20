import { registerWebModule, NativeModule } from 'expo';
import { invokeWorkerAsync, invokeWorkerSync, workerMessageHandler } from './WorkerChannel';
let worker = null;
let nextNativeDatabaseId = 0;
let nextNativeStatementId = 0;
function getWorker() {
    if (!worker) {
        worker = new Worker('/expo-sqlite/worker.js', { type: 'module' });
        worker.addEventListener('message', (event) => {
            if (event.data.type === 'onDatabaseChange') {
                // @ts-expect-error EventEmitter type for NativeModule is not inferred correctly on web.
                SQLiteModuleInstance.emit(event.data.type, event.data.data);
                return;
            }
            workerMessageHandler(event);
        });
    }
    return worker;
}
class NativeDatabase {
    databasePath;
    options;
    serializedData;
    id;
    constructor(databasePath, options, serializedData) {
        this.databasePath = databasePath;
        this.options = options;
        this.serializedData = serializedData;
        this.id = ++nextNativeDatabaseId;
    }
    async initAsync() {
        await invokeWorkerAsync(getWorker(), 'open', {
            nativeDatabaseId: this.id,
            databasePath: this.databasePath,
            options: this.options ?? {},
            serializedData: this.serializedData,
        });
    }
    initSync() {
        invokeWorkerSync(getWorker(), 'open', {
            nativeDatabaseId: this.id,
            databasePath: this.databasePath,
            options: this.options ?? {},
            serializedData: this.serializedData,
        });
    }
    async isInTransactionAsync() {
        return await invokeWorkerAsync(getWorker(), 'isInTransaction', {
            nativeDatabaseId: this.id,
        });
    }
    isInTransactionSync() {
        return invokeWorkerSync(getWorker(), 'isInTransaction', {
            nativeDatabaseId: this.id,
        });
    }
    async closeAsync() {
        await invokeWorkerAsync(getWorker(), 'close', {
            nativeDatabaseId: this.id,
        });
    }
    closeSync() {
        invokeWorkerSync(getWorker(), 'close', {
            nativeDatabaseId: this.id,
        });
    }
    async execAsync(source) {
        await invokeWorkerAsync(getWorker(), 'exec', {
            nativeDatabaseId: this.id,
            source,
        });
    }
    execSync(source) {
        invokeWorkerSync(getWorker(), 'exec', {
            nativeDatabaseId: this.id,
            source,
        });
    }
    async serializeAsync(schemaName) {
        return await invokeWorkerAsync(getWorker(), 'serialize', {
            nativeDatabaseId: this.id,
            schemaName,
        });
    }
    serializeSync(schemaName) {
        return invokeWorkerSync(getWorker(), 'serialize', {
            nativeDatabaseId: this.id,
            schemaName,
        });
    }
    async prepareAsync(nativeStatement, source) {
        await invokeWorkerAsync(getWorker(), 'prepare', {
            nativeDatabaseId: this.id,
            nativeStatementId: nativeStatement.id,
            source,
        });
    }
    prepareSync(nativeStatement, source) {
        invokeWorkerSync(getWorker(), 'prepare', {
            nativeDatabaseId: this.id,
            nativeStatementId: nativeStatement.id,
            source,
        });
    }
    async importAssetDatabaseAsync(data) {
        await this.channel.invokeWorker({
            type: 'importAssetDatabase',
            databaseId: this.id,
            name: this.databaseName,
            data,
            options: this.options,
        });
    }
}
class NativeStatement {
    id;
    constructor() {
        this.id = ++nextNativeStatementId;
    }
    async runAsync(database, bindParams, bindBlobParams, shouldPassAsArray) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return await invokeWorkerAsync(getWorker(), 'run', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
            bindParams,
            bindBlobParams,
            shouldPassAsArray,
        });
    }
    runSync(database, bindParams, bindBlobParams, shouldPassAsArray) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return invokeWorkerSync(getWorker(), 'run', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
            bindParams,
            bindBlobParams,
            shouldPassAsArray,
        });
    }
    async stepAsync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return await invokeWorkerAsync(getWorker(), 'step', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    stepSync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return invokeWorkerSync(getWorker(), 'step', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    async getAllAsync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return await invokeWorkerAsync(getWorker(), 'getAll', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    getAllSync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return invokeWorkerSync(getWorker(), 'getAll', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    async resetAsync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        await invokeWorkerAsync(getWorker(), 'reset', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    resetSync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        invokeWorkerSync(getWorker(), 'reset', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    async getColumnNamesAsync() {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return await invokeWorkerAsync(getWorker(), 'getColumnNames', {
            nativeStatementId: this.id,
        });
    }
    getColumnNamesSync() {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        return invokeWorkerSync(getWorker(), 'getColumnNames', {
            nativeStatementId: this.id,
        });
    }
    async finalizeAsync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        await invokeWorkerAsync(getWorker(), 'finalize', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
    finalizeSync(database) {
        if (this.id == null) {
            throw new Error('Statement not prepared');
        }
        invokeWorkerSync(getWorker(), 'finalize', {
            nativeDatabaseId: database.id,
            nativeStatementId: this.id,
        });
    }
}
export class SQLiteModule extends NativeModule {
    hasListeners = false;
    defaultDatabaseDirectory = '.';
    startObserving() {
        this.hasListeners = true;
    }
    stopObserving() {
        this.hasListeners = false;
    }
    async deleteDatabaseAsync(databasePath) {
        await invokeWorkerAsync(getWorker(), 'deleteDatabase', {
            databasePath,
        });
    }
    deleteDatabaseSync(databasePath) {
        invokeWorkerSync(getWorker(), 'deleteDatabase', {
            databasePath,
        });
    }
    async ensureDatabasePathExistsAsync(databasePath) {
        // No-op for web
    }
    ensureDatabasePathExistsSync(databasePath) {
        // No-op for web
    }
    async importAssetDatabaseAsync(databasePath, assetDatabasePath, forceOverwrite) {
        await invokeWorkerAsync(getWorker(), 'importAssetDatabase', {
            databasePath,
            assetDatabasePath,
            forceOverwrite,
        });
    }
    NativeDatabase = NativeDatabase;
    NativeStatement = NativeStatement;
}
const SQLiteModuleInstance = registerWebModule(SQLiteModule);
export default SQLiteModuleInstance;
//# sourceMappingURL=SQLiteModule.js.map