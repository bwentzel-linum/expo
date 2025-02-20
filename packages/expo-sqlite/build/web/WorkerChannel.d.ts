import { type SQLiteWorkerMessageType, type MessageTypeMap, type ResultType, type ResultTypeMap } from './web.types';
export declare function sendWorkerResult({ id, result, error, syncTrait, }: {
    id: number;
    result: ResultType | null;
    error: Error | null;
    syncTrait?: {
        lockBuffer: SharedArrayBuffer;
        resultBuffer: SharedArrayBuffer;
    };
}): void;
export declare function workerMessageHandler(event: MessageEvent): void;
export declare function invokeWorkerAsync<T extends SQLiteWorkerMessageType>(worker: Worker, type: T, data: MessageTypeMap[T]['data']): Promise<ResultTypeMap[T]>;
export declare function invokeWorkerSync<T extends SQLiteWorkerMessageType>(worker: Worker, type: T, data: MessageTypeMap[T]['data']): ResultTypeMap[T];
//# sourceMappingURL=WorkerChannel.d.ts.map