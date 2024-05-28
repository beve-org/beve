use anyhow::Error;
use std::convert::TryInto;
use std::io::Cursor;
use std::io::Read;
use std::io::Write;
use std::mem::size_of;
use std::num::FpCategory;
use std::str;
use std::str::FromStr;
//num_complex
use num_complex::Complex;

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use num_bigint::BigUint;
use num_traits::cast::ToPrimitive;

struct Beve {
    buffer: Vec<u8>,
    cursor: usize,
}

impl Beve {
    fn read_uint8(&mut self) -> u8 {
        let val = self.buffer[self.cursor];
        self.cursor += 1;
        val
    }

    fn read_int8(&mut self) -> i8 {
        self.read_uint8() as i8
    }

    fn read_uint16(&mut self) -> u16 {
        let mut rdr = Cursor::new(&self.buffer[self.cursor..]);
        let val = rdr.read_u16::<LittleEndian>().unwrap();
        self.cursor += 2;
        val
    }

    fn read_int16(&mut self) -> i16 {
        self.read_uint16() as i16
    }

    fn read_uint32(&mut self) -> u32 {
        let mut rdr = Cursor::new(&self.buffer[self.cursor..]);
        let val = rdr.read_u32::<LittleEndian>().unwrap();
        self.cursor += 4;
        val
    }

    fn read_int32(&mut self) -> i32 {
        self.read_uint32() as i32
    }

    fn read_uint64(&mut self) -> u64 {
        let mut rdr = Cursor::new(&self.buffer[self.cursor..]);
        let val = rdr.read_u64::<LittleEndian>().unwrap();
        self.cursor += 8;
        val
    }

    fn read_int64(&mut self) -> i64 {
        self.read_uint64() as i64
    }

    fn read_float(&mut self) -> f32 {
        let bits = self.read_uint32();
        f32::from_bits(bits)
    }

    fn read_double(&mut self) -> f64 {
        let bits = self.read_uint64();
        f64::from_bits(bits)
    }

