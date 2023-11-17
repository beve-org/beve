% Load a .beve file
% Reference: https://github.com/stephenberry/beve
function data = load_beve(filename)
    fid = fopen(filename, 'rb');
    if fid == -1
        error('Failed to open file');
    end

    data = read_value(fid);

    fclose(fid);
end

% 'l' denotes little endian format
% (https://www.mathworks.com/help/matlab/ref/fread.html)
function data = read_value(fid)
    % Read the header
    header = fread(fid, 1, '*uint8', 'l');

    % Configuration mapping
    config = uint8([1, 2, 4, 8]);

    % Extract header components
    type = bitand(header, 0b00000111);
    switch type
        case 0 % null or boolean
            is_bool = bitshift(bitand(header, 0b00001000), -3);
            if is_bool
                data = logical(bitshift(bitand(header, 0b11100000), -5));
            else
                data = NaN;
            end
        case 1 % number
            num_type = bitshift(bitand(header, 0b00011000), -3);
            is_float = false;
            is_signed = false;
            switch num_type
                case 0
                    is_float = true;
                case 1
                    is_signed = true;
            end

            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = config(byte_count_index + 1);

            if is_float
                switch byte_count
                    case 4
                        data = fread(fid, 1, '*float32', 'l');
                    case 8
                        data = fread(fid, 1, '*float64', 'l');
                end
            else
                if is_signed
                    switch byte_count
                        case 1
                            data = fread(fid, 1, '*int8', 'l');
                        case 2
                            data = fread(fid, 1, '*int16', 'l');
                        case 4
                            data = fread(fid, 1, '*int32', 'l');
                        case 8
                            data = fread(fid, 1, '*int64', 'l');
                    end
                else
                    switch byte_count
                        case 1
                            data = fread(fid, 1, '*uint8', 'l');
                        case 2
                            data = fread(fid, 1, '*uint16', 'l');
                        case 4
                            data = fread(fid, 1, '*uint32', 'l');
                        case 8
                            data = fread(fid, 1, '*uint64', 'l');
                    end
                end
            end
        case 2 % string
            error('TODO: support strings');
        case 3 % object
            key_type = bitshift(bitand(header, 0b00011000), -3);
            is_string = false;
            is_signed = false;
            switch key_type
                case 0
                    is_string = true;
                case 1
                    is_signed = true;
            end

            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = config(byte_count_index + 1);

            size = read_compressed(fid);

            for i = 1:size
                if is_string
                    string_size = read_compressed(fid);
                    string = fread(fid, string_size, 'char=>char', 'l');
                    data.(string) = read_value(fid);
                else
                    error('TODO: support integer keys');
                end
            end

        case 4 % typed array
            num_type = bitshift(bitand(header, 0b00011000), -3);
            is_float = false;
            is_signed = false;
            switch num_type
                case 0
                    is_float = true;
                case 1
                    is_signed = true;
            end
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = config(byte_count_index + 1);

            % Read the size of the array
            size = read_compressed(fid);

            if is_float
                switch byte_count
                    case 4
                        data = fread(fid, size, '*float32', 'l');
                    case 8
                        data = fread(fid, size, '*float64', 'l');
                end
            else
                if is_signed
                    switch byte_count
                        case 1
                            data = fread(fid, size, '*int8', 'l');
                        case 2
                            data = fread(fid, size, '*int16', 'l');
                        case 4
                            data = fread(fid, size, '*int32', 'l');
                        case 8
                            data = fread(fid, size, '*int64', 'l');
                    end
                else
                    switch byte_count
                        case 1
                            data = fread(fid, size, '*uint8', 'l');
                        case 2
                            data = fread(fid, size, '*uint16', 'l');
                        case 4
                            data = fread(fid, size, '*uint32', 'l');
                        case 8
                            data = fread(fid, size, '*uint64', 'l');
                    end
                end
            end
        case 5 % untyped array
            error('TODO: support untyped arrays');
        case 6 % extensions
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 2 % matrices
                    layout = bitand(fread(fid, 1, '*uint8', 'l'), 0b00000001);
                    switch layout
                        case 0 % row major
                            error('TODO: add row major support');
                        case 1 % column major
                            extents = read_value(fid);
                            matrix_data = read_value(fid);
                            data = reshape(matrix_data, extents(1), extents(2));
                        otherwise
                            error('Unsupported layout');
                    end
                case 3 % complex numbers
                    data = read_complex(fid);
                otherwise
                    error('Unsupported extension');
            end
        otherwise
            error('Unsupported type');
    end
end

function data = read_complex(fid)
    complex_header = fread(fid, 1, '*uint8', 'l');
    type = bitand(complex_header, 0b00000111);

    num_type = bitshift(bitand(complex_header, 0b00011000), -3);
    is_float = false;
    is_signed = false;
    switch num_type
        case 0
            is_float = true;
        case 1
            is_signed = true;
    end

    byte_count_index = bitshift(bitand(complex_header, 0b11100000), -5);
    config = uint8([1, 2, 4, 8]);
    byte_count = config(byte_count_index + 1);

    switch type
        case 0 % complex number
            if is_float
                switch byte_count
                    case 4
                        data = complex(fread(fid, 2, '*float32', 'l'));
                    case 8
                        data = complex(fread(fid, 2, '*float64', 'l'));
                end
            else
                if is_signed
                    switch byte_count
                        case 1
                            data = complex(fread(fid, 2, '*int8', 'l'));
                        case 2
                            data = complex(fread(fid, 2, '*int16', 'l'));
                        case 4
                            data = complex(fread(fid, 2, '*int32', 'l'));
                        case 8
                            data = complex(fread(fid, 2, '*int64', 'l'));
                    end
                else
                    switch byte_count
                        case 1
                            data = complex(fread(fid, 2, '*uint8', 'l'));
                        case 2
                            data = complex(fread(fid, 2, '*uint16', 'l'));
                        case 4
                            data = complex(fread(fid, 2, '*uint32', 'l'));
                        case 8
                            data = complex(fread(fid, 2, '*uint64', 'l'));
                    end
                end
            end
        case 1 % complex array
            % Read the size of the array
            size = read_compressed(fid);
    
            if is_float
                switch byte_count
                    case 4
                        raw = fread(fid, [2, size], '*float32', 'l');
                        data = complex(raw(1, :), raw(2, :));
                    case 8
                        raw = fread(fid, [2, size], '*float64', 'l');
                        data = complex(raw(1, :), raw(2, :));
                end
            else
                if is_signed
                    switch byte_count
                        case 1
                            raw = fread(fid, [2, size], '*int8', 'l');
                        case 2
                            raw = fread(fid, [2, size], '*int16', 'l');
                        case 4
                            raw = fread(fid, [2, size], '*int32', 'l');
                        case 8
                            raw = fread(fid, [2, size], '*int64', 'l');
                    end
                else
                    switch byte_count
                        case 1
                            raw = fread(fid, size, '*uint8', 'l');
                        case 2
                            raw = fread(fid, size, '*uint16', 'l');
                        case 4
                            raw = fread(fid, size, '*uint32', 'l');
                        case 8
                            raw = fread(fid, size, '*uint64', 'l');
                    end
                end
                data = complex(raw(1, :), raw(2, :)); % remap to complex
            end
    end
end

function size = read_compressed(fid)
    config = uint8([1, 2, 4, 8]);

    compressed = fread(fid, 1, '*uint8', 'l');
    n_size_bytes = config(bitand(compressed, 0b00000011) + 1);
    fseek(fid, -1, 'cof'); % 'cof' means current position
    switch n_size_bytes
        case 1
            size = fread(fid, 1, '*uint8', 'l');
        case 2
            size = fread(fid, 1, '*uint16', 'l');
        case 4
            size = fread(fid, 1, '*uint32', 'l');
        case 8
            size = fread(fid, 1, '*uint64', 'l');
        otherwise
            error('Unsupported size');
    end
    size = bitshift(size, -2);
end
