export function createSQLAction(value) {
    switch (value) {
        case 9:
            return 'delete';
        case 18:
            return 'insert';
        case 23:
            return 'update';
        default:
            return 'unknown';
    }
}
//# sourceMappingURL=SQLAction.js.map