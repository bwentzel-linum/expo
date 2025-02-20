import { sendWorkerResult } from './WorkerChannel';
import { AccessHandlePoolVFS } from './wa-sqlite/AccessHandlePoolVFS';
import * as SQLite from './wa-sqlite/sqlite-api';
import { SQLITE_ROW, SQLITE_DONE, SQLITE_OK } from './wa-sqlite/sqlite-constants';
import WaSQLiteFactory from './wa-sqlite/wa-sqlite-async.mjs';
// @ts-expect-error wasm module is not typed
import wasmModule from './wa-sqlite/wa-sqlite-async.wasm';
let _sqlite3 = null;
let _vfs = null;
const databases = new Map();
const statements = new Map();
let nextStatementId = 1;
async function maybeInitAsync() {
    if (!_sqlite3 || !_vfs) {
        const module = await WaSQLiteFactory({
            locateFile: () => wasmModule,
        });
        _sqlite3 = SQLite.Factory(module);
        _vfs = await AccessHandlePoolVFS.create('expo-sqlite', module);
        if (!_sqlite3 || !_vfs) {
            throw new Error('Failed to initialize wa-sqlite');
        }
        _sqlite3.vfs_register(_vfs, true);
    }
    return [_sqlite3, _vfs];
}
class SQLiteErrorException extends Error {
}
async function openDatabase(databaseName) {
    const [sqlite3] = await maybeInitAsync();
    const db = await sqlite3.open_v2(databaseName);
    databases.set(databaseName, db);
}
async function isInTransaction(databaseName) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    return sqlite3.get_autocommit(db) === 0;
}
async function closeDatabase(databaseName) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (db) {
        await sqlite3.close(db);
        databases.delete(databaseName);
    }
}
async function exec(databaseName, source) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    await sqlite3.exec(db, source);
}
async function prepare(databaseName, source) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const asyncIterable = sqlite3.statements(db, source, { unscoped: true });
    const asyncIterator = asyncIterable[Symbol.asyncIterator]();
    try {
        const { value: statement } = await asyncIterator.next();
        if (!statement)
            throw new Error('Failed to prepare statement');
        const statementId = nextStatementId++;
        statements.set(statementId, statement);
        return { statementId };
    }
    catch (e) {
        throw new Error('Failed to prepare statement', { cause: e });
    }
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
        sqlite3.bind_int(stmt, index, param);
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
            value = sqlite3.column_int(stmt, index);
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
async function run(databaseName, statementId, bindParams, bindBlobParams, shouldPassAsArray) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    sqlite3.reset(stmt);
    sqlite3.clear_bindings(stmt);
    for (const [key, param] of Object.entries(bindParams)) {
        const index = getBindParamIndex(sqlite3, stmt, key, shouldPassAsArray);
        if (index > 0) {
            bindStatementParam(sqlite3, stmt, param, index);
        }
    }
    for (const [key, param] of Object.entries(bindBlobParams)) {
        const index = getBindParamIndex(sqlite3, stmt, key, shouldPassAsArray);
        if (index > 0) {
            bindStatementParam(sqlite3, stmt, param, index);
        }
    }
    const ret = await sqlite3.step(stmt);
    if (ret !== SQLITE_ROW && ret !== SQLITE_DONE) {
        throw new SQLiteErrorException('Error executing statement');
    }
    return {
        lastInsertRowId: Number(sqlite3.last_insert_rowid(db)),
        changes: sqlite3.changes(db),
        firstRowValues: ret === SQLITE_ROW ? getColumnValues(sqlite3, stmt) : [],
    };
}
async function step(databaseName, statementId) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    const ret = await sqlite3.step(stmt);
    if (ret === SQLITE_ROW) {
        return getColumnValues(sqlite3, stmt);
    }
    if (ret !== SQLITE_DONE) {
        throw new Error('Error executing statement');
    }
    return null;
}
async function getAllRows(databaseName, statementId) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    const rows = [];
    while (true) {
        const ret = await sqlite3.step(stmt);
        if (ret === SQLITE_ROW) {
            rows.push(getColumnValues(sqlite3, stmt));
            continue;
        }
        else if (ret === SQLITE_DONE) {
            break;
        }
        throw new Error('Error executing statement');
    }
    return rows;
}
async function reset(databaseName, statementId) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    if ((await sqlite3.reset(stmt)) !== SQLITE_OK) {
        throw new Error('Error resetting statement');
    }
}
async function getColumnNames(statementId) {
    const [sqlite3] = await maybeInitAsync();
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    const columnCount = sqlite3.column_count(stmt);
    const columnNames = [];
    for (let i = 0; i < columnCount; i++) {
        columnNames.push(sqlite3.column_name(stmt, i));
    }
    return columnNames;
}
async function finalize(databaseName, statementId) {
    const [sqlite3] = await maybeInitAsync();
    const db = databases.get(databaseName);
    if (!db)
        throw new Error(`Database ${databaseName} not found`);
    const stmt = statements.get(statementId);
    if (!stmt)
        throw new Error(`Statement ${statementId} not found`);
    if ((await sqlite3.finalize(stmt)) !== SQLITE_OK) {
        throw new Error('Error finalizing statement');
    }
    statements.delete(statementId);
}
async function deleteDatabase(databaseName) {
    _vfs.jDelete(databaseName, 0 /* unused arg for AccessHandlePoolVFS */);
}
async function handleMessageImpl({ type, data, }) {
    let result;
    switch (type) {
        case 'open': {
            await openDatabase(data.databaseName);
            break;
        }
        case 'isInTransaction': {
            result = await isInTransaction(data.databaseName);
            break;
        }
        case 'close': {
            await closeDatabase(data.databaseName);
            break;
        }
        case 'exec': {
            await exec(data.databaseName, data.source);
            break;
        }
        case 'prepare': {
            result = await prepare(data.databaseName, data.source);
            break;
        }
        case 'run': {
            result = await run(data.databaseName, data.statementId, data.bindParams, data.bindBlobParams, data.shouldPassAsArray);
            break;
        }
        case 'step': {
            result = await step(data.databaseName, data.statementId);
            break;
        }
        case 'getAll': {
            result = await getAllRows(data.databaseName, data.statementId);
            break;
        }
        case 'reset': {
            await reset(data.databaseName, data.statementId);
            break;
        }
        case 'getColumnNames': {
            result = await getColumnNames(data.statementId);
            break;
        }
        case 'finalize': {
            await finalize(data.databaseName, data.statementId);
            break;
        }
        case 'deleteDatabase': {
            await deleteDatabase(data.databaseName);
            break;
        }
        default: {
            throw new Error(`Unknown message type: ${type}`);
        }
    }
    return result;
}
export async function handleMessage(event) {
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
}
//# sourceMappingURL=WorkerImpl.js.map