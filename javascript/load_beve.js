const fs = require('fs');

function load_beve(filename) {
    // Open dialog box if filename isn't provided.
    if (!filename) {
        throw new Error('No filename provided.');
    }

    const fid = fs.openSync(filename, 'r');
    if (!fid) {
        throw new Error('Failed to open file');
    }

    const data = read_value(fid);

    fs.closeSync(fid);
    return data;
}

function read_value(fid) {
    const header = Buffer.alloc(1);
    fs.readSync(fid, header, 0, 1, null);

    const config = [1, 2, 4, 8];

    const type = header[0] & 0b00000111;

    switch (type) {
        case 0: // null or boolean
            {
                const is_bool = (header[0] & 0b00001000) >> 3;
                if (is_bool) {
                    return Boolean((header[0] & 0b11110000) >> 4);
                } else {
                    return null;
                }
            }
        case 1: // number
            {
                const num_type = (header[0] & 0b00011000) >> 3;
                const is_float = num_type === 0;
                const is_signed = num_type === 1;

                const byte_count_index = (header[0] & 0b11100000) >> 5;
                const byte_count = config[byte_count_index];

                if (is_float) {
                    switch (byte_count) {
                        case 4:
                            return readFloat(fid);
                        case 8:
                            return readDouble(fid);
                    }
                } else {
                    if (is_signed) {
                        switch (byte_count) {
                            case 1:
                                return readInt8(fid);
                            case 2:
                                return readInt16(fid);
                            case 4:
                                return readInt32(fid);
                            case 8:
                                return readBigInt64(fid);
                        }
                    } else {
                        switch (byte_count) {
                            case 1:
                                return readUInt8(fid);
                            case 2:
                                return readUInt16(fid);
                            case 4:
                                return readUInt32(fid);
                            case 8:
                                return readBigUInt64(fid);
                        }
                    }
                }
                break;
            }
        case 2: // string
            {
                const size = read_compressed(fid);
                const buffer = Buffer.alloc(size);
                fs.readSync(fid, buffer, 0, size, null);
                return buffer.toString('utf8');
            }
        case 3: // object
            {
                const key_type = (header[0] & 0b00011000) >> 3;
                const is_string = key_type === 0;
                const is_signed = key_type === 1;

                const byte_count_index = (header[0] & 0b11100000) >> 5;
                const byte_count = config[byte_count_index];

                const N = read_compressed(fid);
                const objectData = {};

                for (let i = 0; i < N; ++i) {
                    if (is_string) {
                        const size = read_compressed(fid);
                        const buffer = Buffer.alloc(size);
                        fs.readSync(fid, buffer, 0, size, null);
                        const key = buffer.toString('utf8');
                        objectData[key] = read_value(fid);
                    } else {
                        throw new Error('TODO: support integer keys');
                    }
                }

                return objectData;
            }
        case 4: // typed array
            {
                const num_type = (header[0] & 0b00011000) >> 3;
                const is_float = num_type === 0;
                const is_signed = num_type === 1;

                const byte_count_index_array = (header[0] & 0b11100000) >> 5;
                const byte_count_array = config[byte_count_index_array];

                if (num_type === 3) {
                    const is_string = (header[0] & 0b00100000) >> 5;
                    if (is_string) {
                        const N = read_compressed(fid);
                        const array = new Array(N);
                        for (let i = 0; i < N; ++i) {
                            const size = read_compressed(fid);
                            const buffer = Buffer.alloc(size);
                            fs.readSync(fid, buffer, 0, size, null);
                            array[i] = buffer.toString('utf8');
                        }
                        return array;
                    }
                    else {
                        throw new Error("Boolean array support not implemented");
                    }
                } else if (is_float) {
                    const N = read_compressed(fid);
                    const array = new Array(N);
                    switch (byte_count_array) {
                        case 4:
                            for (let i = 0; i < N; ++i) {
                                array[i] = readFloat(fid);
                            }
                            break;
                        case 8:
                            for (let i = 0; i < N; ++i) {
                                array[i] = readDouble(fid);
                            }
                            break;
                    }
                    return array;
                } else {
                    const N = read_compressed(fid);
                    const array = new Array(N);

                    if (is_signed) {
                        switch (byte_count_array) {
                            case 1:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readInt8(fid);
                                }
                                break;
                            case 2:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readInt16(fid);
                                }
                                break;
                            case 4:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readInt32(fid);
                                }
                                break;
                            case 8:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readBigInt64(fid);
                                }
                                break;
                        }
                    } else {
                        switch (byte_count_array) {
                            case 1:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readUInt8(fid);
                                }
                                break;
                            case 2:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readUInt16(fid);
                                }
                                break;
                            case 4:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readUInt32(fid);
                                }
                                break;
                            case 8:
                                for (let i = 0; i < N; ++i) {
                                    array[i] = readBigUInt64(fid);
                                }
                                break;
                        }
                    }
                    return array;
                }
            }
        case 5: // untyped array
            {
                const N = read_compressed(fid);
                const unarray = new Array(N);

                for (let i = 0; i < N; ++i) {
                    unarray[i] = read_value(fid);
                }

                return unarray;
            }
        case 6: // extensions
            {
                const extension = (header[0] & 0b11111000) >> 3;
                switch (extension) {
                    case 1: // variants
                        read_compressed(fid); // Skipping variant tag
                        return read_value(fid);
                    case 2: // matrices
                        const layout = fs.readSync(fid, Buffer.alloc(1), 0, 1, null)[0] & 0b00000001;
                        switch (layout) {
                            case 0: // row major
                                throw new Error('TODO: add row major support');
                            case 1: // column major
                                const extents = read_value(fid);
                                const matrix_data = read_value(fid);
                                return reshape(matrix_data, extents[0], extents[1]);
                            default:
                                throw new Error('Unsupported layout');
                        }
                    case 3: // complex numbers
                        return read_complex(fid);
                    default:
                        throw new Error('Unsupported extension');
                }
            }
        default:
            throw new Error('Unsupported type');
    }
}

