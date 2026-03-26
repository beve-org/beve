% Load a specific field from a .beve file using JSON Pointer (RFC 6901),
% with optional array slicing. Navigates directly to the target field
% without loading intervening data.
%
% Usage:
%   data = load_beve_field(path, pointer)
%   data = load_beve_field(path, pointer, [start, count])
%
% Arguments:
%   path    - Path to .beve file
%   pointer - JSON Pointer string (RFC 6901). Examples:
%               ''                 - the whole document (top-level value)
%               '/sensors/channel0' - nested field lookup
%               '/5/data'          - integer key 5, then string key "data"
%               '/2/channel0'      - index 2 of a generic array, then key
%             Escape sequences: ~0 = literal ~, ~1 = literal /
%             Array indices are 0-based per RFC 6901.
%   range   - Optional [start, count] for array slicing (1-based indexing)
%             Typed arrays: slices elements
%             Complex arrays: slices complex elements
%             Row-major matrices: slices rows
%             Column-major matrices: slices columns
%
% Examples:
%   data = load_beve_field('file.beve', '/sensors/channel0');
%   data = load_beve_field('file.beve', '/raw_samples', [1000, 1000]);
%   data = load_beve_field('file.beve', '/channel_matrix', [1, 50]);
function data = load_beve_field(path, pointer, range)
    if nargin < 2
        pointer = '';
    end
    if nargin < 3
        range = [];
    end

    fid = fopen(path, 'rb');
    if fid == -1
        error('Failed to open file: %s', path);
    end
    cleanup = onCleanup(@() fclose(fid));

    % Parse JSON Pointer (RFC 6901)
    keys = parse_json_pointer(pointer);

    % Navigate to the target field
    if ~isempty(keys)
        navigate_path(fid, keys);
    end

    % Read value with optional slicing
    if isempty(range)
        data = read_value(fid);
    else
        data = read_value_sliced(fid, range);
    end
end

%% --- JSON Pointer (RFC 6901) ---

function tokens = parse_json_pointer(pointer)
    if isempty(pointer)
        tokens = {};
        return;
    end
    if pointer(1) ~= '/'
        error('Invalid JSON Pointer: must be empty or start with ''/'' (got ''%s'')', pointer);
    end
    % Split on '/' and drop the leading empty token
    parts = strsplit(pointer, '/');
    parts = parts(2:end);
    % Unescape: ~1 -> /, ~0 -> ~ (order matters per RFC 6901)
    tokens = cell(size(parts));
    for i = 1:length(parts)
        t = strrep(parts{i}, '~1', '/');
        t = strrep(t, '~0', '~');
        tokens{i} = t;
    end
end

%% --- Navigation ---

function navigate_path(fid, keys)
    config = uint8([1, 2, 4, 8]);

    for k = 1:length(keys)
        token = keys{k};

        header = fread(fid, 1, '*uint8', 'l');
        type = bitand(header, 0b00000111);

        if type == 5 % generic array: index by 0-based position (RFC 6901)
            idx = str2double(token);
            N = double(read_compressed(fid));
            if isnan(idx) || floor(idx) ~= idx || idx < 0 || idx >= N
                error('Array index ''%s'' out of bounds (length %d)', token, N);
            end
            for ii = 1:idx
                skip_value(fid);
            end
            % File pointer is now at element idx; continue to next token

        elseif type == 3 % object: look up by key
            key_type = bitshift(bitand(header, 0b00011000), -3);
            is_string_key = (key_type == 0);
            is_signed_key = (key_type == 1);

            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            key_byte_count = config(byte_count_index + 1);

            % For integer-keyed objects, parse the pointer token as a number
            if ~is_string_key
                target_int = str2double(token);
                if isnan(target_int) || floor(target_int) ~= target_int
                    error('Object has integer keys but pointer token ''%s'' is not an integer', token);
                end
            end

            N = double(read_compressed(fid));

            found = false;
            for ii = 1:N
                if is_string_key
                    string_size = read_compressed(fid);
                    key_str = fread(fid, double(string_size), 'char=>char', 'l')';
                    match = strcmp(key_str, token);
                else
                    if is_signed_key
                        switch key_byte_count
                            case 1, key_val = fread(fid, 1, '*int8', 'l');
                            case 2, key_val = fread(fid, 1, '*int16', 'l');
                            case 4, key_val = fread(fid, 1, '*int32', 'l');
                            case 8, key_val = fread(fid, 1, '*int64', 'l');
                        end
                    else
                        switch key_byte_count
                            case 1, key_val = fread(fid, 1, '*uint8', 'l');
                            case 2, key_val = fread(fid, 1, '*uint16', 'l');
                            case 4, key_val = fread(fid, 1, '*uint32', 'l');
                            case 8, key_val = fread(fid, 1, '*uint64', 'l');
                        end
                    end
                    match = (double(key_val) == target_int);
                end

                if match
                    found = true;
                    break;
                else
                    skip_value(fid);
                end
            end

            if ~found
                error('Key ''%s'' not found in object', token);
            end

        else
            error('Cannot navigate into type %d at pointer segment ''%s''', type, token);
        end
    end
