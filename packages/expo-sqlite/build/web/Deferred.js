export class Deferred {
    promise;
    resolveCallback;
    rejectCallback;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;
        });
    }
    resolve(value) {
        this.resolveCallback(value);
    }
    reject(reason) {
        this.rejectCallback(reason);
    }
    getPromise() {
        return this.promise;
    }
}
//# sourceMappingURL=Deferred.js.map