    fn read_big_int64(&mut self) -> BigUint {
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&self.buffer[self.cursor..self.cursor + 8]);
        self.cursor += 8;
        BigUint::from_bytes_le(&bytes)
    }

    fn read_big_uint64(&mut self) -> BigUint {
        self.read_big_int64()
    }

    fn read_compressed(&mut self) -> i32 {
        let header = self.buffer[self.cursor];
        self.cursor += 1;
        let config = header & 0b00000011;

        match config {
            0 => (header >> 2) as i32,
            1 => {
                let value = self.read_uint16();
                (value >> 2) as i32
            }
            2 => {
                let value = self.read_uint32();
                (value >> 2) as i32
            }
            3 => {
                let mut val = BigUint::default();
                for _ in 0..8 {
                    let byte = BigUint::from(self.buffer[self.cursor]);
                    val |= &byte << (8 * self.cursor);
                    self.cursor += 1;
                }
                val >>= 2;
                val.to_i64().unwrap()
            }
            _ => 0,
        }
    }

    fn read_string(&mut self) -> String {
        let size = self.read_compressed();
        let str_bytes = &self.buffer[self.cursor..self.cursor + size as usize];
        self.cursor += size as usize;
        String::from_utf8_lossy(str_bytes).to_string()
    }

    fn reshape<T>(&mut self, data: Vec<T>, rows: usize, cols: usize) -> Vec<Vec<T>> {
        assert_eq!(rows * cols, data.len());

        let mut result = Vec::with_capacity(rows);
        for i in 0..rows {
            let start = i * cols;
            let end = (i + 1) * cols;
            result.push(data[start..end].to_vec());
        }
        result
    }

    fn read_complex(&mut self) -> num_complex::Complex<f64> {
        let real = self.read_double();
        let imag = self.read_double();
        num_complex::Complex::new(real, imag)
    }

    fn read_value(&mut self) -> Result<Box<dyn std::any::Any>, Box<dyn std::error::Error>> {
        let header = self.buffer[self.cursor];
        self.cursor += 1;
        let typ = header & 0b00000111;

        match typ {
            0 => {
                let is_bool = (header & 0b00001000) >> 3;
                if is_bool > 0 {
                    let value = (header & 0b11110000) >> 4 > 0;
                    Ok(Box::new(value))
                } else {
                    Ok(Box::new(()))
                }
            }
            1 => {
                let num_type = (header & 0b00011000) >> 3;
                let is_float = num_type == 0;
                let is_signed = num_type == 1;
                let byte_count_index = (header & 0b11100000) >> 5;
                let byte_count = [1, 2, 4, 8][byte_count_index as usize];

                if is_float {
                    match byte_count {
                        4 => {
                            let value = self.read_float();
                            Ok(Box::new(value))
                        }
                        8 => {
                            let value = self.read_double();
                            Ok(Box::new(value))
                        }
                        _ => Err(Box::new("Unsupported float size".to_string())),
                    }
                } else {
                    if is_signed {
                        match byte_count {
                            1 => {
                                let value = self.read_int8();
                                Ok(Box::new(value))
                            }
                            2 => {
                                let value = self.read_int16();
                                Ok(Box::new(value))
                            }
                            4 => {
                                let value = self.read_int32();
                                Ok(Box::new(value))
                            }
                            8 => {
                                let value = self.read_int64();
                                Ok(Box::new(value))
                            }
                            _ => Err(Box::new("Unsupported signed integer size".to_string())),
                        }
                    } else {
                        match byte_count {
                            1 => {
                                let value = self.read_uint8();
                                Ok(Box::new(value))
                            }
                            2 => {
                                let value = self.read_uint16();
                                Ok(Box::new(value))
                            }
                            4 => {
                                let value = self.read_uint32();
                                Ok(Box::new(value))
                            }
                            8 => {
                                let value = self.read_uint64();
                                Ok(Box::new(value))
                            }
                            _ => Err(Box::new("Unsupported unsigned integer size".to_string())),
                        }
                    }
                }
            }
            2 => {
                let value = self.read_string();
                Ok(Box::new(value))
            }
            3 => {
                let key_type = (header & 0b00011000) >> 3;
                let is_string = key_type == 0;
                let n = self.read_compressed();

                let mut object_data = std::collections::HashMap::new();

                for _ in 0..n {
                    if is_string {
                        let key = self.read_string();
                        let value = self.read_value()?;
                        object_data.insert(key, value);
                    } else {
                        return Err(Box::new("TODO: support integer keys".to_string()));
                    }
                }

                Ok(Box::new(object_data))
            }
            4 => {
                let num_type = (header & 0b00011000) >> 3;
                let is_float = num_type == 0;
                let is_signed = num_type == 1;
                let byte_count_index_array = (header & 0b11100000) >> 5;
                let byte_count_array = [1, 2, 4, 8][byte_count_index_array as usize];

                if num_type == 3 {
                    let is_string = (header & 0b00100000) >> 5;
                    if is_string != 0 {
                        let n = self.read_compressed();
                        let mut array = Vec::with_capacity(n as usize);
                        for _ in 0..n {
                            let size = self.read_compressed();
                            let value = self.read_string();
                            array.push(value);
                        }
                        Ok(Box::new(array))
                    } else {
                        Err(Box::new(
                            "Boolean array support not implemented".to_string(),
                        ))
                    }
                } else if is_float {
                    let n = self.read_compressed();
                    let mut array = Vec::with_capacity(n as usize);

                    match byte_count_array {
                        4 => {
                            for _ in 0..n {
                                let value = self.read_float();
                                array.push(value);
                            }
                        }
                        8 => {
                            for _ in 0..n {
                                let value = self.read_double();
                                array.push(value);
                            }
                        }
                        _ => return Err(Box::new("Unsupported float size".to_string())),
                    }

                    Ok(Box::new(array))
                } else {
                    let n = self.read_compressed();
                    let mut array = Vec::with_capacity(n as usize);

                    if is_signed {
                        match byte_count_array {
                            1 => {
                                for _ in 0..n {
                                    let value = self.read_int8();
                                    array.push(value);
                                }
                            }
                            2 => {
                                for _ in 0..n {
                                    let value = self.read_int16();
                                    array.push(value);
                                }
                            }
                            4 => {
                                for _ in 0..n {
                                    let value = self.read_int32();
                                    array.push(value);
                                }
                            }
                            8 => {
                                for _ in 0..n {
                                    let value = self.read_big_int64();
                                    array.push(value);
                                }
                            }
                            _ => {
                                return Err(Box::new("Unsupported signed integer size".to_string()))
                            }
                        }
                    } else {
                        match byte_count_array {
                            1 => {
                                for _ in 0..n {
                                    let value = self.read_uint8();
                                    array.push(value);
                                }
                            }
                            2 => {
                                for _ in 0..n {
                                    let value = self.read_uint16();
                                    array.push(value);
                                }
                            }
                            4 => {
                                for _ in 0..n {
                                    let value = self.read_uint32();
                                    array.push(value);
                                }
                            }
                            8 => {
                                for _ in 0..n {
                                    let value = self.read_big_uint64();
                                    array.push(value);
                                }
                            }
                            _ => {
                                return Err(Box::new(
                                    "Unsupported unsigned integer size".to_string(),
                                ))
                            }
                        }
                    }

                    Ok(Box::new(array))
                }
            }
            5 => {
                let n = self.read_compressed();
                let mut arr = Vec::with_capacity(n as usize);
                for _ in 0..n {
                    let value = self.read_value()?;
                    arr.push(value);
                }
                Ok(Box::new(arr))
            }
            6 => {
                let extension = (header & 0b11111000) >> 3;
                match extension {
                    1 => {
                        let _ = self.read_compressed(); // Skip variant tag
                        self.read_value()
                    }
                    2 => {
                        let layout = self.buffer[self.cursor] & 0b00000001;
                        self.cursor += 1;
                        match layout {
                            0 => Err(Box::new(
                                "Row major matrix layout not implemented".to_string(),
                            )),
                            1 => {
                                let extents = self.read_value()?;
                                let extents_slice = extents
                                    .downcast_ref::<Vec<Box<dyn std::any::Any>>>()
                                    .unwrap();
                                let rows = extents_slice[0].downcast_ref::<usize>().unwrap();
                                let cols = extents_slice[1].downcast_ref::<usize>().unwrap();

                                let matrix_data = self.read_value()?;
                                match matrix_data.downcast_ref::<Vec<f64>>() {
                                    Some(data) => {
                                        let reshaped = self.reshape(data.clone(), *rows, *cols);
                                        Ok(Box::new(reshaped))
                                    }
                                    None => match matrix_data.downcast_ref::<Vec<i32>>() {
                                        Some(data) => {
                                            let reshaped = self.reshape(data.clone(), *rows, *cols);
                                            Ok(Box::new(reshaped))
                                        }
                                        None => match matrix_data.downcast_ref::<Vec<i16>>() {
                                            Some(data) => {
                                                let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                Ok(Box::new(reshaped))
                                            }
                                            None => match matrix_data.downcast_ref::<Vec<i32>>() {
                                                Some(data) => {
                                                    let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                    Ok(Box::new(reshaped))
                                                }
                                                None => match matrix_data.downcast_ref::<Vec<i64>>() {
                                                    Some(data) => {
                                                        let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                        Ok(Box::new(reshaped))
                                                    }
                                                    None => match matrix_data.downcast_ref::<Vec<u8>>() {
                                                        Some(data) => {
                                                            let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                            Ok(Box::new(reshaped))
                                                        }
                                                        None => match matrix_data.downcast_ref::<Vec<usize>>() {
                                                            Some(data) => {
                                                                let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                                Ok(Box::new(reshaped))
                                                            }
                                                            None => match matrix_data.downcast_ref::<Vec<u16>>() {
                                                                Some(data) => {
                                                                    let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                                    Ok(Box::new(reshaped))
                                                                }
                                                                None => match matrix_data.downcast_ref::<Vec<u32>>() {
                                                                    Some(data) => {
                                                                        let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                                        Ok(Box::new(reshaped))
                                                                    }
                                                                    None => match matrix_data.downcast_ref::<Vec<u64>>() {
                                                                        Some(data) => {
                                                                            let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                                            Ok(Box::new(reshaped))
                                                                        }
                                                                        None => match matrix_data.downcast_ref::<Vec<f32>>() {
                                                                            Some(data) => {
                                                                                let reshaped = self.reshape(data.clone(), *rows, *cols);
                                                                                Ok(Box::new(reshaped))
                                                                            }
                                                                            None => Err(Box::new("Unsupported matrix data type".to_string())),
                                                                        },
                                                                    },
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                }
                            }
                            _ => Err(Box::new("Unsupported matrix layout".to_string())),
                        }
                    }
                    3 => {
                        let complex = self.read_complex();
                        Ok(Box::new(complex))
                    }
                    _ => Err(Box::new("Unsupported extension".to_string())),
                }
            }
            _ => Err(Box::new("Unsupported type".to_string())),
        }
    }
}

struct Writer {
    buffer: Vec<u8>,
    offset: usize,
}

impl Writer {
    fn new(size: usize) -> Self {
        let size = if size <= 0 { 256 } else { size };
        Writer {
            buffer: vec![0; size],
            offset: 0,
        }
    }

    fn ensure_capacity(&mut self, size: usize) {
        if self.offset + size > self.buffer.len() {
            let new_size = (self.buffer.len() + size) * 2;
            self.buffer.resize(new_size, 0);
        }
    }

    fn append_uint8(&mut self, value: u8) -> Result<(), Box<dyn std::error::Error>> {
        if value > 255 {
            return Err(Box::new(
                "Value must be an integer between 0 and 255".to_string(),
            ));
        }
        self.ensure_capacity(1);
        self.buffer[self.offset] = value;
        self.offset += 1;
        Ok(())
    }

    fn append_uint16(&mut self, value: u16) -> Result<(), Box<dyn std::error::Error>> {
        if value > 65535 {
            return Err(Box::new(
                "Value must be an integer between 0 and 65535".to_string(),
            ));
        }
        self.ensure_capacity(2);
        self.buffer[self.offset..].write_u16::<LittleEndian>(value)?;
        self.offset += 2;
        Ok(())
    }

    fn append_uint32(&mut self, value: u32) -> Result<(), Box<dyn std::error::Error>> {
        if value > 4294967295 {
            return Err(Box::new(
                "Value must be an integer between 0 and 4294967295".to_string(),
            ));
        }
        self.ensure_capacity(4);
        self.buffer[self.offset..].write_u32::<LittleEndian>(value)?;
        self.offset += 4;
        Ok(())
    }

    fn append_uint64(&mut self, value: &BigUint) -> Result<(), Box<dyn std::error::Error>> {
        if value < &BigUint::from(0) || value > &BigUint::from(18446744073709551615u64) {
            return Err(Box::new(
                "Value must be an integer between 0 and 18446744073709551615".to_string(),
            ));
        }
        self.ensure_capacity(8);
        let low = value & BigUint::from(0xffffffff);
        let high = value >> 32;

        self.buffer[self.offset..].write_u32::<LittleEndian>(low.to_u32().unwrap())?;
        self.buffer[self.offset + 4..].write_u32::<LittleEndian>(high.to_u32().unwrap())?;
        self.offset += 8;
        Ok(())
    }

    fn append<T: std::any::Any>(&mut self, value: T) -> Result<(), Box<dyn std::error::Error>> {
        match value.downcast_ref::<Vec<Box<dyn std::any::Any>>>() {
            Some(arr) => {
                for element in arr {
                    self.append(element)?;
                }
            }
            None => match value.downcast_ref::<String>() {
                Some(s) => {
                    let bytes = s.as_bytes();
                    self.ensure_capacity(bytes.len());
                    self.buffer[self.offset..self.offset + bytes.len()].copy_from_slice(bytes);
                    self.offset += bytes.len();
                }
                None => match value.downcast_ref::<i32>() {
                    Some(i) => {
                        self.ensure_capacity(4);
                        self.buffer[self.offset..].write_i32::<LittleEndian>(*i)?;
                        self.offset += 4;
                    }
                    None => match value.downcast_ref::<f64>() {
                        Some(f) => {
                            self.ensure_capacity(8);
                            self.buffer[self.offset..].write_f64::<LittleEndian>(*f)?;
                            self.offset += 8;
                        }
                        None => return Err(Box::new("Unsupported value type".to_string())),
                    },
                },
            },
        }
        Ok(())
    }

    fn write_beve(
        &mut self,
        data: Box<dyn std::any::Any>,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        self.append(data)?;
        Ok(self.buffer[..self.offset].to_vec())
    }
}

fn write_value(
    writer: &mut Writer,
    value: Box<dyn std::any::Any>,
) -> Result<(), Box<dyn std::error::Error>> {
    match value.downcast_ref::<Vec<f64>>() {
        Some(arr) => {
            writer.append_uint8(0b01100000 | 4)?; // float64_t, 8 bytes
            writer.append_uint32(arr.len().try_into().unwrap())?;
            for f in arr {
                writer.append(f)?;
            }
        }
        None => {
            match value.downcast_ref::<Vec<i32>>() {
                Some(arr) => {
                    writer.append_uint8(0b01001000 | 4)?; // int32_t, 4 bytes
                    writer.append_uint32(arr.len().try_into().unwrap())?;
                    for i in arr {
                        writer.append(i)?;
                    }
                }
                None => {
                    match value.downcast_ref::<bool>() {
                        Some(b) => {
                            if *b {
                                writer.append_uint8(0b00011000)?;
                            } else {
                                writer.append_uint8(0b00001000)?;
                            }
                        }
                        None => match value.downcast_ref::<i32>() {
                            Some(i) => {
                                if f64::from(*i) - f64::from(*i as i64) != 0.0 {
                                    writer.append_uint8(0b01100000)?;
                                } else {
                                    writer.append_uint8(0b01001000)?;
                                }
                                writer.append(i)?;
                            }
                            None => match value.downcast_ref::<String>() {
                                Some(s) => {
                                    writer.append_uint8(2)?;
                                    writer.append_uint32(s.len().try_into().unwrap())?;
                                    writer.append(s)?;
                                }
                                None => match value.downcast_ref::<Vec<Box<dyn std::any::Any>>>() {
                                    Some(arr) => {
                                        writer.append_uint8(5)?;
                                        writer.append_uint32(arr.len().try_into().unwrap())?;
                                        for val in arr {
                                            write_value(writer, val.clone())?;
                                        }
                                    }
                                    None => {
                                        match value.downcast_ref::<std::collections::HashMap<
                                            String,
                                            Box<dyn std::any::Any>,
                                        >>() {
                                            Some(map) => {
                                                writer.append_uint8(3)?; // Assume string keys
                                                writer
                                                    .append_uint32(map.len().try_into().unwrap())?;
                                                for (key, val) in map {
                                                    writer.append_uint32(
                                                        key.len().try_into().unwrap(),
                                                    )?;
                                                    writer.append(key)?;
                                                    write_value(writer, val.clone())?;
                                                }
                                            }
                                            None => {
                                                return Err(Box::new(
                                                    "Unsupported data type".to_string(),
                                                ))
                                            }
                                        }
                                    }
                                },
                            },
                        },
                    }
                }
            }
        }
    }
    Ok(())
}
