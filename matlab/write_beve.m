% Write a .beve file
% Reference: https://github.com/stephenberry/beve
function write_beve(data, filename)
    % Open dialog box if filename isn't provided.
    if ( ~exist('filename','var') || isempty(filename) )
        [file, path] = uiputfile('*.beve', 'Save BEVE file as');
        if isequal(file, 0) || isequal(path, 0)
            error('File selection cancelled');
        end
        filename = fullfile(path, file);
        fprintf("BEVE File Selected for Writing:\n'%s'\n", filename);
    end

    fid = fopen(filename, 'wb');
    if fid == -1
        error('Failed to open file for writing');
    end

    write_value(fid, data);

    fclose(fid);
end

function write_value(fid, value)
    if ischar(value)
        % Handle string values
        header = uint8(2);  % Type 2 = string
        write_byte(fid, header);
        
        % Write string length
        write_compressed(fid, length(value));
        
        % Write string content
        fwrite(fid, value, 'char', 'l');
    elseif iscell(value)
        header = uint8(5);
        write_byte(fid, header);
        write_compressed(fid, numel(value));
        for ii = 1:numel(value)
            write_value(fid, value{ii});
        end
    elseif isnumeric(value) && ~isreal(value)
        % Handle complex numbers
        header = uint8(6);  % Type 6 = extensions
        header = bitor(header, bitshift(3, 3));  % Extension 3 = complex numbers
        write_byte(fid, header);
        write_complex(fid, value);
    elseif ismatrix(value) && ~isvector(value)
        % Handle matrices
        header = uint8(6);  % Type 6 = extensions
        header = bitor(header, bitshift(2, 3));  % Extension 2 = matrices
        write_byte(fid, header);
        
        % Write layout (column major = 1)
        write_byte(fid, uint8(1));
        
        % Write dimensions
        write_value(fid, uint32([size(value,1), size(value,2)]));
        
        % Write matrix data
        write_value(fid, value(:));
    elseif isstring(value) && length(value) > 1
        % Handle string arrays
        header = uint8(4);  % Type 4 = typed array
        header = bitor(header, bitshift(3, 3));  % element_type = 3 (bool_or_string)
        header = bitor(header, bitshift(1, 5));  % string_flag = 1
        write_byte(fid, header);
        
        % Write array size
        write_compressed(fid, numel(value));
        
        % Write each string with its length
        for i = 1:numel(value)
            str = char(value(i));
            write_compressed(fid, length(str));
            fwrite(fid, str, 'char', 'l');
        end
    elseif islogical(value) && length(value) > 1
        % Handle logical arrays
        header = uint8(4);  % Type 4 = typed array
        header = bitor(header, bitshift(3, 3));  % element_type = 3 (bool_or_string)
        header = bitor(header, bitshift(0, 5));  % string_flag = 0 (bool)
        write_byte(fid, header);
        
        % Write array size
        write_compressed(fid, numel(value));
        
        % Write boolean values
        fwrite(fid, value, 'uint8', 'l');
    elseif isvector(value) && length(value) > 1
        if iscell(value) && all(cellfun(@ischar, value))
            % Handle cell array of strings as a string array
            header = uint8(4);  % Type 4 = typed array
            header = bitor(header, bitshift(3, 3));  % element_type = 3 (bool_or_string)
            header = bitor(header, bitshift(1, 5));  % string_flag = 1
            write_byte(fid, header);
            
            % Write array size
            write_compressed(fid, numel(value));
            
            % Write each string with its length
            for i = 1:numel(value)
                str = value{i};
                write_compressed(fid, length(str));
                fwrite(fid, str, 'char', 'l');
            end
        else
            % Handle numeric vectors
            header = uint8(4);
            if isfloat(value)
                write_float(fid, header, value, 1);
            else
                write_integer(fid, header, value, 1);
            end
        end
    elseif islogical(value)
        header = uint8(0);
        if value
            header = bitor(header, 0b00011000);
        else
            header = bitor(header, 0b00001000);
        end
        write_byte(fid, header);
    elseif isnumeric(value)
        header = uint8(1);
        if isfloat(value)
            write_float(fid, header, value, 0);
        else
            write_integer(fid, header, value, 0);
        end
    elseif isstring(value) && length(value) == 1
        % Handle single MATLAB string (convert to char)
        write_value(fid, char(value));
    elseif isstruct(value)
        header = uint8(3);
        key_type = 0;  % Assuming keys are always strings
        header = bitor(header, bitshift(key_type, 3));
        write_byte(fid, header);
        
        write_compressed(fid, numel(fieldnames(value)));
        fields = fieldnames(value);
        for ii = 1:numel(fields)
            field_name = fields{ii};
            write_compressed(fid, length(field_name));
            fwrite(fid, field_name, 'char', 'l');
            write_value(fid, value.(field_name));
        end
    else
        error('Unsupported data type: %s', class(value));
    end
end

