% Load a .beve file
% Reference: https://github.com/beve-org/beve/blob/main/matlab/load_beve.m
% Given Path to file: Load
% Given Path to folder: Open load dialog box in folder
% Given no arguments: Open load dialog box in working directory
function data = load_beve(path)

    isPathDirectory = false;
    defaultFolder = ''; % present working directory
    isPathGiven = exist('path','var') && ~isempty(path);
    if(isPathGiven)
        %isPathFile = isfile(path);
        isPathDirectory = isfolder(path);
        if(isPathDirectory)
            defaultFolder = path;
        end
    end

    % Open Dialog Box
    if ( ~isPathGiven || isPathDirectory )
        [file,path] = uigetfile(fullfile(defaultFolder,'*.beve'),...
            'Select a BEVE file to load.');
        path = fullfile(path,file);
        fprintf("BEVE File Selected:\n'%s'\n",path);
    end

    fid = fopen(path, 'rb');
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
    assert(~isempty(header), 'Unexpected end of data');

    % Configuration mapping
    config = uint8([1, 2, 4, 8]);

    % Extract header components
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
            is_float = false;
            is_signed = false;
            switch element_type
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
            string_size = read_compressed(fid);
            data = fread(fid, string_size, 'char=>char', 'l')';
        case 3 % object
            key_type = bitshift(bitand(header, 0b00011000), -3);
            is_string = (key_type == 0);
            is_signed = (key_type == 1);
            
            % Get byte count for integer keys
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = config(byte_count_index + 1);

            N = read_compressed(fid);
            
            % Initialize empty struct if there are fields
            if N > 0
                data = struct();
            else
                data = []; % Empty object
                return;
            end

            for ii = 1:N
                if is_string
                    % Read string key
                    string_size = read_compressed(fid);
                    string = fread(fid, string_size, 'char=>char', 'l')';
                    legal_string = makeValidFieldName(string);
                    data.(legal_string) = read_value(fid);
                else
                    % Handle integer keys (signed or unsigned)
                    if is_signed
                        switch byte_count
                            case 1
                                key = fread(fid, 1, '*int8', 'l');
                            case 2
                                key = fread(fid, 1, '*int16', 'l');
                            case 4
                                key = fread(fid, 1, '*int32', 'l');
                            case 8
                                key = fread(fid, 1, '*int64', 'l');
                        end
                    else % unsigned
                        switch byte_count
                            case 1
                                key = fread(fid, 1, '*uint8', 'l');
                            case 2
                                key = fread(fid, 1, '*uint16', 'l');
                            case 4
                                key = fread(fid, 1, '*uint32', 'l');
                            case 8
                                key = fread(fid, 1, '*uint64', 'l');
                        end
                    end
                    % Convert integer key to valid MATLAB field name
                    key_str = sprintf('int_%d', key);
                    data.(key_str) = read_value(fid);
                end
            end

        case 4 % typed array
            element_type = bitshift(bitand(header, 0b00011000), -3);
            [is_float, is_signed, is_bool_or_string] = ...
                deal(element_type == 0, element_type == 1, element_type == 3);
            is_numeric = not(is_bool_or_string);
            sub_type = bitshift(bitand(header, 0b11100000), -5);
            is_string = is_bool_or_string && (sub_type == 1);
            is_bool = is_bool_or_string && (sub_type == 0);
            is_aligned = is_bool_or_string && (sub_type == 2);

            if is_aligned
                data = read_aligned_typed_array(fid);
            else

            %% Only used for numeric types
            byte_count_index = bitshift(bitand(header, 0b11100000), -5);
            byte_count = config(byte_count_index + 1);

            % Read the N of the array
            N = read_compressed(fid);

            if is_numeric
                if is_float
                    switch byte_count
                        case 4
                            data = fread(fid, N, '*float32', 'l');
                        case 8
                            data = fread(fid, N, '*float64', 'l');
                    end
                else
                    if is_signed
                        switch byte_count
                            case 1
                                data = fread(fid, N, '*int8', 'l');
                            case 2
                                data = fread(fid, N, '*int16', 'l');
                            case 4
                                data = fread(fid, N, '*int32', 'l');
                            case 8
                                data = fread(fid, N, '*int64', 'l');
                        end
                    else
                        switch byte_count
                            case 1
                                data = fread(fid, N, '*uint8', 'l');
                            case 2
                                data = fread(fid, N, '*uint16', 'l');
                            case 4
                                data = fread(fid, N, '*uint32', 'l');
                            case 8
                                data = fread(fid, N, '*uint64', 'l');
                        end
                    end
                end
            elseif is_string
                % Read an array of strings (or cell array of character vectors?)
                % For each element... (there are N)
                % Read the compressed size, then read that number of chars
                data=strings(N,1); % Initialize string array
                for ii=1:N
                    string_size = read_compressed(fid);
                    data{ii} = fread(fid, string_size, 'char=>char', 'l')';
                end
            elseif is_bool
                % Read packed boolean values (8 per byte)
                N = double(N); % Avoid integer division
                num_bytes = ceil(N / 8);
                packed_bytes = fread(fid, num_bytes, '*uint8', 'l');

                % Unpack the booleans from the bytes
                data = false(N, 1);
                for i = 1:N
                    byte_index = floor((i-1) / 8) + 1;
                    bit_position = mod(i-1, 8);
                    data(i) = bitand(bitshift(packed_bytes(byte_index), -bit_position), 1) == 1;
                end
            else
                error('Unknown typed array sub-type: %d', sub_type);
            end

            end % is_aligned else

        case 5 % untyped array
            N = read_compressed(fid);

            data = cell(N, 1);
            for ii = 1:N
                data{ii} = read_value(fid);
            end
        case 6 % extensions
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 1 % variants (deprecated in v2 - read for backward compatibility with v1 data)
                    read_compressed(fid); % skip the legacy type tag
                    data = read_value(fid);
                case 2 % matrices
                    layout = bitand(fread(fid, 1, '*uint8', 'l'), 0b00000001);
                    extents = read_value(fid);
                    matrix_data = read_value(fid);
                    
                    switch layout
                        case 0 % row major
                            % For row-major, we need to reshape and transpose
                            data = reshape(matrix_data, extents(2), extents(1))';
                        case 1 % column major
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

