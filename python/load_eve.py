import json
import numpy as np

def load_eve(filename):
    def read_value(fid):
        header = np.fromfile(fid, dtype=np.uint8, count=1)
        type_val = np.bitwise_and(header, 0b00000111)[0]

        config = np.uint8([1, 2, 4, 8, 16, 32, 64, 128])
        byte_count_index = np.bitwise_and(header, 0b11100000) >> 5
        byte_count = config[byte_count_index]

        if type_val == 0:  # null or boolean
            is_bool = np.bitwise_and(header, 0b00001000) >> 3
            if is_bool:
                data = bool(np.bitwise_and(header, 0b00010000) >> 5)
            else:
                data = np.nan
        elif type_val == 1:  # number
            num_type = np.bitwise_and(header, 0b00011000) >> 3
            is_float = num_type == 0
            is_signed = num_type == 1

            if is_float:
                data = np.fromfile(fid, dtype=np.float32 if byte_count == 4 else np.float64, count=1, sep="")[0]
            else:
                if is_signed:
                    data = np.fromfile(fid, dtype=np.int8 if byte_count == 1 else np.int16 if byte_count == 2 else np.int32 if byte_count == 4 else np.int64, count=1, sep="")[0]
                else:
                    data = np.fromfile(fid, dtype=np.uint8 if byte_count == 1 else np.uint16 if byte_count == 2 else np.uint32 if byte_count == 4 else np.uint64, count=1, sep="")[0]
        elif type_val == 2:  # string
            string_size = read_compressed(fid)
            data = fid.read(string_size).decode("utf-8")
        elif type_val == 3:  # object
            key_type = np.bitwise_and(header, 0b00011000) >> 3
            is_string = key_type == 0
            is_signed = key_type == 1

            byte_count_index = np.bitwise_and(header, 0b11100000) >> 5
            byte_count = config[byte_count_index]

            size = read_compressed(fid)

            data = {}
            for _ in range(size):
                if is_string:
                    string_size = read_compressed(fid)
                    string = fid.read(string_size).decode("utf-8")
                    data[string] = read_value(fid)
                else:
                    raise NotImplementedError("Integer key support not implemented")
        elif type_val == 4:  # typed array
            num_type = np.bitwise_and(header, 0b00011000) >> 3
            is_float = num_type == 0
            is_signed = num_type == 1

            if num_type == 3:  # boolean or string
                is_string = np.bitwise_and(header, 0b00100000) >> 5
                if is_string:
                    array_size = read_compressed(fid)
                    data = []
                    for _ in range(array_size):
                        string_size = read_compressed(fid)
                        data.append(fid.read(string_size).decode("utf-8"))
                    
                else:
                    raise NotImplementedError("Boolean array support not implemented")
            else:
                byte_count_index = np.bitwise_and(header, 0b11100000) >> 5
                byte_count = config[byte_count_index]

                size = read_compressed(fid)

                if is_float:
                    data = np.fromfile(fid, dtype=np.float32 if byte_count == 4 else np.float64, count=size, sep="")
                else:
                    if is_signed:
                        data = np.fromfile(fid, dtype=np.int8 if byte_count == 1 else np.int16 if byte_count == 2 else np.int32 if byte_count == 4 else np.int64, count=size, sep="")
                    else:
                        data = np.fromfile(fid, dtype=np.uint8 if byte_count == 1 else np.uint16 if byte_count == 2 else np.uint32 if byte_count == 4 else np.uint64, count=size, sep="")
        elif type_val == 5:  # untyped array
            array_size = read_compressed(fid)
            data = []
            for _ in range(array_size):
                data.append(read_value(fid))
        elif type_val == 6:  # extensions
            extension = np.bitwise_and(header, 0b11111000) >> 3
            if extension == 2:  # matrices
                layout = np.bitwise_and(np.fromfile(fid, dtype=np.uint8, count=1, sep=""), 0b00000001)[0]
                if layout == 0:  # row major
                    raise NotImplementedError("Row major support not implemented")
                elif layout == 1:  # column major
                    extents = read_value(fid)
                    matrix_data = read_value(fid)
                    data = np.reshape(matrix_data, (extents[0], extents[1]))
                else:
                    raise ValueError("Unsupported layout")
            elif extension == 3:  # complex numbers
                data = read_complex(fid)
            else:
                raise ValueError("Unsupported extension")
        else:
            raise ValueError("Unsupported type")

        return data

    def read_complex(fid):
        complex_header = np.fromfile(fid, dtype=np.uint8, count=1)[0]
        type_val = np.bitwise_and(complex_header, 0b00000111)

        num_type = np.bitwise_and(complex_header, 0b00011000) >> 3
        is_float = num_type == 0
        is_signed = num_type == 1

        byte_count_index = np.bitwise_and(complex_header, 0b11100000) >> 5
        byte_count = config[byte_count_index]

        if type_val == 0:  # complex number
            complex_data = None
            if is_float:
                complex_data = np.fromfile(fid, dtype=np.float32 if byte_count == 4 else np.float64, count=2, sep="")
            else:
                if is_signed:
                    complex_data = np.fromfile(fid, dtype=np.int8 if byte_count == 1 else np.int16 if byte_count == 2 else np.int32 if byte_count == 4 else np.int64, count=2, sep="")
                else:
                    complex_data = np.fromfile(fid, dtype=np.uint8 if byte_count == 1 else np.uint16 if byte_count == 2 else np.uint32 if byte_count == 4 else np.uint64, count=2, sep="")
            data = complex(complex_data[0], complex_data[1])
        elif type_val == 1:  # complex array
            size = read_compressed(fid)

            if is_float:
                raw = np.fromfile(fid, dtype=np.float32 if byte_count == 4 else np.float64, count=2*size, sep="").reshape(2, size)
                data = raw[0] + 1j * raw[1]
            else:
                if is_signed:
                    raw = np.fromfile(fid, dtype=np.int8 if byte_count == 1 else np.int16 if byte_count == 2 else np.int32 if byte_count == 4 else np.int64, count=2*size, sep="").reshape(2, size)
                else:
                    raw = np.fromfile(fid, dtype=np.uint8 if byte_count == 1 else np.uint16 if byte_count == 2 else np.uint32 if byte_count == 4 else np.uint64, count=2*size, sep="").reshape(2, size)
                data = raw[0] + 1j * raw[1]
        else:
            raise ValueError("Unsupported complex type")

        return data

    def read_compressed(fid):
        config = np.uint8([1, 2, 4, 8, 16, 32, 64, 128])

        compressed = np.fromfile(fid, dtype=np.uint8, count=1)[0]
        n_size_bytes = config[np.bitwise_and(compressed, 0b00000011)]
        fid.seek(-1, 1)
        if n_size_bytes == 1:
            size = np.fromfile(fid, dtype=np.uint8, count=1)[0]
        elif n_size_bytes == 2:
            size = np.fromfile(fid, dtype=np.uint16, count=1)[0]
        elif n_size_bytes == 4:
            size = np.fromfile(fid, dtype=np.uint32, count=1)[0]
        elif n_size_bytes == 8:
            size = np.fromfile(fid, dtype=np.uint64, count=1)[0]
        else:
            raise ValueError("Unsupported size")
        size = np.right_shift(size, 2)
        return size

    config = np.uint8([1, 2, 4, 8, 16, 32, 64, 128])

    with open(filename, 'rb') as fid:
        data = read_value(fid)

    return data

# Function to convert NumPy arrays to lists recursively
def convert_numpy_arrays_to_lists(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_arrays_to_lists(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_arrays_to_lists(item) for item in obj]
    return obj

# Load .eve file
filename = "output.eve"
data = load_eve(filename)

# Convert NumPy arrays within the data to lists
data = convert_numpy_arrays_to_lists(data)

# Save the loaded data as JSON
output_filename = "output.json"  # Choose a name for the output JSON file
with open(output_filename, 'w') as json_file:
    json.dump(data, json_file, indent=4)

print(f"Data saved as JSON to {output_filename}")