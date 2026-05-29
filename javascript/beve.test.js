const beve = require('./beve.js');
const fs = require('fs');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert');

// node:assert has no tolerance-based comparison, so the round-trip tests that
// compare floating-point values use this helper. Mirrors the decimal-precision
// semantics the suite relies on (default: agreement to 2 decimal places).
function assertClose(actual, expected, precision = 2) {
    const tolerance = Math.pow(10, -precision) / 2;
    assert.ok(
        Math.abs(expected - actual) < tolerance,
        `expected ${actual} to be close to ${expected} (precision ${precision})`
    );
}

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
            assert.strictEqual(roundTrip(true), true);
        });

        test('boolean false', () => {
            assert.strictEqual(roundTrip(false), false);
        });

        test('integer zero', () => {
            assert.strictEqual(roundTrip(0), 0);
        });

        test('positive integer', () => {
            assert.strictEqual(roundTrip(42), 42);
        });

        test('negative integer', () => {
            assert.strictEqual(roundTrip(-42), -42);
        });

        test('large positive integer', () => {
            assert.strictEqual(roundTrip(1000000), 1000000);
        });

        test('large negative integer', () => {
            assert.strictEqual(roundTrip(-1000000), -1000000);
        });

        test('floating point number', () => {
            assertClose(roundTrip(3.14159), 3.14159);
        });

        test('negative floating point', () => {
            assertClose(roundTrip(-2.71828), -2.71828);
        });

        test('very small floating point', () => {
            assertClose(roundTrip(0.000001), 0.000001);
        });

        test('large floating point', () => {
            // Use a clear non-integer to ensure it's encoded as float64
            assertClose(roundTrip(1234567890.123456), 1234567890.123456);
        });
    });

    describe('Null and Undefined Handling (Issue #7)', () => {

        test('null value', () => {
            assert.strictEqual(roundTrip(null), null);
        });

        test('undefined converts to null', () => {
            assert.strictEqual(roundTrip(undefined), null);
        });

        test('object with null value', () => {
            const input = { value: null };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with undefined value is omitted', () => {
            const input = { defined: 'yes', notDefined: undefined };
            const expected = { defined: 'yes' };
            assert.deepStrictEqual(roundTrip(input), expected);
        });

        test('object with only undefined values becomes empty', () => {
            const input = { a: undefined, b: undefined };
            assert.deepStrictEqual(roundTrip(input), {});
        });

        test('array with null elements', () => {
            const input = [1, null, 3];
            assert.deepStrictEqual(roundTrip(input), [1, null, 3]);
        });

        test('array with undefined elements converts to null', () => {
            const input = [1, undefined, 3];
            const expected = [1, null, 3];
            assert.deepStrictEqual(roundTrip(input), expected);
        });

        test('nested object with null', () => {
            const input = { outer: { inner: null } };
            assert.deepStrictEqual(roundTrip(input), input);
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
            assert.deepStrictEqual(roundTrip(input), expected);
        });
    });

    describe('String Handling', () => {

        test('empty string', () => {
            assert.strictEqual(roundTrip(''), '');
        });

        test('single character', () => {
            assert.strictEqual(roundTrip('a'), 'a');
        });

        test('short string', () => {
            assert.strictEqual(roundTrip('hello'), 'hello');
        });

        test('string with spaces', () => {
            assert.strictEqual(roundTrip('hello world'), 'hello world');
        });

        test('string with special characters', () => {
            assert.strictEqual(roundTrip('hello\nworld\ttab'), 'hello\nworld\ttab');
        });
    });

    describe('String Length Boundaries (Issue #9)', () => {

        test('62-character string (boundary - 2)', () => {
            const input = 'A'.repeat(62);
            assert.strictEqual(roundTrip(input), input);
        });

        test('63-character string (boundary - 1)', () => {
            const input = 'A'.repeat(63);
            assert.strictEqual(roundTrip(input), input);
        });

        test('64-character string (boundary)', () => {
            const input = 'A'.repeat(64);
            assert.strictEqual(roundTrip(input), input);
        });

        test('65-character string (boundary + 1)', () => {
            const input = 'A'.repeat(65);
            assert.strictEqual(roundTrip(input), input);
        });

        test('100-character string', () => {
            const input = 'A'.repeat(100);
            assert.strictEqual(roundTrip(input), input);
        });

        test('127-character string (from bug report)', () => {
            const input = 'A'.repeat(127);
            assert.strictEqual(roundTrip(input), input);
        });

        test('500-character string', () => {
            const input = 'A'.repeat(500);
            assert.strictEqual(roundTrip(input), input);
        });

        test('1000-character string', () => {
            const input = 'A'.repeat(1000);
            assert.strictEqual(roundTrip(input), input);
        });

        test('16383-character string (4-byte boundary - 1)', () => {
            const input = 'A'.repeat(16383);
            assert.strictEqual(roundTrip(input), input);
        });

        test('16384-character string (4-byte boundary)', () => {
            const input = 'A'.repeat(16384);
            assert.strictEqual(roundTrip(input), input);
        });
    });

    describe('UTF-8 Multi-byte Characters', () => {

        test('string with emoji (4-byte UTF-8)', () => {
            const input = 'Hello 😀 World';
            assert.strictEqual(roundTrip(input), input);
        });

        test('emoji-only string', () => {
            const input = '😀😁😂🤣😃😄😅😆';
            assert.strictEqual(roundTrip(input), input);
        });

        test('20 emojis (80 UTF-8 bytes, triggers 2-byte compressed)', () => {
            const input = '😀'.repeat(20);
            assert.strictEqual(roundTrip(input), input);
        });

        test('Chinese characters (3-byte UTF-8)', () => {
            const input = '你好世界';
            assert.strictEqual(roundTrip(input), input);
        });

        test('mixed ASCII and multi-byte', () => {
            const input = 'Hello 你好 World 🌍';
            assert.strictEqual(roundTrip(input), input);
        });

        test('string where char count != byte count at boundary', () => {
            // 21 characters but 63 bytes (21 * 3 for Chinese)
            const input = '中'.repeat(21);
            assert.strictEqual(roundTrip(input), input);
        });

        test('string where char count < 64 but byte count >= 64', () => {
            // 22 Chinese characters = 66 bytes, triggers 2-byte compressed
            const input = '中'.repeat(22);
            assert.strictEqual(roundTrip(input), input);
        });
    });

    describe('Objects', () => {

        test('empty object', () => {
            assert.deepStrictEqual(roundTrip({}), {});
        });

        test('simple object with string value', () => {
            const input = { name: 'test' };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with number value', () => {
            const input = { count: 42 };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with boolean value', () => {
            const input = { active: true };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with multiple fields', () => {
            const input = { name: 'test', count: 42, active: true };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('nested object', () => {
            const input = {
                outer: {
                    inner: 'value'
                }
            };
            assert.deepStrictEqual(roundTrip(input), input);
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
            assert.deepStrictEqual(roundTrip(input), input);
        });
    });

    describe('Object Key Boundaries', () => {

        test('object with 63-char key', () => {
            const key = 'k'.repeat(63);
            const input = {};
            input[key] = 'value';
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with 64-char key', () => {
            const key = 'k'.repeat(64);
            const input = {};
            input[key] = 'value';
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with 65-char key', () => {
            const key = 'k'.repeat(65);
            const input = {};
            input[key] = 'value';
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with UTF-8 key', () => {
            const input = { '你好': 'world' };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with emoji key', () => {
            const input = { '😀': 'smile' };
            assert.deepStrictEqual(roundTrip(input), input);
        });
    });

    describe('Objects with Long String Values (Issue #9 Scenario)', () => {

        test('object with 64-char string field', () => {
            const input = { content: 'A'.repeat(64) };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with 127-char string field (bug report case)', () => {
            const input = { content: 'A'.repeat(127) };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with multiple long string fields', () => {
            const input = {
                field1: 'A'.repeat(100),
                field2: 'B'.repeat(100),
                field3: 'C'.repeat(100)
            };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('mixed content like bug report', () => {
            const input = {
                content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                createdAt: 'Sun Jan 14 2024',
                id: 12345
            };
            assert.deepStrictEqual(roundTrip(input), input);
        });
    });

    describe('Typed Arrays', () => {

        test('integer array', () => {
            const input = [1, 2, 3, 4, 5];
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('float array', () => {
            const input = [1.1, 2.2, 3.3, 4.4, 5.5];
            const result = roundTrip(input);
            for (let i = 0; i < input.length; i++) {
                assertClose(result[i], input[i]);
            }
        });

        test('large integer array', () => {
            const input = Array.from({ length: 100 }, (_, i) => i);
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('array with negative integers', () => {
            const input = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
            assert.deepStrictEqual(roundTrip(input), input);
        });
    });

    describe('Untyped Arrays', () => {

        test('single element array', () => {
            const input = ['single'];
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('mixed type array', () => {
            const input = ['string', 42, true, false];
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('array of objects', () => {
            const input = [{ a: 1 }, { b: 2 }];
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('nested arrays', () => {
            // Note: nested arrays may be treated as typed if inner arrays are numeric
            const input = [['a', 'b'], ['c', 'd']];
            assert.deepStrictEqual(roundTrip(input), input);
        });
    });

    describe('Edge Cases', () => {

        test('object with empty string value', () => {
            const input = { empty: '' };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with zero value', () => {
            const input = { zero: 0 };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('object with false value', () => {
            const input = { flag: false };
            assert.deepStrictEqual(roundTrip(input), input);
        });

        test('string with null character', () => {
            const input = 'hello\0world';
            assert.strictEqual(roundTrip(input), input);
        });

        test('unicode string with surrogate pairs', () => {
            const input = '𝟙𝟚𝟛'; // Mathematical bold digits (4-byte UTF-8 each)
            assert.strictEqual(roundTrip(input), input);
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
            assert.deepStrictEqual(result, [1.0, 2.0, 3.0]);
        });

        test('aligned int32 array [10, 20, 30]', () => {
            const buf = new Uint8Array([
                0x5C, 0x4C, 0x0C, 0x00, // headers, size=3, padding=0
                0x0A, 0x00, 0x00, 0x00, // 10
                0x14, 0x00, 0x00, 0x00, // 20
                0x1E, 0x00, 0x00, 0x00, // 30
            ]);
            const result = beve.read_beve(buf);
            assert.deepStrictEqual(result, [10, 20, 30]);
        });

        test('aligned uint16 array [100, 200, 300]', () => {
            const buf = new Uint8Array([
                0x5C, 0x34, 0x0C, 0x00, // headers, size=3, padding=0
                0x64, 0x00,             // 100
                0xC8, 0x00,             // 200
                0x2C, 0x01,             // 300
            ]);
            const result = beve.read_beve(buf);
            assert.deepStrictEqual(result, [100, 200, 300]);
        });

        test('aligned float64 array from example file', () => {
            const filePath = path.join(__dirname, '..', 'examples', 'aligned_float64_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.deepStrictEqual(data, [1.0, 2.0, 3.0]);
            }
        });

        test('aligned int32 array from example file', () => {
            const filePath = path.join(__dirname, '..', 'examples', 'aligned_int32_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.deepStrictEqual(data, [10, 20, 30]);
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
            assertClose(result[0], 1.0);
            assertClose(result[1], 2.0);
        });

        test('aligned int8 array (no alignment needed)', () => {
            const buf = new Uint8Array([
                0x5C, 0x0C, 0x10, 0x00, // headers (int8), size=4, padding=0
                0x01, 0x02, 0x03, 0x04, // 1, 2, 3, 4
            ]);
            const result = beve.read_beve(buf);
            assert.deepStrictEqual(result, [1, 2, 3, 4]);
        });
    });

    describe('Compatibility Tests with Example Files', () => {
        const examplesDir = path.join(__dirname, '..', 'examples');

        test('general_object.beve can be read', () => {
            const filePath = path.join(examplesDir, 'general_object.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.strictEqual(typeof data, 'object');
            }
        });

        test('nested_object.beve can be read', () => {
            const filePath = path.join(examplesDir, 'nested_object.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.strictEqual(typeof data, 'object');
            }
        });

        test('float32_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'float32_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.notStrictEqual(data.values, undefined);
                assert.strictEqual(Array.isArray(data.values), true);
            }
        });

        test('float64_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'float64_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.notStrictEqual(data.values, undefined);
                assert.strictEqual(Array.isArray(data.values), true);
            }
        });

        test('strings_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'strings_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.notStrictEqual(data.values, undefined);
                assert.strictEqual(Array.isArray(data.values), true);
                assert.deepStrictEqual(data.values, ['cat', 'dog', 'elephant']);
            }
        });

        test('uint16_array.beve can be read', () => {
            const filePath = path.join(examplesDir, 'uint16_array.beve');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const data = beve.read_beve(new Uint8Array(buffer));
                assert.notStrictEqual(data, undefined);
                assert.notStrictEqual(data.values, undefined);
                assert.strictEqual(Array.isArray(data.values), true);
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
            assert.strictEqual(result.content, input.content);
            assert.strictEqual(result.name, input.name);
            assert.strictEqual(result.count, input.count);
        });

        test('Issue #9: no spurious empty key appears', () => {
            const input = {
                content: 'A'.repeat(127),
                name: 'test'
            };
            const result = roundTrip(input);
            assert.deepStrictEqual(Object.keys(result), Object.keys(input));
            assert.strictEqual(result[''], undefined);
        });

        test('Issue #9: string content is not truncated or corrupted', () => {
            const content = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.';
            const input = { content };
            const result = roundTrip(input);
            assert.strictEqual(result.content.length, content.length);
            assert.strictEqual(result.content, content);
        });
    });
});