function readFloat(fid) {
    const buffer = Buffer.alloc(4);
    fs.readSync(fid, buffer, 0, 4, null);
    return buffer.readFloatLE();
}

function readDouble(fid) {
    const buffer = Buffer.alloc(8);
    fs.readSync(fid, buffer, 0, 8, null);
    return buffer.readDoubleLE();
}

function readInt8(fid) {
    const buffer = Buffer.alloc(1);
    fs.readSync(fid, buffer, 0, 1, null);
    return buffer.readInt8();
}

function readInt16(fid) {
    const buffer = Buffer.alloc(2);
    fs.readSync(fid, buffer, 0, 2, null);
    return buffer.readInt16LE();
}

function readInt32(fid) {
    const buffer = Buffer.alloc(4);
    fs.readSync(fid, buffer, 0, 4, null);
    return buffer.readInt32LE();
}

function readBigInt64(fid) {
    const buffer = Buffer.alloc(8);
    fs.readSync(fid, buffer, 0, 8, null);
    return buffer.readBigInt64LE();
}

function readUInt8(fid) {
    const buffer = Buffer.alloc(1);
    fs.readSync(fid, buffer, 0, 1, null);
    return buffer.readUInt8();
}

function readUInt16(fid) {
    const buffer = Buffer.alloc(2);
    fs.readSync(fid, buffer, 0, 2, null);
    return buffer.readUInt16LE();
}

function readUInt32(fid) {
    const buffer = Buffer.alloc(4);
    fs.readSync(fid, buffer, 0, 4, null);
    return buffer.readUInt32LE();
}

function readBigUInt64(fid) {
    const buffer = Buffer.alloc(8);
    fs.readSync(fid, buffer, 0, 8, null);
    return buffer.readBigUInt64LE();
}

const byte_count_lookup = [1, 2, 4, 8, 16, 32, 64, 128];

function read_compressed(fid) {
    let header = Buffer.alloc(1);
    fs.readSync(fid, header, 0, 1, null);
    const config = header[0] & 0b00000011;

    switch (config) {
        case 0:
            return header[0] >> 2;
        case 1: {
            const h = Buffer.alloc(2);
            fs.readSync(fid, h, 0, 2, null);
            return ((h[0] << 8) | h[1]) >> 2;
        }
        case 2: {
            const h = Buffer.alloc(4);
            fs.readSync(fid, h, 0, 4, null);
            return ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >> 2;
        }
        case 3: {
            const h = Buffer.alloc(8);
            fs.readSync(fid, h, 0, 8, null);
            let val = BigInt(0);
            for (let i = 0; i < 8; ++i) {
                val |= BigInt(h[i]) << BigInt(8 * i);
            }
            return Number(val >> BigInt(2));
        }
        default:
            return 0;
    }
}

// Usage example:
try {
    const filename = '../example/example.beve';
    const data = load_beve(filename);
    console.log(data);
    //console.log(JSON.stringify(data));
} catch (error) {
    console.error(error);
}
