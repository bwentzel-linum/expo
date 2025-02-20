const UINT8ARRAY_TYPE = '__uint8array__';
function isUint8ArrayMarker(value) {
    return (value !== null &&
        typeof value === 'object' &&
        UINT8ARRAY_TYPE in value &&
        Array.isArray(value.data));
}
/**
 * Serializes a value to a string that supports Uint8Arrays.
 */
export function serialize(value) {
    return JSON.stringify(value, (_, v) => {
        if (v instanceof Uint8Array) {
            return {
                [UINT8ARRAY_TYPE]: true,
                data: Array.from(v),
            };
        }
        return v;
    });
}
/**
 * Deserializes a string to value that supports Uint8Arrays.
 */
export function deserialize(json) {
    return JSON.parse(json, (_, value) => {
        if (isUint8ArrayMarker(value)) {
            return new Uint8Array(value.data);
        }
        return value;
    });
}
//# sourceMappingURL=SyncSerializer.js.map