function write_complex(fid, value)
    is_array = ~isscalar(value);
    type = uint8(is_array);
    
    % Determine numeric type
    if isfloat(real(value))
        num_type = 0;  % is_float = true
    elseif isinteger(real(value)) && any(real(value(:)) < 0)
        num_type = 1;  % is_signed = true
    else
        num_type = 2;  % is_unsigned = true
    end
    
    % Determine byte count
    if isa(real(value), 'single')
        byte_count_index = 2;  % 4 bytes
    elseif isa(real(value), 'double')
        byte_count_index = 3;  % 8 bytes
    elseif isa(real(value), 'int8') || isa(real(value), 'uint8')
        byte_count_index = 0;  % 1 byte
    elseif isa(real(value), 'int16') || isa(real(value), 'uint16')
        byte_count_index = 1;  % 2 bytes
    elseif isa(real(value), 'int32') || isa(real(value), 'uint32')
        byte_count_index = 2;  % 4 bytes
    elseif isa(real(value), 'int64') || isa(real(value), 'uint64')
        byte_count_index = 3;  % 8 bytes
    else
        error('Unsupported complex number type: %s', class(real(value)));
    end
    
    % Build the header
    complex_header = type;
    complex_header = bitor(complex_header, bitshift(num_type, 3));
    complex_header = bitor(complex_header, bitshift(byte_count_index, 5));
    
    % Write the header
    write_byte(fid, complex_header);
    
    % If it's an array, write the size
    if is_array
        write_compressed(fid, numel(value));
    end
    
    % Write the complex values
    % For performance:
    % Reshape data into a real array with alernating real/imag parts
    if isa(real(value), 'single')
        flat_data = zeros(2*numel(value), 1, 'single');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'float32', 'l');
    elseif isa(real(value), 'double')
        flat_data = zeros(2*numel(value), 1, 'double');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'float64', 'l');
    elseif isa(real(value), 'int8')
        flat_data = zeros(2*numel(value), 1, 'int8');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'int8', 'l');
    elseif isa(real(value), 'int16')
        flat_data = zeros(2*numel(value), 1, 'int16');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'int16', 'l');
    elseif isa(real(value), 'int32')
        flat_data = zeros(2*numel(value), 1, 'int32');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'int32', 'l');
    elseif isa(real(value), 'int64')
        flat_data = zeros(2*numel(value), 1, 'int64');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'int64', 'l');
    elseif isa(real(value), 'uint8')
        flat_data = zeros(2*numel(value), 1, 'uint8');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'uint8', 'l');
    elseif isa(real(value), 'uint16')
        flat_data = zeros(2*numel(value), 1, 'uint16');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'uint16', 'l');
    elseif isa(real(value), 'uint32')
        flat_data = zeros(2*numel(value), 1, 'uint32');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'uint32', 'l');
    elseif isa(real(value), 'uint64')
        flat_data = zeros(2*numel(value), 1, 'uint64');
        flat_data(1:2:end) = real(value(:));
        flat_data(2:2:end) = imag(value(:));
        fwrite(fid, flat_data, 'uint64', 'l');
    end
end

function write_float(fid, header, value, is_array)
    if isa(value, 'single')
        % Single precision (4 bytes)
        header = bitor(header, bitshift(0, 3));  % is_float = true
        header = bitor(header, bitshift(2, 5));  % byte_count_index = 2 (4 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'float32', 'l');
    elseif isa(value, 'double')
        % Double precision (8 bytes)
        header = bitor(header, bitshift(0, 3));  % is_float = true
        header = bitor(header, bitshift(3, 5));  % byte_count_index = 3 (8 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'float64', 'l');
    else
        error('Unsupported floating-point type: %s', class(value));
    end
end

function write_integer(fid, header, value, is_array)
    if isa(value, 'uint8')
        header = bitor(header, bitshift(2, 3));  % is_unsigned = true
        header = bitor(header, bitshift(0, 5));  % byte_count_index = 0 (1 byte)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint8', 'l');
    elseif isa(value, 'uint16')
        header = bitor(header, bitshift(2, 3));  % is_unsigned = true
        header = bitor(header, bitshift(1, 5));  % byte_count_index = 1 (2 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint16', 'l');
    elseif isa(value, 'uint32')
        header = bitor(header, bitshift(2, 3));  % is_unsigned = true
        header = bitor(header, bitshift(2, 5));  % byte_count_index = 2 (4 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint32', 'l');
    elseif isa(value, 'uint64')
        header = bitor(header, bitshift(2, 3));  % is_unsigned = true
        header = bitor(header, bitshift(3, 5));  % byte_count_index = 3 (8 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint64', 'l');
    elseif isa(value, 'int8')
        header = bitor(header, bitshift(1, 3));  % is_signed = true
        header = bitor(header, bitshift(0, 5));  % byte_count_index = 0 (1 byte)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int8', 'l');
    elseif isa(value, 'int16')
        header = bitor(header, bitshift(1, 3));  % is_signed = true
        header = bitor(header, bitshift(1, 5));  % byte_count_index = 1 (2 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int16', 'l');
    elseif isa(value, 'int32')
        header = bitor(header, bitshift(1, 3));  % is_signed = true
        header = bitor(header, bitshift(2, 5));  % byte_count_index = 2 (4 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int32', 'l');
    elseif isa(value, 'int64')
        header = bitor(header, bitshift(1, 3));  % is_signed = true
        header = bitor(header, bitshift(3, 5));  % byte_count_index = 3 (8 bytes)
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int64', 'l');
    else
        error('Unsupported integer type: %s', class(value));
    end
end

function write_byte(fid, byte)
    fwrite(fid, byte, 'uint8', 'l');
end

function write_compressed(fid, N)
    if N < 64
        compressed = bitor(bitshift(N, 2), uint8(0));
        fwrite(fid, compressed, 'uint8', 'l');
    elseif N < 16384
        compressed = bitor(bitshift(N, 2), uint16(1));
        fwrite(fid, compressed, 'uint16', 'l');
    elseif N < 1073741824
        compressed = bitor(bitshift(N, 2), uint32(2));
        fwrite(fid, compressed, 'uint32', 'l');
    else
        compressed = bitor(bitshift(N, 2), uint64(3));
        fwrite(fid, compressed, 'uint64', 'l');
    end
end