end

%% --- Skip (advance file position past a value without loading data) ---

function skip_value(fid)
    header = fread(fid, 1, '*uint8', 'l');
    assert(~isempty(header), 'Unexpected end of data');

    config = uint8([1, 2, 4, 8]);
    type = bitand(header, 0b00000111);

    switch type
        case 0 % null or boolean: fully encoded in header

        case 1 % number
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            fseek(fid, double(config(byte_count_index + 1)), 'cof');

        case 2 % string
            n = read_compressed(fid);
            fseek(fid, double(n), 'cof');

        case 3 % object
            key_type = bitshift(bitand(header, 0b00011000), -3);
            is_string_key = (key_type == 0);
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            key_bc = double(config(byte_count_index + 1));

            N = double(read_compressed(fid));
            for ii = 1:N
                if is_string_key
                    ks = read_compressed(fid);
                    fseek(fid, double(ks), 'cof');
                else
                    fseek(fid, key_bc, 'cof');
                end
                skip_value(fid);
            end

        case 4 % typed array
            element_type = bitshift(bitand(header, 0b00011000), -3);
            is_bool_or_string = (element_type == 3);
            string_flag = bitshift(bitand(header, 0b00100000), -5);

            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = double(config(byte_count_index + 1));

            N = double(read_compressed(fid));

            if ~is_bool_or_string
                fseek(fid, N * byte_count, 'cof');
            elseif ~string_flag % boolean
                fseek(fid, ceil(N / 8), 'cof');
            else % string array
                for ii = 1:N
                    ss = read_compressed(fid);
                    fseek(fid, double(ss), 'cof');
                end
            end

        case 5 % generic array
            N = double(read_compressed(fid));
            for ii = 1:N
                skip_value(fid);
            end

        case 6 % extension
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 1 % variant
                    read_compressed(fid);
                    skip_value(fid);
                case 2 % matrix
                    fseek(fid, 1, 'cof'); % matrix header byte
                    skip_value(fid);       % extents
                    skip_value(fid);       % data
                case 3 % complex
                    ch = fread(fid, 1, '*uint8', 'l');
                    ctype = bitand(ch, 0b00000111);
                    bc_idx = bitshift(bitand(ch, 0b11100000), -5);
                    bc = double(config(bc_idx + 1));
                    if ctype == 0 % scalar
                        fseek(fid, 2 * bc, 'cof');
                    else % array
                        cN = double(read_compressed(fid));
                        fseek(fid, 2 * cN * bc, 'cof');
                    end
                otherwise
                    error('Cannot skip unsupported extension %d', extension);
            end
        otherwise
            error('Cannot skip unsupported type %d', type);
    end
end

%% --- Sliced reading ---

