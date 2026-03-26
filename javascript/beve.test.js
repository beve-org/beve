const beve = require('./beve.js');
const fs = require('fs');
const path = require('path');

// Helper to get actual buffer from over-allocated write buffer
function getActualBuffer(encoded) {
    // Find the last non-zero byte (accounting for legitimate zero data)
    // For a more reliable approach, we encode and decode in one step
    return encoded;
}

// Helper to round-trip test: encode then decode
function roundTrip(value) {
    const encoded = beve.write_beve(value);
    // Find actual buffer size by trimming trailing zeros
    // This is tricky because zeros can be valid data
    // Instead, we'll rely on the decoder to stop at the right place
    let size = encoded.length;
    for (let i = encoded.length - 1; i >= 0; i--) {
        if (encoded[i] !== 0) {
            size = i + 1;
            break;
        }
    }
    const buffer = new Uint8Array(encoded.buffer, 0, size);
    return beve.read_beve(buffer);
}

describe('BEVE JavaScript Library', () => {

    describe('Primitive Types', () => {

        test('boolean true', () => {
            expect(roundTrip(true)).toBe(true);
        });

        test('boolean false', () => {
            expect(roundTrip(false)).toBe(false);
        });

        test('integer zero', () => {
            expect(roundTrip(0)).toBe(0);
        });

        test('positive integer', () => {
            expect(roundTrip(42)).toBe(42);
        });

        test('negative integer', () => {
            expect(roundTrip(-42)).toBe(-42);
        });

        test('large positive integer', () => {
            expect(roundTrip(1000000)).toBe(1000000);
        });

        test('large negative integer', () => {
            expect(roundTrip(-1000000)).toBe(-1000000);
        });

        test('floating point number', () => {
            expect(roundTrip(3.14159)).toBeCloseTo(3.14159);
        });

        test('negative floating point', () => {
            expect(roundTrip(-2.71828)).toBeCloseTo(-2.71828);
        });

        test('very small floating point', () => {
            expect(roundTrip(0.000001)).toBeCloseTo(0.000001);
        });

        test('large floating point', () => {
            // Use a clear non-integer to ensure it's encoded as float64
            expect(roundTrip(1234567890.123456)).toBeCloseTo(1234567890.123456);
        });
    });

    describe('Null and Undefined Handling (Issue #7)', () => {

        test('null value', () => {
            expect(roundTrip(null)).toBe(null);
        });

        test('undefined converts to null', () => {
            expect(roundTrip(undefined)).toBe(null);
        });

        test('object with null value', () => {
            const input = { value: null };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with undefined value is omitted', () => {
            const input = { defined: 'yes', notDefined: undefined };
            const expected = { defined: 'yes' };
            expect(roundTrip(input)).toEqual(expected);
        });

        test('object with only undefined values becomes empty', () => {
            const input = { a: undefined, b: undefined };
            expect(roundTrip(input)).toEqual({});
        });

        test('array with null elements', () => {
            const input = [1, null, 3];
            expect(roundTrip(input)).toEqual([1, null, 3]);
        });

        test('array with undefined elements converts to null', () => {
            const input = [1, undefined, 3];
            const expected = [1, null, 3];
            expect(roundTrip(input)).toEqual(expected);
        });

        test('nested object with null', () => {
            const input = { outer: { inner: null } };
            expect(roundTrip(input)).toEqual(input);
        });

        test('mixed null and undefined in object', () => {
            const input = {
                present: 'value',
                isNull: null,
                isUndefined: undefined
            };
            const expected = {
                present: 'value',
                isNull: null
            };
            expect(roundTrip(input)).toEqual(expected);
        });
    });

    describe('String Handling', () => {

        test('empty string', () => {
            expect(roundTrip('')).toBe('');
        });

        test('single character', () => {
            expect(roundTrip('a')).toBe('a');
        });

        test('short string', () => {
            expect(roundTrip('hello')).toBe('hello');
        });

        test('string with spaces', () => {
            expect(roundTrip('hello world')).toBe('hello world');
        });

        test('string with special characters', () => {
            expect(roundTrip('hello\nworld\ttab')).toBe('hello\nworld\ttab');
        });
    });

    describe('String Length Boundaries (Issue #9)', () => {

        test('62-character string (boundary - 2)', () => {
            const input = 'A'.repeat(62);
            expect(roundTrip(input)).toBe(input);
        });

        test('63-character string (boundary - 1)', () => {
            const input = 'A'.repeat(63);
            expect(roundTrip(input)).toBe(input);
        });

        test('64-character string (boundary)', () => {
            const input = 'A'.repeat(64);
            expect(roundTrip(input)).toBe(input);
        });

        test('65-character string (boundary + 1)', () => {
            const input = 'A'.repeat(65);
            expect(roundTrip(input)).toBe(input);
        });

        test('100-character string', () => {
            const input = 'A'.repeat(100);
            expect(roundTrip(input)).toBe(input);
        });

        test('127-character string (from bug report)', () => {
            const input = 'A'.repeat(127);
            expect(roundTrip(input)).toBe(input);
        });

        test('500-character string', () => {
            const input = 'A'.repeat(500);
            expect(roundTrip(input)).toBe(input);
        });

        test('1000-character string', () => {
            const input = 'A'.repeat(1000);
            expect(roundTrip(input)).toBe(input);
        });

        test('16383-character string (4-byte boundary - 1)', () => {
            const input = 'A'.repeat(16383);
            expect(roundTrip(input)).toBe(input);
        });

        test('16384-character string (4-byte boundary)', () => {
            const input = 'A'.repeat(16384);
            expect(roundTrip(input)).toBe(input);
        });
    });

    describe('UTF-8 Multi-byte Characters', () => {

        test('string with emoji (4-byte UTF-8)', () => {
            const input = 'Hello 😀 World';
            expect(roundTrip(input)).toBe(input);
        });

        test('emoji-only string', () => {
            const input = '😀😁😂🤣😃😄😅😆';
            expect(roundTrip(input)).toBe(input);
        });

        test('20 emojis (80 UTF-8 bytes, triggers 2-byte compressed)', () => {
            const input = '😀'.repeat(20);
            expect(roundTrip(input)).toBe(input);
        });

        test('Chinese characters (3-byte UTF-8)', () => {
            const input = '你好世界';
            expect(roundTrip(input)).toBe(input);
        });

        test('mixed ASCII and multi-byte', () => {
            const input = 'Hello 你好 World 🌍';
            expect(roundTrip(input)).toBe(input);
        });

        test('string where char count != byte count at boundary', () => {
            // 21 characters but 63 bytes (21 * 3 for Chinese)
            const input = '中'.repeat(21);
            expect(roundTrip(input)).toBe(input);
        });

        test('string where char count < 64 but byte count >= 64', () => {
            // 22 Chinese characters = 66 bytes, triggers 2-byte compressed
            const input = '中'.repeat(22);
            expect(roundTrip(input)).toBe(input);
        });
    });

    describe('Objects', () => {

        test('empty object', () => {
            expect(roundTrip({})).toEqual({});
        });

        test('simple object with string value', () => {
            const input = { name: 'test' };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with number value', () => {
            const input = { count: 42 };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with boolean value', () => {
            const input = { active: true };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with multiple fields', () => {
            const input = { name: 'test', count: 42, active: true };
            expect(roundTrip(input)).toEqual(input);
        });

        test('nested object', () => {
            const input = {
                outer: {
                    inner: 'value'
                }
            };
            expect(roundTrip(input)).toEqual(input);
        });

        test('deeply nested object', () => {
            const input = {
                a: {
                    b: {
                        c: {
                            d: 'deep'
                        }
                    }
                }
            };
            expect(roundTrip(input)).toEqual(input);
        });
    });

    describe('Object Key Boundaries', () => {

        test('object with 63-char key', () => {
            const key = 'k'.repeat(63);
            const input = {};
            input[key] = 'value';
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with 64-char key', () => {
            const key = 'k'.repeat(64);
            const input = {};
            input[key] = 'value';
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with 65-char key', () => {
            const key = 'k'.repeat(65);
            const input = {};
            input[key] = 'value';
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with UTF-8 key', () => {
            const input = { '你好': 'world' };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with emoji key', () => {
            const input = { '😀': 'smile' };
            expect(roundTrip(input)).toEqual(input);
        });
    });

    describe('Objects with Long String Values (Issue #9 Scenario)', () => {

        test('object with 64-char string field', () => {
            const input = { content: 'A'.repeat(64) };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with 127-char string field (bug report case)', () => {
            const input = { content: 'A'.repeat(127) };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with multiple long string fields', () => {
            const input = {
                field1: 'A'.repeat(100),
                field2: 'B'.repeat(100),
                field3: 'C'.repeat(100)
            };
            expect(roundTrip(input)).toEqual(input);
        });

        test('mixed content like bug report', () => {
            const input = {
                content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                createdAt: 'Sun Jan 14 2024',
                id: 12345
            };
            expect(roundTrip(input)).toEqual(input);
        });
    });

    describe('Typed Arrays', () => {

        test('integer array', () => {
            const input = [1, 2, 3, 4, 5];
            expect(roundTrip(input)).toEqual(input);
        });

        test('float array', () => {
            const input = [1.1, 2.2, 3.3, 4.4, 5.5];
            const result = roundTrip(input);
            for (let i = 0; i < input.length; i++) {
                expect(result[i]).toBeCloseTo(input[i]);
            }
        });

        test('large integer array', () => {
            const input = Array.from({ length: 100 }, (_, i) => i);
            expect(roundTrip(input)).toEqual(input);
        });

        test('array with negative integers', () => {
            const input = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
            expect(roundTrip(input)).toEqual(input);
        });
    });

    describe('Untyped Arrays', () => {

        test('single element array', () => {
            const input = ['single'];
            expect(roundTrip(input)).toEqual(input);
        });

        test('mixed type array', () => {
            const input = ['string', 42, true, false];
            expect(roundTrip(input)).toEqual(input);
        });

        test('array of objects', () => {
            const input = [{ a: 1 }, { b: 2 }];
            expect(roundTrip(input)).toEqual(input);
        });

        test('nested arrays', () => {
            // Note: nested arrays may be treated as typed if inner arrays are numeric
            const input = [['a', 'b'], ['c', 'd']];
            expect(roundTrip(input)).toEqual(input);
        });
    });

    describe('Edge Cases', () => {

        test('object with empty string value', () => {
            const input = { empty: '' };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with zero value', () => {
            const input = { zero: 0 };
            expect(roundTrip(input)).toEqual(input);
        });

        test('object with false value', () => {
            const input = { flag: false };
            expect(roundTrip(input)).toEqual(input);
        });

        test('string with null character', () => {
            const input = 'hello\0world';
            expect(roundTrip(input)).toBe(input);
        });

        test('unicode string with surrogate pairs', () => {
            const input = '𝟙𝟚𝟛'; // Mathematical bold digits (4-byte UTF-8 each)
            expect(roundTrip(input)).toBe(input);
        });
    });

    describe('Aligned Typed Arrays', () => {

        test('aligned float64 array [1.0, 2.0, 3.0]', () => {
            // From the proposal's worked example
            const buf = new Uint8Array([
                0x5C, 0x64, 0x0C, 0x04, 0x00, 0x00, 0x00, 0x00, // headers, size=3, padding=4
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F, // 1.0
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, // 2.0
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x40, // 3.0
            ]);
            const result = beve.read_beve(buf);
            expect(result).toEqual([1.0, 2.0, 3.0]);
        });

        test('aligned int32 array [10, 20, 30]', () => {
            const buf = new Uint8Array([
                0x5C, 0x4C, 0x0C, 0x00, // headers, size=3, padding=0
                0x0A, 0x00, 0x00, 0x00, // 10
                0x14, 0x00, 0x00, 0x00, // 20
                0x1E, 0x00, 0x00, 0x00, // 30
            ]);
            const result = beve.read_beve(buf);
            expect(result).toEqual([10, 20, 30]);
        });

        test('aligned uint16 array [100, 200, 300]', () => {
            const buf = new Uint8Array([
                0x5C, 0x34, 0x0C, 0x00, // headers, size=3, padding=0
                0x64, 0x00,             // 100
                0xC8, 0x00,             // 200
                0x2C, 0x01,             // 300
            ]);
            const result = beve.read_beve(buf);
            expect(result).toEqual([100, 200, 300]);
        });

        test('aligned float64 array from example file', () => {
            const filePath = path.join(__dirname, '..', 'examples', 'aligned_float64_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toEqual([1.0, 2.0, 3.0]);
            }
        });

        test('aligned int32 array from example file', () => {
            const filePath = path.join(__dirname, '..', 'examples', 'aligned_int32_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toEqual([10, 20, 30]);
            }
        });

        test('aligned float32 array with padding', () => {
            // Construct an aligned float32 array where padding is needed
            // Header: 0x5C, Numeric: 0x44 (float32), Size: 2 (0x08)
            // offset_after_padding_length = 4, alignment = 4, padding = (4-4%4)%4 = 0
            const buf = new Uint8Array([
                0x5C, 0x44, 0x08, 0x00, // headers, size=2, padding=0
                0x00, 0x00, 0x80, 0x3F, // 1.0f
                0x00, 0x00, 0x00, 0x40, // 2.0f
            ]);
            const result = beve.read_beve(buf);
            expect(result[0]).toBeCloseTo(1.0);
            expect(result[1]).toBeCloseTo(2.0);
        });

        test('aligned int8 array (no alignment needed)', () => {
            const buf = new Uint8Array([
                0x5C, 0x0C, 0x10, 0x00, // headers (int8), size=4, padding=0
                0x01, 0x02, 0x03, 0x04, // 1, 2, 3, 4
            ]);
            const result = beve.read_beve(buf);
            expect(result).toEqual([1, 2, 3, 4]);
        });
    });

    describe('Compatibility Tests with Example Files', () => {
        const examplesDir = path.join(__dirname, '..', 'examples');

        test('general_object.beve can be read', () => {
            const filePath = path.join(examplesDir, 'general_object.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(typeof data).toBe('object');
            }
        });

        test('nested_object.beve can be read', () => {
            const filePath = path.join(examplesDir, 'nested_object.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(typeof data).toBe('object');
            }
        });

        test('float32_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'float32_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(data.values).toBeDefined();
                expect(Array.isArray(data.values)).toBe(true);
            }
        });

        test('float64_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'float64_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(data.values).toBeDefined();
                expect(Array.isArray(data.values)).toBe(true);
            }
        });

        test('strings_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'strings_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(data.values).toBeDefined();
                expect(Array.isArray(data.values)).toBe(true);
                expect(data.values).toEqual(['cat', 'dog', 'elephant']);
            }
        });

        test('uint16_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'uint16_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                expect(data).toBeDefined();
                expect(data.values).toBeDefined();
                expect(Array.isArray(data.values)).toBe(true);
            }
        });
    });

    describe('Regression Tests', () => {

        test('Issue #9: 64+ char string in object does not corrupt other fields', () => {
            const input = {
                content: 'A'.repeat(127),
                name: 'test',
                count: 42
            };
            const result = roundTrip(input);
            expect(result.content).toBe(input.content);
            expect(result.name).toBe(input.name);
            expect(result.count).toBe(input.count);
        });

        test('Issue #9: no spurious empty key appears', () => {
            const input = {
                content: 'A'.repeat(127),
                name: 'test'
            };
            const result = roundTrip(input);
            expect(Object.keys(result)).toEqual(Object.keys(input));
            expect(result['']).toBeUndefined();
        });

        test('Issue #9: string content is not truncated or corrupted', () => {
            const content = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.';
            const input = { content };
            const result = roundTrip(input);
            expect(result.content.length).toBe(content.length);
            expect(result.content).toBe(content);
        });
    });
});
