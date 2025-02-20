export class SQLiteOptions {
    enableChangeListener = false;
    useNewConnection = false;
    finalizeUnusedStatementsBeforeClosing = true;
    constructor(optionsObject) {
        this.enableChangeListener = optionsObject.enableChangeListener ?? false;
        this.useNewConnection = optionsObject.useNewConnection ?? false;
        this.finalizeUnusedStatementsBeforeClosing =
            optionsObject.finalizeUnusedStatementsBeforeClosing ?? true;
    }
    equals(other) {
        return (this.enableChangeListener === other.enableChangeListener &&
            this.finalizeUnusedStatementsBeforeClosing === other.finalizeUnusedStatementsBeforeClosing &&
            this.useNewConnection === other.useNewConnection);
    }
    toString() {
        return JSON.stringify({
            enableChangeListener: this.enableChangeListener,
            finalizeUnusedStatementsBeforeClosing: this.finalizeUnusedStatementsBeforeClosing,
            useNewConnection: this.useNewConnection,
        });
    }
}
//# sourceMappingURL=SQLiteOptions.js.map