function data = read_value_sliced(fid, range)
    header = fread(fid, 1, '*uint8', 'l');
    type = bitand(header, 0b00000111);

    switch type
        case 4 % typed array
            data = read_typed_array_slice(fid, header, range);
        case 6 % extension
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 2 % matrix
                    data = read_matrix_slice(fid, range);
                case 3 % complex array
                    data = read_complex_slice(fid, range);
                otherwise
                    error('Slicing not supported for extension %d', extension);
            end
        otherwise
            error('Slicing only supported for typed arrays, complex arrays, and matrices (got type %d)', type);
    end
end

function data = read_typed_array_slice(fid, header, range)
    config = uint8([1, 2, 4, 8]);

    element_type = bitshift(bitand(header, 0b00011000), -3);
    is_float = (element_type == 0);
    is_signed = (element_type == 1);
    is_bool_or_string = (element_type == 3);

    if is_bool_or_string
        error('Slicing not supported for boolean or string typed arrays');
    end

    byte_count_index = bitshift(bitand(header, 0b11100000), -5);
    byte_count = double(config(byte_count_index + 1));

    N = double(read_compressed(fid));

    start = range(1);
    count = range(2);
    if start < 1 || start + count - 1 > N
        error('Range [%d, %d] out of bounds (array length %d)', start, count, N);
    end

    % Seek past elements before the slice
    if start > 1
        fseek(fid, (start - 1) * byte_count, 'cof');
    end

    data = read_numeric_block(fid, count, is_float, is_signed, byte_count);
end

function data = read_complex_slice(fid, range)
    config = uint8([1, 2, 4, 8]);

    complex_header = fread(fid, 1, '*uint8', 'l');
    ctype = bitand(complex_header, 0b00000111);

    if ctype ~= 1
        error('Slicing only supported for complex arrays, not scalar complex values');
    end

    num_type = bitshift(bitand(complex_header, 0b00011000), -3);
    is_float = (num_type == 0);
    is_signed = (num_type == 1);

    bc_idx = bitshift(bitand(complex_header, 0b11100000), -5);
    byte_count = double(config(bc_idx + 1));

    N = double(read_compressed(fid));

    start = range(1);
    count = range(2);
    if start < 1 || start + count - 1 > N
        error('Range [%d, %d] out of bounds (complex array length %d)', start, count, N);
    end

    % Each complex element = 2 * byte_count bytes (real, imag)
    if start > 1
        fseek(fid, (start - 1) * 2 * byte_count, 'cof');
    end

    raw = read_numeric_block(fid, 2 * count, is_float, is_signed, byte_count);
    raw = reshape(raw, 2, count);
    data = complex(raw(1, :), raw(2, :)).';
end

function data = read_matrix_slice(fid, range)
    layout = bitand(fread(fid, 1, '*uint8', 'l'), 0b00000001);
    extents = read_value(fid); % small, always fully loaded

    M = double(extents(1));      % rows
    N_cols = double(extents(2)); % columns

    % Read the data value header
    header = fread(fid, 1, '*uint8', 'l');
    type = bitand(header, 0b00000111);

    start = range(1);
    count = range(2);

    if layout == 0 % row major: slice rows
        if start < 1 || start + count - 1 > M
            error('Row range [%d, %d] out of bounds (%d rows)', start, count, M);
        end
        flat_start = (start - 1) * N_cols + 1;
        flat_count = count * N_cols;

        if type == 4 % typed array
            slice = read_typed_array_slice(fid, header, [flat_start, flat_count]);
            data = reshape(slice, N_cols, count)';
        elseif type == 6 % extension (complex)
            ext = bitshift(bitand(header, 0b11111000), -3);
            if ext == 3
                slice = read_complex_slice(fid, [flat_start, flat_count]);
                data = reshape(slice, N_cols, count).';
            else
                error('Unsupported matrix data extension %d', ext);
            end
        else
            error('Unsupported matrix data type %d', type);
        end

    else % column major: slice columns
        if start < 1 || start + count - 1 > N_cols
            error('Column range [%d, %d] out of bounds (%d columns)', start, count, N_cols);
        end
        flat_start = (start - 1) * M + 1;
        flat_count = count * M;

        if type == 4
            slice = read_typed_array_slice(fid, header, [flat_start, flat_count]);
            data = reshape(slice, M, count);
        elseif type == 6
            ext = bitshift(bitand(header, 0b11111000), -3);
            if ext == 3
                slice = read_complex_slice(fid, [flat_start, flat_count]);
                data = reshape(slice, M, count);
            else
                error('Unsupported matrix data extension %d', ext);
            end
        else
            error('Unsupported matrix data type %d', type);
        end
    end
