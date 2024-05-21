// Reference: https://github.com/stephenberry/beve

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.otherFile = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    // Reading BEVE
    function read_beve(buffer) {
        if (!buffer || !(buffer instanceof Uint8Array)) {
            throw new Error('Invalid buffer provided.');
        }

        let cursor = 0;

        function read_value() {
            const header = buffer[cursor++];
            const config = [1, 2, 4, 8];
            const type = header & 0b00000111;

            switch (type) {
                case 0: // null or boolean
                    {
                        const is_bool = (header & 0b00001000) >> 3;
                        if (is_bool) {
                            return Boolean((header & 0b11110000) >> 4);
                        } else {
                            return null;
                        }
                    }
                case 1: // number
                    {
                        const num_type = (header & 0b00011000) >> 3;
                        const is_float = num_type === 0;
                        const is_signed = num_type === 1;
                        const byte_count_index = (header & 0b11100000) >> 5;
                        const byte_count = config[byte_count_index];

                        if (is_float) {
                            switch (byte_count) {
                                case 4:
                                    return readFloat();
                                case 8:
                                    return readDouble();
                            }
                        } else {
                            if (is_signed) {
                                switch (byte_count) {
                                    case 1:
                                        return readInt8();
                                    case 2:
                                        return readInt16();
                                    case 4:
                                        return readInt32();
                                    case 8:
                                        return readBigInt64();
                                }
                            } else {
                                switch (byte_count) {
                                    case 1:
                                        return readUInt8();
                                    case 2:
                                        return readUInt16();
                                    case 4:
                                        return readUInt32();
                                    case 8:
                                        return readBigUInt64();
                                }
                            }
                        }
                        break;
                    }
                case 2: // string
                    {
                        const size = read_compressed();
                        const str = new TextDecoder().decode(buffer.subarray(cursor, cursor + size));
                        cursor += size;
                        return str;
                    }
                case 3: // object
                    {
                        const key_type = (header & 0b00011000) >> 3;
                        const is_string = key_type === 0;
                        const is_signed = key_type === 1;
                        const byte_count_index = (header & 0b11100000) >> 5;
                        const byte_count = config[byte_count_index];
                        const N = read_compressed();
                        const objectData = {};

                        for (let i = 0; i < N; ++i) {
                            if (is_string) {
                                const size = read_compressed();
                                const key = new TextDecoder().decode(buffer.subarray(cursor, cursor + size));
                                cursor += size;
                                objectData[key] = read_value();
                            } else {
                                throw new Error('TODO: support integer keys');
                            }
                        }

                        return objectData;
                    }
                case 4: // typed array
                    {
                        const num_type = (header & 0b00011000) >> 3;
                        const is_float = num_type === 0;
                        const is_signed = num_type === 1;
                        const byte_count_index_array = (header & 0b11100000) >> 5;
                        const byte_count_array = config[byte_count_index_array];

                        if (num_type === 3) {
                            const is_string = (header & 0b00100000) >> 5;
                            if (is_string) {
                                const N = read_compressed();
                                const array = new Array(N);
                                for (let i = 0; i < N; ++i) {
                                    const size = read_compressed();
                                    const str = new TextDecoder().decode(buffer.subarray(cursor, cursor + size));
                                    cursor += size;
                                    array[i] = str;
                                }
                                return array;
                            } else {
                                throw new Error("Boolean array support not implemented");
                            }
                        } else if (is_float) {
                            const N = read_compressed();
                            const array = new Array(N);
                            switch (byte_count_array) {
                                case 4:
                                    for (let i = 0; i < N; ++i) {
                                        array[i] = readFloat();
                                    }
                                    break;
                                case 8:
                                    for (let i = 0; i < N; ++i) {
                                        array[i] = readDouble();
                                    }
                                    break;
                            }
                            return array;
                        } else {
                            const N = read_compressed();
                            const array = new Array(N);

                            if (is_signed) {
                                switch (byte_count_array) {
                                    case 1:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readInt8();
                                        }
                                        break;
                                    case 2:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readInt16();
                                        }
                                        break;
                                    case 4:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readInt32();
                                        }
                                        break;
                                    case 8:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readBigInt64();
                                        }
                                        break;
                                }
                            } else {
                                switch (byte_count_array) {
                                    case 1:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readUInt8();
                                        }
                                        break;
                                    case 2:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readUInt16();
                                        }
                                        break;
                                    case 4:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readUInt32();
                                        }
                                        break;
                                    case 8:
                                        for (let i = 0; i < N; ++i) {
                                            array[i] = readBigUInt64();
                                        }
                                        break;
                                }
                            }
                            return array;
                        }
                    }
                case 5: // untyped array
                    {
                        const N = read_compressed();
                        const unarray = new Array(N);

                        for (let i = 0; i < N; ++i) {
                            unarray[i] = read_value();
                        }

                        return unarray;
                    }
                case 6: // extensions
                    {
                        const extension = (header & 0b11111000) >> 3;
                        switch (extension) {
                            case 1: // variants
                                read_compressed(); // Skipping variant tag
                                return read_value();
                            case 2: // matrices
                                const layout = buffer[cursor++] & 0b00000001;
                                switch (layout) {
                                    case 0: // row major
                                        throw new Error('TODO: add row major support');
                                    case 1: // column major
                                        const extents = read_value();
                                        const matrix_data = read_value();
                                        return reshape(matrix_data, extents[0], extents[1]);
                                    default:
                                        throw new Error('Unsupported layout');
                                }
                            case 3: // complex numbers
                                return read_complex();
                            default:
                                throw new Error('Unsupported extension');
                        }
                    }
                default:
                    throw new Error('Unsupported type');
            }
        }

        function readFloat() {
            const value = new DataView(buffer.buffer, cursor, 4).getFloat32(0, true);
            cursor += 4;
            return value;
        }

        function readDouble() {
            const value = new DataView(buffer.buffer, cursor, 8).getFloat64(0, true);
            cursor += 8;
            return value;
        }

        function readInt8() {
            const value = new DataView(buffer.buffer, cursor, 1).getInt8(0);
            cursor += 1;
            return value;
        }

        function readInt16() {
            const value = new DataView(buffer.buffer, cursor, 2).getInt16(0, true);
            cursor += 2;
            return value;
        }

        function readInt32() {
            const value = new DataView(buffer.buffer, cursor, 4).getInt32(0, true);
            cursor += 4;
            return value;
        }

        function readBigInt64() {
            const value = new DataView(buffer.buffer, cursor, 8).getBigInt64(0, true);
            cursor += 8;
            return value;
        }

        function readUInt8() {
            const value = new DataView(buffer.buffer, cursor, 1).getUint8(0);
            cursor += 1;
            return value;
        }

        function readUInt16() {
            const value = new DataView(buffer.buffer, cursor, 2).getUint16(0, true);
            cursor += 2;
            return value;
        }

        function readUInt32() {
            const value = new DataView(buffer.buffer, cursor, 4).getUint32(0, true);
            cursor += 4;
            return value;
        }

        function readBigUInt64() {
            const value = new DataView(buffer.buffer, cursor, 8).getBigUint64(0, true);
            cursor += 8;
            return value;
        }

        function read_compressed() {
            const header = buffer[cursor++];
            const config = header & 0b00000011;

            switch (config) {
                case 0:
                    return header >> 2;
                case 1: {
                    const h = new DataView(buffer.buffer, cursor, 2);
                    cursor += 2;
                    return (h.getUint16(0, true)) >> 2;
                }
                case 2: {
                    const h = new DataView(buffer.buffer, cursor, 4);
                    cursor += 4;
                    return (h.getUint32(0, true)) >> 2;
                }
                case 3: {
                    let val = BigInt(0);
                    for (let i = 0; i < 8; ++i) {
                        val |= BigInt(buffer[cursor++]) << BigInt(8 * i);
                    }
                    return Number(val >> BigInt(2));
                }
                default:
                    return 0;
            }
        }

        function read_complex() {
            const real = read_value();
            const imag = read_value();
            return { real, imag };
        }

        function reshape(array, rows, cols) {
            const reshaped = [];
            for (let i = 0; i < rows; ++i) {
                reshaped.push(array.slice(i * cols, (i + 1) * cols));
            }
            return reshaped;
        }

        return read_value();
    }

    return {
        read_beve: read_beve
    };
}));