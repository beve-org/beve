// Reference: https://github.com/stephenberry/beve

const fs = require('fs');

// Reading BEVE
function read_beve(filename) {
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

// Writing BEVE
function write_beve(data, filename) {
    const file = new BinaryFile(filename);
    if (!file) {
        throw new Error('Failed to open file for writing');
    }
    try {
        write_value(file, data);
    } finally {
        file.close();
    }
}

function write_value(file, value) {
    if (Array.isArray(value) && value.length > 1) {
        const header = 4;
        if (typeof value[0] === 'number' && !Number.isInteger(value[0])) {
            write_float(file, header, value, 1);
        } else {
            write_integer(file, header, value, 1);
        }
    } else if (typeof value === 'boolean') {
        let header = 0;
        if (value) {
            header |= 0b00011000;
        } else {
            header |= 0b00001000;
        }
        file.writeUint8(header);
    } else if (typeof value === 'number') {
        let header = 1;
        if (!Number.isInteger(value)) {
            write_float(file, header, value, 0);
        } else {
            write_integer(file, header, value, 0);
        }
    } else if (typeof value === 'string') {
        throw new Error('Unsupported data type');
    } else if (typeof value === 'object' && Object.keys(value).length > 0) {
        let header = 3;
        let keyType = 0; // Assuming keys are always strings
        let isSigned = false;
        header |= keyType << 3;
        header |= isSigned << 5;
        file.writeUint8(header);
        writeCompressed(file, Object.keys(value).length);
        for (const key in value) {
            writeCompressed(file, key.length);
            file.writeString(key);
            write_value(file, value[key]);
        }
    } else if (Array.isArray(value)) {
        let header = 5;
        file.writeUint8(header);
        writeCompressed(file, value.length);
        for (let i = 0; i < value.length; i++) {
            write_value(file, value[i]);
        }
    } else {
        throw new Error('Unsupported data type');
    }
}

function write_float(file, header, value, isArray) {
    if (Math.fround(value) === value) { // single precision float
        header |= 0b01000000;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.write_float32LE(value);
    } else { // double precision float
        header |= 0b01100000;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.write_float64LE(value);
    }
}

function write_integer(file, header, value, isArray) {
    if (value >= 0 && value <= 255) { // uint8
        header |= 0b00010001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeUint8(value);
    } else if (value >= 0 && value <= 65535) { // uint16
        header |= 0b00110001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeUint16LE(value);
    } else if (value >= 0 && value <= 4294967295) { // uint32
        header |= 0b01010001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeUint32LE(value);
    } else if (value >= 0 && value <= Number.MAX_SAFE_INTEGER) { // uint64
        header |= 0b01110001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeBigInt64LE(BigInt(value));
    } else if (value >= -128 && value <= 127) { // int8
        header |= 0b00001001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeInt8(value);
    } else if (value >= -32768 && value <= 32767) { // int16
        header |= 0b00101001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
    } else if (value >= -2147483648 && value <= 2147483647) { // int32
        header |= 0b01001001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeInt32LE(value);
    } else if (value >= -9223372036854775808 && value <= 9223372036854775807) { // int64
        header |= 0b01101001;
        file.writeUint8(header);
        if (isArray) {
            writeCompressed(file, value.length);
        }
        file.writeBigInt64LE(BigInt(value));
    } else {
        throw new Error('Unsupported type');
    }
}

function writeCompressed(file, N) {
    if (N < 64) {
        const compressed = (N << 2) | 0;
        file.writeUint8(compressed);
    } else if (N < 16384) {
        const compressed = (N << 2) | 1;
        file.writeUint16LE(compressed);
    } else if (N < 1073741824) {
        const compressed = (N << 2) | 2;
        file.writeUint32LE(compressed);
    } else if (N < 4611686018427387904) {
        const compressed = (N << 2) | 3;
        file.writeUint64LE(BigInt(compressed));
    }
}

class BinaryFile {
    constructor(filename) {
        this.filename = filename;
        this.fd = require('fs').openSync(filename, 'wb');
    }
    writeUint8(value) {
        require('fs').writeSync(this.fd, Buffer.from([value]));
    }
    writeUint16LE(value) {
        require('fs').writeSync(this.fd, Buffer.from([value & 0xFF, (value >> 8) & 0xFF]));
    }
    writeUint32LE(value) {
        require('fs').writeSync(this.fd, Buffer.from([(value >> 0) & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF]));
    }
    writeUint64LE(value) {
        require('fs').writeSync(this.fd, Buffer.from([(value >> 0n) & BigInt(0xFF), (value >> 8n) & BigInt(0xFF), (value >> 16n) & BigInt(0xFF), (value >> 24n) & BigInt(0xFF), (value >> 32n) & BigInt(0xFF), (value >> 40n) & BigInt(0xFF), (value >> 48n) & BigInt(0xFF), (value >> 56n) & BigInt(0xFF)]));
    }
    write_float32LE(value) {
        const buffer = Buffer.alloc(4);
        buffer.write_floatLE(value, 0);
        require('fs').writeSync(this.fd, buffer);
    }
    write_float64LE(value) {
        const buffer = Buffer.alloc(8);
        buffer.writeDoubleLE(value, 0);
        require('fs').writeSync(this.fd, buffer);
    }
    writeBigInt64LE(value) {
        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64LE(value, 0);
        require('fs').writeSync(this.fd, buffer);
    }
    writeString(str) {
        require('fs').writeSync(this.fd, Buffer.from(str));
    }
    close() {
        require('fs').closeSync(this.fd);
    }
}

// Usage example:
try {
    const filename = '../example/example.beve';
    const data = read_beve(filename);
    console.log(data);
    //console.log(JSON.stringify(data));
    //write_beve(data, '../example/examplejs.beve');
} catch (error) {
    console.error(error);
}