end

%% --- Shared helpers ---

function data = read_numeric_block(fid, count, is_float, is_signed, byte_count)
    if is_float
        switch byte_count
            case 4, data = fread(fid, count, '*float32', 'l');
            case 8, data = fread(fid, count, '*float64', 'l');
            otherwise, error('Unsupported float size %d', byte_count);
        end
    elseif is_signed
        switch byte_count
            case 1, data = fread(fid, count, '*int8', 'l');
            case 2, data = fread(fid, count, '*int16', 'l');
            case 4, data = fread(fid, count, '*int32', 'l');
            case 8, data = fread(fid, count, '*int64', 'l');
            otherwise, error('Unsupported signed int size %d', byte_count);
        end
    else
        switch byte_count
            case 1, data = fread(fid, count, '*uint8', 'l');
            case 2, data = fread(fid, count, '*uint16', 'l');
            case 4, data = fread(fid, count, '*uint32', 'l');
            case 8, data = fread(fid, count, '*uint64', 'l');
            otherwise, error('Unsupported unsigned int size %d', byte_count);
        end
    end
end

%% --- Full value reader (for non-sliced reads and navigation) ---

function data = read_value(fid)
    header = fread(fid, 1, '*uint8', 'l');
    assert(~isempty(header), 'Unexpected end of data');

    config = uint8([1, 2, 4, 8]);
    type = bitand(header, 0b00000111);

    switch type
        case 0 % null or boolean
            is_bool = bitshift(bitand(header, 0b00001000), -3);
            if is_bool
                data = logical(bitshift(bitand(header, 0b11110000), -4));
            else
                data = NaN;
            end
        case 1 % number
            element_type = bitshift(bitand(header, 0b00011000), -3);
            is_float = (element_type == 0);
            is_signed = (element_type == 1);
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = double(config(byte_count_index + 1));
            data = read_numeric_block(fid, 1, is_float, is_signed, byte_count);
        case 2 % string
            string_size = read_compressed(fid);
            data = fread(fid, double(string_size), 'char=>char', 'l')';
        case 3 % object
            key_type = bitshift(bitand(header, 0b00011000), -3);
            is_string = (key_type == 0);
            is_signed = (key_type == 1);
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = double(config(byte_count_index + 1));

            N = double(read_compressed(fid));
            if N == 0
                data = [];
                return;
            end

            data = struct();
            for ii = 1:N
                if is_string
                    string_size = read_compressed(fid);
                    key_str = fread(fid, double(string_size), 'char=>char', 'l')';
                    legal_key = makeValidFieldName(key_str);
                    data.(legal_key) = read_value(fid);
                else
                    if is_signed
                        switch byte_count
                            case 1, key = fread(fid, 1, '*int8', 'l');
                            case 2, key = fread(fid, 1, '*int16', 'l');
                            case 4, key = fread(fid, 1, '*int32', 'l');
                            case 8, key = fread(fid, 1, '*int64', 'l');
                        end
                    else
                        switch byte_count
                            case 1, key = fread(fid, 1, '*uint8', 'l');
                            case 2, key = fread(fid, 1, '*uint16', 'l');
                            case 4, key = fread(fid, 1, '*uint32', 'l');
                            case 8, key = fread(fid, 1, '*uint64', 'l');
                        end
                    end
                    key_str = sprintf('int_%d', key);
                    data.(key_str) = read_value(fid);
                end
            end
        case 4 % typed array
            element_type = bitshift(bitand(header, 0b00011000), -3);
            is_float = (element_type == 0);
            is_signed = (element_type == 1);
            is_bool_or_string = (element_type == 3);
            string_flag = bitshift(bitand(header, 0b00100000), -5);

            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = double(config(byte_count_index + 1));

            N = double(read_compressed(fid));

            if ~is_bool_or_string
                data = read_numeric_block(fid, N, is_float, is_signed, byte_count);
            elseif string_flag % string array
                data = strings(N, 1);
                for ii = 1:N
                    ss = read_compressed(fid);
                    data{ii} = fread(fid, double(ss), 'char=>char', 'l')';
                end
            else % boolean
                num_bytes = ceil(N / 8);
                packed = fread(fid, num_bytes, '*uint8', 'l');
                data = false(N, 1);
                for i = 1:N
                    byte_idx = floor((i-1) / 8) + 1;
                    bit_pos = mod(i-1, 8);
                    data(i) = bitand(bitshift(packed(byte_idx), -bit_pos), 1) == 1;
                end
            end
        case 5 % generic array
            N = double(read_compressed(fid));
            data = cell(N, 1);
            for ii = 1:N
                data{ii} = read_value(fid);
            end
        case 6 % extension
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 1 % variant
                    read_compressed(fid);
                    data = read_value(fid);
                case 2 % matrix
                    layout = bitand(fread(fid, 1, '*uint8', 'l'), 0b00000001);
                    extents = read_value(fid);
                    matrix_data = read_value(fid);
                    switch layout
                        case 0 % row major
                            data = reshape(matrix_data, extents(2), extents(1))';
                        case 1 % column major
                            data = reshape(matrix_data, extents(1), extents(2));
                    end
                case 3 % complex
                    data = read_complex(fid);
                otherwise
                    error('Unsupported extension %d', extension);
            end
        otherwise
            error('Unsupported type %d', type);
    end
