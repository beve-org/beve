% Load a .beve file
% Reference: https://github.com/stephenberry/beve
function data = load_beve(filename)
    % Open dialog box if filename isn't provided.
    if ( ~exist('filename','var') || isempty(filename) )
        [file,path] = uigetfile('*.beve',...
            'Select a BEVE file to load.');
        filename = fullfile(path,file);
        fprintf("BEVE File Selected:\n'%s'\n",filename);
    end

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
    assert(~isempty(type), 'Type data empty');
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
            [is_string, is_signed] = deal(key_type == 0, key_type == 1);

            if (~is_string)
                error('Non string object keys not implemented.');
            end


            N = read_compressed(fid);

            for ii = 1:N
                if is_string
                    string_size = read_compressed(fid);
                    string = fread(fid, string_size, 'char=>char', 'l')';
                    legal_string = makeValidFieldName(string);
                    data.(legal_string) = read_value(fid);
                else
                    error('TODO: support integer object keys');
                    % byte_count_index = bitshift(bitand(header, 0b11100000), -5);
                    % byte_count = config(byte_count_index + 1);
                end
            end

            if(N == 0)
                data = []; % Odd to have an object with zero keys, but it is supported here.
                empty_key = 'object';
                try
                    empty_key = evalin('caller','legal_string');
                catch
                end
                warning("Zero object keys found for %s", empty_key);
            end

        case 4 % typed array
            element_type = bitshift(bitand(header, 0b00011000), -3);
            [is_float, is_signed, is_bool_or_string] = ...
                deal(element_type == 0, element_type == 1, element_type == 3);
            is_numeric = not(is_bool_or_string);
            string_flag = bitshift(bitand(header, 0b00100000), -5);
            is_string = is_bool_or_string && string_flag;
            is_bool = is_bool_or_string && not( string_flag );

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
                error('Typed arrays of bools not implemented')
            end

        case 5 % untyped array
            N = read_compressed(fid);

            data = cell(N, 1);
            for ii = 1:N
                data{ii} = read_value(fid);
            end
        case 6 % extensions
            extension = bitshift(bitand(header, 0b11111000), -3);
            switch extension
                case 1 % variants
                    read_compressed(fid);
                    data = read_value(fid);
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
            % Read the N of the array
            N = read_compressed(fid);
    
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
                            raw = fread(fid, N, '*uint8', 'l');
                        case 2
                            raw = fread(fid, N, '*uint16', 'l');
                        case 4
                            raw = fread(fid, N, '*uint32', 'l');
                        case 8
                            raw = fread(fid, N, '*uint64', 'l');
                    end
                end
                data = complex(raw(1, :), raw(2, :)); % remap to complex
            end
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