% Reads an aligned typed array whose typed array header byte has already been
% consumed. Returns the elements alongside the numeric header, so callers that wrap
% an aligned typed array (such as complex arrays) can validate it.
function [data, numeric_header] = read_aligned_typed_array(fid)
    config = uint8([1, 2, 4, 8]);

    numeric_header = fread(fid, 1, '*uint8', 'l');
    assert(bitand(numeric_header, 0b00000111) == 0b100, ...
        'Invalid aligned typed array numeric header');
    element_type = bitshift(bitand(numeric_header, 0b00011000), -3);
    assert(element_type ~= 3, ...
        'Aligned typed array numeric header must not encode boolean or string');
    is_float = (element_type == 0);
    is_signed = (element_type == 1);
    byte_count_index = bitshift(bitand(numeric_header, 0b11100000), -5);
    byte_count = config(byte_count_index + 1);
    N = read_compressed(fid);
    padding_length = fread(fid, 1, '*uint8', 'l');
    if padding_length > 0
        [~, count] = fread(fid, padding_length, '*uint8', 'l');
        assert(count == padding_length, ...
            'Aligned typed array padding extends past end of file');
    end

    if is_float
        assert(byte_count == 4 || byte_count == 8, ...
            'Unsupported aligned typed array float byte count: %d', byte_count);
        switch byte_count
            case 4
                data = fread(fid, N, '*float32', 'l');
            case 8
                data = fread(fid, N, '*float64', 'l');
        end
    else
        if is_signed
            switch byte_count
                case 1
                    data = fread(fid, N, '*int8', 'l');
                case 2
                    data = fread(fid, N, '*int16', 'l');
                case 4
                    data = fread(fid, N, '*int32', 'l');
                case 8
                    data = fread(fid, N, '*int64', 'l');
            end
        else
            switch byte_count
                case 1
                    data = fread(fid, N, '*uint8', 'l');
                case 2
                    data = fread(fid, N, '*uint16', 'l');
                case 4
                    data = fread(fid, N, '*uint32', 'l');
                case 8
                    data = fread(fid, N, '*uint64', 'l');
            end
        end
    end

    % fread silently returns a short vector when the payload is truncated
    assert(numel(data) == N, ...
        'Aligned typed array payload extends past end of file');
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
            % Read the N of the array
            N = read_compressed(fid);

            if N == 0
                if is_float
                    switch byte_count
                        case 4, data = complex(zeros(1,0,'single'));
                        case 8, data = complex(zeros(1,0,'double'));
                    end
                elseif is_signed
                    switch byte_count
                        case 1, data = complex(zeros(1,0,'int8'));
                        case 2, data = complex(zeros(1,0,'int16'));
                        case 4, data = complex(zeros(1,0,'int32'));
                        case 8, data = complex(zeros(1,0,'int64'));
                    end
                else
                    switch byte_count
                        case 1, data = complex(zeros(1,0,'uint8'));
                        case 2, data = complex(zeros(1,0,'uint16'));
                        case 4, data = complex(zeros(1,0,'uint32'));
                        case 8, data = complex(zeros(1,0,'uint64'));
                    end
                end
                return;
            end

            if is_float
                switch byte_count
                    case 4
                        raw = fread(fid, [2, N], '*float32', 'l');
                        data = complex(raw(1, :), raw(2, :));
                    case 8
                        raw = fread(fid, [2, N], '*float64', 'l');
                        data = complex(raw(1, :), raw(2, :));
                end
            else
                if is_signed
                    switch byte_count
                        case 1
                            raw = fread(fid, [2, N], '*int8', 'l');
                        case 2
                            raw = fread(fid, [2, N], '*int16', 'l');
                        case 4
                            raw = fread(fid, [2, N], '*int32', 'l');
                        case 8
                            raw = fread(fid, [2, N], '*int64', 'l');
                    end
                else
                    switch byte_count
                        case 1
                            raw = fread(fid, [2, N], '*uint8', 'l');
                        case 2
                            raw = fread(fid, [2, N], '*uint16', 'l');
                        case 4
                            raw = fread(fid, [2, N], '*uint32', 'l');
                        case 8
                            raw = fread(fid, [2, N], '*uint64', 'l');
                    end
                end
                data = complex(raw(1, :), raw(2, :)); % remap to complex
            end
        case 2 % aligned complex array
            inner_header = fread(fid, 1, '*uint8', 'l');
            assert(inner_header == 0x5C, ...
                'Aligned complex array value must be an aligned typed array');
            [components, inner_numeric_header] = read_aligned_typed_array(fid);
            % Both headers carry the numerical type and BYTE COUNT in bits 3-7
            assert(bitand(inner_numeric_header, 0b11111000) == bitand(complex_header, 0b11111000), ...
                'Aligned complex array element type does not match its complex header');
            assert(mod(numel(components), 2) == 0, ...
                'Aligned complex array component count must be even');
            % Components are interleaved [re, im] pairs
            raw = reshape(components, 2, []);
            data = complex(raw(1, :), raw(2, :));
        otherwise
            error('Unsupported complex sub-type: %d', type);
    end
