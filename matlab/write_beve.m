% Write a .beve file
% Reference: https://github.com/stephenberry/beve
function write_beve(data, filename)
    fid = fopen(filename, 'wb');
    if fid == -1
        error('Failed to open file for writing');
    end

    write_value(fid, data);

    fclose(fid);
end

function write_value(fid, value)
    if isvector(value) && length(value) > 1
        header = uint8(4);
        if isfloat(value)
            write_float(fid, header, value, 1);
        else
             write_integer(fid, header, value, 1);
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
    elseif ischar(value)
        error('Unsupported data type');
    elseif isstruct(value)
        header = uint8(3);
        key_type = 0;  % Assuming keys are always strings
        is_signed = false;
        header = bitor(header, bitshift(key_type, 3));
        header = bitor(header, bitshift(is_signed, 5));
        fwrite(fid, header, 'uint8', 'l');
        
        write_compressed(fid, numel(fieldnames(value)));
        fields = fieldnames(value);
        for ii = 1:numel(fields)
            field_name = fields{ii};
            write_compressed(fid, length(field_name));
            fwrite(fid, field_name, 'char', 'l');
            write_value(fid, value.(field_name));
        end
    elseif iscell(value)
        header = uint8(5);
        write_byte(fid, header);
        write_compressed(fid, numel(value));
        for ii = 1:numel(value)
            write_value(fid, value{ii});
        end
    else
        error('Unsupported data type');
    end
end

function write_float(fid, header, value, is_array)
    if isa(value, 'single')
        header = bitor(header, 0b01000000);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'float32', 'l');
    elseif isa(value, 'double')
        header = bitor(header, 0b01100000);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'float64', 'l');
    else
        error('Unsupported floating-point type');
    end
end

function write_integer(fid, header, value, is_array)
    if isa(value, 'uint8')
        header = bitor(header, 0b00010001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint8', 'l');
    elseif isa(value, 'uint16')
        header = bitor(header, 0b00110001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint16', 'l');
    elseif isa(value, 'uint32')
        header = bitor(header, 0b01010001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint32', 'l');
    elseif isa(value, 'uint64')
        header = bitor(header, 0b01110001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'uint64', 'l');
    elseif isa(value, 'int8')
        header = bitor(header, 0b00001001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int8', 'l');
    elseif isa(value, 'int16')
        header = bitor(header, 0b00101001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int16', 'l');
    elseif isa(value, 'int32')
        header = bitor(header, 0b01001001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int32', 'l');
    elseif isa(value, 'int64')
        header = bitor(header, 0b01101001);
        write_byte(fid, header);
        if is_array
            write_compressed(fid, length(value));
        end
        fwrite(fid, value, 'int64', 'l');
    else
        error('Unsupported type');
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
        compressed = bitor(bitshift(N, 2), uint8(1));
        fwrite(fid, compressed, 'uint16', 'l');
    elseif N < 1073741824
        compressed = bitor(bitshift(N, 2), uint8(2));
        fwrite(fid, compressed, 'uint32', 'l');
    elseif N < 4611686018427387904
        compressed = bitor(bitshift(N, 2), uint8(3));
        fwrite(fid, compressed, 'uint64', 'l');
    end
end
