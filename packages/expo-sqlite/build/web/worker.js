import { createSQLAction } from './SQLAction';
import { SQLiteOptions } from './SQLiteOptions';
import { sendWorkerResult } from './WorkerChannel';
import { AccessHandlePoolVFS } from './wa-sqlite/AccessHandlePoolVFS';
import { MemoryVFS } from './wa-sqlite/MemoryVFS';
import * as SQLite from './wa-sqlite/sqlite-api';
import { SQLITE_ROW, SQLITE_DONE, SQLITE_OK, SQLITE_OPEN_READWRITE, SQLITE_OPEN_CREATE, } from './wa-sqlite/sqlite-constants';
import WaSQLiteFactory from './wa-sqlite/wa-sqlite.mjs';
// @ts-expect-error wasm module is not typed
import wasmModule from './wa-sqlite/wa-sqlite.wasm';
const VFS_NAME_PERSISTENT = 'expo-sqlite';
const VFS_NAME_MEMORY = 'expo-sqlite-memfs';
const MAX_INT32 = 0x7fffffff;
const MIN_INT32 = -0x80000000;
let _sqlite3 = null;
let _vfs = null;
let _vfsMemory = null;
const databaseIdMap = new Map();
const statementIdMap = new Map();
class SQLiteErrorException extends Error {
}
function findCachedDatabase(predicate) {
    for (const entity of databaseIdMap.values()) {
        if (predicate(entity)) {
            return entity;
        }
    }
    return null;
}
async function maybeInitAsync() {
    if (!_sqlite3) {
        const module = await WaSQLiteFactory({
            locateFile: () => wasmModule,
        });
        _sqlite3 = SQLite.Factory(module);
        if (!_sqlite3) {
            throw new Error('Failed to initialize wa-sqlite');
        }
        if (_vfs == null) {
            _vfs = await AccessHandlePoolVFS.create(VFS_NAME_PERSISTENT, module);
            if (_vfs == null) {
                throw new Error('Failed to initialize AccessHandlePoolVFS');
            }
        }
        _sqlite3.vfs_register(_vfs, true);
        if (_vfsMemory == null) {
            _vfsMemory = await MemoryVFS.create(VFS_NAME_MEMORY, module);
            if (_vfsMemory == null) {
                throw new Error('Failed to initialize MemoryVFS');
            }
        }
        _sqlite3.vfs_register(_vfsMemory, false);
    }
    return { sqlite3: _sqlite3, vfs: _vfs, vfsMemory: _vfsMemory };
}
async function maybeFinalizeAllStatements(nativeDatabaseId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    if (!dbEntity.openOptions.finalizeUnusedStatementsBeforeClosing) {
        return;
    }
    let error = null;
    const finalizedStatements = [];
    let stmt = sqlite3.next_stmt(dbEntity.pointer, null);
    while (stmt != null && stmt !== 0) {
        const nextStmt = sqlite3.next_stmt(dbEntity.pointer, stmt);
        try {
            sqlite3.finalize(stmt);
            finalizedStatements.push(stmt);
        }
        catch (e) {
            error = e;
        }
        stmt = nextStmt;
    }
    // Delete finalized statements from the map
    const statementsToDelete = [];
    for (const [nativeStatementId, stmtEntity] of statementIdMap.entries()) {
        if (finalizedStatements.includes(stmtEntity.pointer)) {
            statementsToDelete.push(nativeStatementId);
        }
    }
    for (const nativeStatementId of statementsToDelete) {
        statementIdMap.delete(nativeStatementId);
    }
    if (error)
        throw error;
}
async function openDatabase(nativeDatabaseId, databasePath, options, serializedData) {
    const { sqlite3 } = await maybeInitAsync();
    let pointer;
    if (serializedData) {
        pointer = await deserializeDatabase(sqlite3, serializedData);
    }
    else {
        const dbEntity = findCachedDatabase((entity) => entity.databasePath === databasePath &&
            entity.openOptions.equals(options) &&
            !options.useNewConnection);
        if (dbEntity) {
            databaseIdMap.set(nativeDatabaseId, dbEntity);
            await initDb(sqlite3, dbEntity);
            return;
        }
        const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;
        const vfsName = databasePath === ':memory:' ? VFS_NAME_MEMORY : VFS_NAME_PERSISTENT;
        pointer = await sqlite3.open_v2(databasePath, flags, vfsName);
    }
    const dbEntity = {
        pointer,
        databasePath,
        openOptions: options,
    };
    databaseIdMap.set(nativeDatabaseId, dbEntity);
    await initDb(sqlite3, dbEntity);
}
async function initDb(sqlite3, dbEntity) {
    if (dbEntity.openOptions.enableChangeListener) {
        addUpdateHook(sqlite3, dbEntity);
    }
}
function addUpdateHook(sqlite3, dbEntity) {
    sqlite3.update_hook(dbEntity.pointer, (updateType, dbName, tblName, rowId) => {
        const message = {
            type: 'onDatabaseChange',
            data: {
                databaseName: dbName,
                databaseFilePath: sqlite3.db_filename(dbEntity.pointer, dbName ?? 'main'),
                tableName: tblName,
                rowId: Number.isSafeInteger(rowId) ? rowId : Number(rowId),
                typeId: createSQLAction(updateType),
            },
        };
        self.postMessage(message);
    });
}
async function deserializeDatabase(sqlite3, serializedData) {
    const pointer = await sqlite3.open_v2(':memory:', SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, VFS_NAME_MEMORY);
    await sqlite3.deserialize(pointer, 'main', serializedData);
    return pointer;
}
async function isInTransaction(nativeDatabaseId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    return sqlite3.get_autocommit(dbEntity.pointer) === 0;
}
async function closeDatabase(nativeDatabaseId) {
    maybeFinalizeAllStatements(nativeDatabaseId);
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (dbEntity) {
        databaseIdMap.delete(nativeDatabaseId);
        await sqlite3.close(dbEntity.pointer);
    }
}
async function exec(nativeDatabaseId, source) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    await sqlite3.exec(dbEntity.pointer, source);
}
async function prepare(nativeDatabaseId, nativeStatementId, source) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const asyncIterable = sqlite3.statements(dbEntity.pointer, source, { unscoped: true });
    const asyncIterator = asyncIterable[Symbol.asyncIterator]();
    const { value: statementPointer } = await asyncIterator.next();
    asyncIterator.return?.();
    if (!statementPointer)
        throw new Error('Failed to prepare statement');
    statementIdMap.set(nativeStatementId, { pointer: statementPointer });
}
function getBindParamIndex(sqlite3, stmt, key, shouldPassAsArray) {
    let index;
    if (shouldPassAsArray) {
        const intKey = parseInt(key, 10);
        if (isNaN(intKey)) {
            throw new Error('Invalid bind parameter');
        }
        index = intKey + 1;
    }
    else {
        index = sqlite3.bind_parameter_index(stmt, key);
    }
    return index;
}
function bindStatementParam(sqlite3, stmt, param, index) {
    if (param == null) {
        sqlite3.bind_null(stmt, index);
    }
    else if (typeof param === 'number') {
        if (Number.isInteger(param)) {
            if (param > MAX_INT32 || param < MIN_INT32) {
                sqlite3.bind_int64(stmt, index, BigInt(param));
            }
            else {
                sqlite3.bind_int(stmt, index, param);
            }
        }
        else {
            sqlite3.bind_double(stmt, index, param);
        }
    }
    else if (typeof param === 'string') {
        sqlite3.bind_text(stmt, index, param);
    }
    else if (param instanceof Uint8Array) {
        sqlite3.bind_blob(stmt, index, param);
    }
    else if (typeof param === 'boolean') {
        sqlite3.bind_int(stmt, index, param ? 1 : 0);
    }
    else {
        throw new Error(`Unsupported parameter type: ${typeof param}`);
    }
}
function getColumnValues(sqlite3, stmt) {
    const columnCount = sqlite3.column_count(stmt);
    const columnValues = [];
    for (let i = 0; i < columnCount; i++) {
        columnValues[i] = getColumnValue(sqlite3, stmt, i);
    }
    return columnValues;
}
function getColumnValue(sqlite3, stmt, index) {
    const type = sqlite3.column_type(stmt, index);
    let value;
    switch (type) {
        case SQLite.SQLITE_INTEGER: {
            value = sqlite3.column_int_safe(stmt, index);
            break;
        }
        case SQLite.SQLITE_FLOAT: {
            value = sqlite3.column_double(stmt, index);
            break;
        }
        case SQLite.SQLITE_TEXT: {
            value = sqlite3.column_text(stmt, index);
            break;
        }
        case SQLite.SQLITE_BLOB: {
            value = sqlite3.column_blob(stmt, index);
            break;
        }
        case SQLite.SQLITE_NULL: {
            value = null;
            break;
        }
        default: {
            throw new Error(`Unsupported column type: ${type}`);
        }
    }
    return value;
}
async function run(nativeDatabaseId, nativeStatementId, bindParams, bindBlobParams, shouldPassAsArray) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    sqlite3.reset(stmt.pointer);
    sqlite3.clear_bindings(stmt.pointer);
    for (const [key, param] of Object.entries(bindParams)) {
        const index = getBindParamIndex(sqlite3, stmt.pointer, key, shouldPassAsArray);
        if (index > 0) {
            bindStatementParam(sqlite3, stmt.pointer, param, index);
        }
    }
    for (const [key, param] of Object.entries(bindBlobParams)) {
        const index = getBindParamIndex(sqlite3, stmt.pointer, key, shouldPassAsArray);
        if (index > 0) {
            bindStatementParam(sqlite3, stmt.pointer, param, index);
        }
    }
    const ret = await sqlite3.step(stmt.pointer);
    if (ret !== SQLITE_ROW && ret !== SQLITE_DONE) {
        throw new SQLiteErrorException('Error executing statement');
    }
    const firstRowValues = ret === SQLITE_ROW ? getColumnValues(sqlite3, stmt.pointer) : [];
    return {
        lastInsertRowId: Number(sqlite3.last_insert_rowid(dbEntity.pointer)),
        changes: sqlite3.changes(dbEntity.pointer),
        firstRowValues,
    };
}
async function step(nativeDatabaseId, nativeStatementId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const ret = await sqlite3.step(stmt.pointer);
    if (ret === SQLITE_ROW) {
        return getColumnValues(sqlite3, stmt.pointer);
    }
    if (ret !== SQLITE_DONE) {
        throw new Error('Error executing statement');
    }
    return null;
}
async function getAllRows(nativeDatabaseId, nativeStatementId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const rows = [];
    while (true) {
        const ret = await sqlite3.step(stmt.pointer);
        if (ret === SQLITE_ROW) {
            rows.push(getColumnValues(sqlite3, stmt.pointer));
            continue;
        }
        else if (ret === SQLITE_DONE) {
            break;
        }
        throw new Error('Error executing statement');
    }
    return rows;
}
async function reset(nativeDatabaseId, nativeStatementId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    if ((await sqlite3.reset(stmt.pointer)) !== SQLITE_OK) {
        throw new Error('Error resetting statement');
    }
}
async function getColumnNames(nativeStatementId) {
    const { sqlite3 } = await maybeInitAsync();
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const columnCount = sqlite3.column_count(stmt.pointer);
    const columnNames = [];
    for (let i = 0; i < columnCount; i++) {
        columnNames.push(sqlite3.column_name(stmt.pointer, i));
    }
    return columnNames;
}
async function finalize(nativeDatabaseId, nativeStatementId) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt)
        throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    statementIdMap.delete(nativeStatementId);
    if ((await sqlite3.finalize(stmt.pointer)) !== SQLITE_OK) {
        throw new Error('Error finalizing statement');
    }
}
async function deleteDatabase(databasePath) {
    const { vfs } = await maybeInitAsync();
    if (databasePath !== ':memory:') {
        vfs.jDelete(databasePath, 0 /* unused arg for AccessHandlePoolVFS */);
    }
}
async function serializeDatabase(nativeDatabaseId, schemaName) {
    const { sqlite3 } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity)
        throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    return sqlite3.serialize(dbEntity.pointer, schemaName);
}
async function importAssetDatabase(databasePath, assetDatabasePath, forceOverwrite) {
    const { sqlite3, vfs } = await maybeInitAsync();
    if (!forceOverwrite) {
        const buffer = new DataView(new ArrayBuffer(4));
        await vfs.jAccess(databasePath, 0 /* unused arg for AccessHandlePoolVFS */, buffer);
        if (buffer.getUint8(0) === 1) {
            return;
        }
    }
    const response = await fetch(assetDatabasePath);
    if (!response.ok) {
        throw new Error(`[importAssetDatabaseAsync] Failed to fetch asset database: ${response.statusText}`);
    }
    try {
        const serializedData = new Uint8Array(await response.arrayBuffer());
        const srcDb = await sqlite3.open_v2(databasePath, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, VFS_NAME_PERSISTENT);
        await sqlite3.deserialize(srcDb, 'main', serializedData);
        const destDb = await sqlite3.open_v2(databasePath);
        await sqlite3.backup(destDb, 'main', srcDb, 'main');
        await sqlite3.close(srcDb);
        await sqlite3.close(destDb);
    }
    catch (e) {
        console.error('ooxx', e);
    }
}
async function handleMessageImpl({ type, data, }) {
    let result;
    switch (type) {
        case 'open': {
            await openDatabase(data.nativeDatabaseId, data.databasePath, new SQLiteOptions(data.options), data.serializedData);
            break;
        }
        case 'isInTransaction': {
            result = await isInTransaction(data.nativeDatabaseId);
            break;
        }
        case 'close': {
            await closeDatabase(data.nativeDatabaseId);
            break;
        }
        case 'exec': {
            await exec(data.nativeDatabaseId, data.source);
            break;
        }
        case 'prepare': {
            result = await prepare(data.nativeDatabaseId, data.nativeStatementId, data.source);
            break;
        }
        case 'run': {
            result = await run(data.nativeDatabaseId, data.nativeStatementId, data.bindParams, data.bindBlobParams, data.shouldPassAsArray);
            break;
        }
        case 'step': {
            result = await step(data.nativeDatabaseId, data.nativeStatementId);
            break;
        }
        case 'getAll': {
            result = await getAllRows(data.nativeDatabaseId, data.nativeStatementId);
            break;
        }
        case 'reset': {
            await reset(data.nativeDatabaseId, data.nativeStatementId);
            break;
        }
        case 'getColumnNames': {
            result = await getColumnNames(data.nativeStatementId);
            break;
        }
        case 'finalize': {
            await finalize(data.nativeDatabaseId, data.nativeStatementId);
            break;
        }
        case 'deleteDatabase': {
            await deleteDatabase(data.databasePath);
            break;
        }
        case 'serialize': {
            result = await serializeDatabase(data.nativeDatabaseId, data.schemaName);
            break;
        }
        case 'importAssetDatabase':
            await importAssetDatabase(data.databasePath, data.assetDatabasePath, data.forceOverwrite);
            break;
        default: {
            throw new Error(`Unknown message type: ${type}`);
        }
    }
    return result;
}
self.onmessage = async (event) => {
    let result = null;
    let error = null;
    try {
        const message = event.data;
        result = await handleMessageImpl(message);
    }
    catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
    }
    const syncTrait = event.data.isSync
        ? {
            lockBuffer: event.data.lockBuffer,
            resultBuffer: event.data.resultBuffer,
        }
        : undefined;
    sendWorkerResult({
        id: event.data.id,
        result,
        error,
        syncTrait,
    });
};
//# sourceMappingURL=worker.js.map