end

function N = read_compressed(fid)
    config = uint8([1, 2, 4, 8]);

    compressed = fread(fid, 1, '*uint8', 'l');
    n_size_bytes = config(bitand(compressed, 0b00000011) + 1);
    fseek(fid, -1, 'cof'); % 'cof' means current position
    switch n_size_bytes
        case 1
            N = fread(fid, 1, '*uint8', 'l');
        case 2
            N = fread(fid, 1, '*uint16', 'l');
        case 4
            N = fread(fid, 1, '*uint32', 'l');
        case 8
            N = fread(fid, 1, '*uint64', 'l');
        otherwise
            error('Unsupported N');
    end
    N = bitshift(N, -2);
end


function validName = makeValidFieldName(fieldName)
     % Convert string to char array if necessary
    if isstring(fieldName)
        fieldName = char(fieldName);
    end

    % Transpose if is a column vector
    if(size(fieldName,1) > 1 && size(fieldName,2) == 1)
        fieldName = fieldName';
    end

    % Replace invalid characters with underscores
    validName = regexprep(fieldName, '[^a-zA-Z0-9_]', '');
    
    % Ensure the name starts with a letter
    if isempty(regexp(validName, '^[a-zA-Z]', 'once'))
        validName = ['A', validName]; % Prepend 'A' if the name does not start with a letter
    end

    % Truncate if the name is too long
    maxNameLength = namelengthmax();
    if length(validName) > maxNameLength
        validName = validName(1:maxNameLength);
    end
end
