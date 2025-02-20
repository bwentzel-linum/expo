export declare class Deferred<T = any> {
    promise: Promise<T>;
    private resolveCallback;
    private rejectCallback;
    constructor();
    resolve(value: T): void;
    reject(reason: any): void;
    getPromise(): Promise<T>;
}
//# sourceMappingURL=Deferred.d.ts.map