end

function data = read_complex(fid)
    config = uint8([1, 2, 4, 8]);
    complex_header = fread(fid, 1, '*uint8', 'l');
    ctype = bitand(complex_header, 0b00000111);

    num_type = bitshift(bitand(complex_header, 0b00011000), -3);
    is_float = (num_type == 0);
    is_signed = (num_type == 1);

    bc_idx = bitshift(bitand(complex_header, 0b11100000), -5);
    byte_count = double(config(bc_idx + 1));

    switch ctype
        case 0 % scalar complex
            raw = read_numeric_block(fid, 2, is_float, is_signed, byte_count);
            data = complex(raw(1), raw(2));
        case 1 % complex array
            N = double(read_compressed(fid));
            raw = read_numeric_block(fid, 2 * N, is_float, is_signed, byte_count);
            raw = reshape(raw, 2, N);
            data = complex(raw(1, :), raw(2, :)).';
    end
end

function N = read_compressed(fid)
    config = uint8([1, 2, 4, 8]);
    compressed = fread(fid, 1, '*uint8', 'l');
    n_size_bytes = config(bitand(compressed, 0b00000011) + 1);
    fseek(fid, -1, 'cof');
    switch n_size_bytes
        case 1, N = fread(fid, 1, '*uint8', 'l');
        case 2, N = fread(fid, 1, '*uint16', 'l');
        case 4, N = fread(fid, 1, '*uint32', 'l');
        case 8, N = fread(fid, 1, '*uint64', 'l');
        otherwise, error('Unsupported compressed size');
    end
    N = bitshift(N, -2);
end

function validName = makeValidFieldName(fieldName)
    if isstring(fieldName)
        fieldName = char(fieldName);
    end
    if size(fieldName, 1) > 1 && size(fieldName, 2) == 1
        fieldName = fieldName';
    end
    validName = regexprep(fieldName, '[^a-zA-Z0-9_]', '');
    if isempty(regexp(validName, '^[a-zA-Z]', 'once'))
        validName = ['A', validName];
    end
    maxLen = namelengthmax();
    if length(validName) > maxLen
        validName = validName(1:maxLen);
    end
end
