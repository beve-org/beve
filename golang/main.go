package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"math/big"
	"os"
)

type Beve struct {
	buffer []byte
	cursor int
}

// Helper functions to simulate reading different data types from the buffer
func (b *Beve) readUInt8() uint8 {
	val := b.buffer[b.cursor]
	b.cursor++
	return val
}

func (b *Beve) readInt8() int8 {
	return int8(b.readUInt8())
}

func (b *Beve) readUInt16() uint16 {
	val := binary.LittleEndian.Uint16(b.buffer[b.cursor:])
	b.cursor += 2
	return val
}

func (b *Beve) readInt16() int16 {
	return int16(b.readUInt16())
}

// ... (similar functions for readUInt32, readInt32, readFloat, readDouble, etc.)
func (b *Beve) readUInt32() uint32 {
	val := binary.LittleEndian.Uint32(b.buffer[b.cursor:])
	b.cursor += 4
	return val
}
func (b *Beve) readInt32() int32 {
	return int32(b.readUInt32())
}
func (b *Beve) readUInt64() uint64 {
	val := binary.LittleEndian.Uint64(b.buffer[b.cursor:])
	b.cursor += 8
	return val
}

func (b *Beve) readInt64() int64 {
	return int64(b.readUInt64())
}
func (b *Beve) readFloat() float32 {
	return math.Float32frombits(b.readUInt32())
}
func (b *Beve) readDouble() float64 {
	return math.Float64frombits(b.readUInt64())
}
func (b *Beve) readBigInt64() *big.Int {
	// Read and construct big.Int from buffer
	bytes := make([]byte, 8)
	copy(bytes, b.buffer[b.cursor:b.cursor+8])
	b.cursor += 8
	return new(big.Int).SetBytes(bytes)
}

func (b *Beve) readBigUInt64() *big.Int {
	// Read and construct big.Int from buffer
	bytes := make([]byte, 8)
	copy(bytes, b.buffer[b.cursor:b.cursor+8])
	b.cursor += 8
	return new(big.Int).SetBytes(bytes)
}
func (b *Beve) readFloat32() float32 {
	bits := binary.LittleEndian.Uint32(b.buffer[b.cursor:])
	b.cursor += 4
	return math.Float32frombits(bits)
}

func (b *Beve) readFloat64() float64 {
	bits := binary.LittleEndian.Uint64(b.buffer[b.cursor:])
	b.cursor += 8
	return math.Float64frombits(bits)
}

func (b *Beve) readCompressed() int {
	header := b.buffer[b.cursor]
	b.cursor++
	config := header & 0b00000011

	switch config {
	case 0:
		return int(header >> 2)
	case 1:
		value := binary.LittleEndian.Uint16(b.buffer[b.cursor:])
		b.cursor += 2
		return int(value >> 2)
	case 2:
		value := binary.LittleEndian.Uint32(b.buffer[b.cursor:])
		b.cursor += 4
		return int(value >> 2)
	case 3:
		var val big.Int
		for i := 0; i < 8; i++ {
			val.Or(&val, new(big.Int).Lsh(
				new(big.Int).SetUint64(uint64(b.buffer[b.cursor])),
				uint(8*i),
			))
			b.cursor++
		}
		val.Rsh(&val, 2)
		return int(val.Int64()) // Büyük sayıyı int'e dönüştür
	default:
		return 0
	}
}

func (b *Beve) readString() string {
	size := b.readCompressed()
	// Assuming you have a way to decode the string from the buffer
	str := string(b.buffer[b.cursor : b.cursor+size])
	b.cursor += size
	return str
}

// TODO Implement readValue function
func reshape[T int8 | int | int16 | int32 | int64 | uint8 | uint | uint16 | uint32 | uint64 | float32 | float64](data []T, rows, cols int) [][]T {
	// Varsayalım ki data, []float64 şeklinde bir dilim olarak geliyor

	if rows*cols != len(data) {
		panic("Invalid dimensions for matrix reshape")
	}

	result := make([][]T, rows)
	for i := range result {
		result[i] = make([]T, cols)
		copy(result[i], data[i*cols:(i+1)*cols])
	}
	return result
}

// TODO Implement readComplex function
func (b *Beve) readComplex() complex128 {
	real := b.readFloat64()
	imag := b.readFloat64()
	return complex(real, imag)
}

func (b *Beve) readValue() (interface{}, error) {
	header := b.buffer[b.cursor]
	b.cursor++
	config := []uint8{1, 2, 4, 8}
	typ := header & 0b00000111

	switch typ {
	case 0: // null or boolean
		isBool := (header & 0b00001000) >> 3
		if isBool > 0 {
			return (header&0b11110000)>>4 > 0, nil
		} else {
			return nil, nil
		}
	case 1: // number
		numType := (header & 0b00011000) >> 3
		isFloat := numType == 0
		isSigned := numType == 1
		byteCountIndex := (header & 0b11100000) >> 5
		byteCount := config[byteCountIndex]

		if isFloat {
			switch byteCount {
			case 4:
				return b.readFloat(), nil
			case 8:
				return b.readDouble(), nil
			}
		} else {

			if isSigned {
				switch byteCount {
				case 1:
					return b.readInt8(), nil
				case 2:
					return b.readInt16(), nil
				case 4:
					return b.readInt32(), nil
				case 8:
					return b.readInt64(), nil
				}
			} else {
				switch byteCount {
				case 1:
					return b.readUInt8(), nil
				case 2:
					return b.readUInt16(), nil
				case 4:
					return b.readUInt32(), nil
				case 8:
					return b.readUInt64(), nil
				}
			}
		}
	case 2: // string
		size := b.readCompressed()
		// Assuming you have a way to decode the string from the buffer
		str := string(b.buffer[b.cursor : b.cursor+size])
		b.cursor += size
		return str, nil

	case 3: // object
		keyType := (header & 0b00011000) >> 3
		isString := keyType == 0
		// isSigned := keyType == 1  // Kullanılmayan değişken, kaldırıldı
		// byteCountIndex := (header & 0b11100000) >> 5
		// byteCount := config[byteCountIndex]
		N := b.readCompressed()

		// objectData'yı Go'da map[string]interface{} olarak temsil edelim
		objectData := make(map[string]interface{})

		for i := 0; i < N; i++ {
			if isString {
				size := b.readCompressed()
				key := string(b.buffer[b.cursor : b.cursor+size])
				b.cursor += size
				value, err := b.readValue()
				if err != nil {
					return nil, err // Hata durumunu işleyin
				}
				objectData[key] = value
			} else {
				return nil, errors.New("TODO: support integer keys") // Hata fırlatın
			}
		}
		return objectData, nil

	case 4: // typed array
		numType := (header & 0b00011000) >> 3
		isFloat := numType == 0
		isSigned := numType == 1
		byteCountIndexArray := (header & 0b11100000) >> 5
		byteCountArray := config[byteCountIndexArray]

		if numType == 3 {
			isString := (header & 0b00100000) >> 5
			if isString != 0 { // ">" ile kontrol edebiliriz, "!= 0" ile aynı
				N := b.readCompressed()
				array := make([]string, N)
				for i := 0; i < N; i++ {
					size := b.readCompressed()
					// UTF-8 varsayımı ile stringe çevirme
					array[i] = string(b.buffer[b.cursor : b.cursor+size])
					b.cursor += size
				}
				return array, nil
			} else {
				return nil, errors.New("Boolean array support not implemented")
			}
		} else if isFloat {
			N := b.readCompressed()
			var array interface{}

			switch byteCountArray {
			case 4:
				array = make([]float32, N)
				for i := 0; i < N; i++ {
					array.([]float32)[i] = b.readFloat32()
				}
			case 8:
				array = make([]float64, N)
				for i := 0; i < N; i++ {
					array.([]float64)[i] = b.readFloat64()
				}
			default:
				return nil, errors.New("Unsupported float size")
			}
			// array tip dönüşümü
			return array, nil
		} else {
			N := b.readCompressed()
			// array tip belirleme
			var array interface{}
			if isSigned {
				switch byteCountArray {
				case 1:
					array = make([]int8, N)
					for i := 0; i < N; i++ {
						array.([]int8)[i] = b.readInt8()
					}
				case 2:
					array = make([]int16, N)
					for i := 0; i < N; i++ {
						array.([]int16)[i] = b.readInt16()
					}
				case 4:
					array = make([]int32, N)
					for i := 0; i < N; i++ {
						array.([]int32)[i] = b.readInt32()
					}
				case 8:
					array = make([]*big.Int, N)
					for i := 0; i < N; i++ {
						array.([]*big.Int)[i] = b.readBigInt64()
					}
				default:
					return nil, errors.New("Unsupported signed integer size")
				}
			} else { // unsigned
				switch byteCountArray {
				case 1:
					array = make([]uint8, N)
					for i := 0; i < N; i++ {
						array.([]uint8)[i] = b.readUInt8()
					}
				case 2:
					array = make([]uint16, N)
					for i := 0; i < N; i++ {
						array.([]uint16)[i] = b.readUInt16()
					}
				case 4:
					array = make([]uint32, N)
					for i := 0; i < N; i++ {
						array.([]uint32)[i] = b.readUInt32()
					}
				case 8:
					array = make([]*big.Int, N)
					for i := 0; i < N; i++ {
						array.([]*big.Int)[i] = b.readBigUInt64()
					}
				default:
					return nil, errors.New("Unsupported unsigned integer size")
				}
			}
			return array, nil
		}

	case 5: // untyped array
		N := b.readCompressed()
		arr := make([]interface{}, N)
		for i := 0; i < N; i++ {
			val, err := b.readValue()
			if err != nil {
				return nil, err
			}
			arr[i] = val
		}
		return arr, nil

	case 6: // extensions
		extension := (header & 0b11111000) >> 3
		switch extension {
		case 1: // variants
			_ = b.readCompressed() // Skip variant tag
			return b.readValue()
		case 2: // matrices
			layout := b.buffer[b.cursor] & 0b00000001
			b.cursor++
			switch layout {
			case 0: // row major
				return nil, errors.New("Row major matrix layout not implemented")
			case 1: // column major
				extents, err := b.readValue()
				if err != nil {
					return nil, err
				}
				extentsSlice, ok := extents.([]interface{})
				if !ok || len(extentsSlice) != 2 {
					return nil, errors.New("Invalid extents for matrix")
				}
				rows, _ := extentsSlice[0].(int)
				cols, _ := extentsSlice[1].(int)

				matrixData, err := b.readValue()
				if err != nil {
					return nil, err
				}
				// reshape function implementation needed here
				switch matrixData.(type) {
				case []float64:
					return reshape[float64](matrixData.([]float64), rows, cols), nil
				case []int:
					return reshape[int](matrixData.([]int), rows, cols), nil
				case []int16:
					return reshape[int16](matrixData.([]int16), rows, cols), nil
				case []int32:
					return reshape[int32](matrixData.([]int32), rows, cols), nil
				case []int64:
					return reshape[int64](matrixData.([]int64), rows, cols), nil
				case []uint8:
					return reshape[uint8](matrixData.([]uint8), rows, cols), nil
				case []uint:
					return reshape[uint](matrixData.([]uint), rows, cols), nil
				case []uint16:
					return reshape[uint16](matrixData.([]uint16), rows, cols), nil
				case []uint32:
					return reshape[uint32](matrixData.([]uint32), rows, cols), nil
				case []uint64:
					return reshape[uint64](matrixData.([]uint64), rows, cols), nil
				case []float32:
					return reshape[float32](matrixData.([]float32), rows, cols), nil
				default:
					return nil, errors.New("Unsupported matrix data type")
				}
			default:
				return nil, errors.New("Unsupported matrix layout")
			}
		case 3: // complex numbers
			return b.readComplex(), nil // readComplex function implementation needed here
		default:
			return nil, errors.New("Unsupported extension")
		}

	default:
		return nil, errors.New("Unsupported type")
	}

	return nil, errors.New("Shouldn't reach here")
}

// Writer struct
type Writer struct {
	buffer []byte
	offset int
}

func NewWriter(size int) *Writer {
	if size <= 0 {
		size = 256 // Default size
	}
	return &Writer{buffer: make([]byte, size), offset: 0}
}

func (w *Writer) ensureCapacity(size int) {
	if w.offset+size > len(w.buffer) {
		newBuffer := make([]byte, (len(w.buffer)+size)*2)
		copy(newBuffer, w.buffer)
		w.buffer = newBuffer
	}
}

// append uint8
func (w *Writer) appendUint8(value uint8) error {
	if value > 255 {
		return errors.New("Value must be an integer between 0 and 255")
	}
	w.ensureCapacity(1)
	w.buffer[w.offset] = value
	w.offset++
	return nil
}

// append uint16
func (w *Writer) appendUint16(value uint16) error {
	if value > 65535 {
		return errors.New("Value must be an integer between 0 and 65535")
	}
	w.ensureCapacity(2)
	binary.LittleEndian.PutUint16(w.buffer[w.offset:], value)
	w.offset += 2
	return nil
}

// append uint32
func (w *Writer) appendUint32(value uint32) error {
	if value > 4294967295 {
		return errors.New("Value must be an integer between 0 and 4294967295")
	}
	w.ensureCapacity(4)
	binary.LittleEndian.PutUint32(w.buffer[w.offset:], value)
	w.offset += 4
	return nil
}

// append uint64
func (w *Writer) appendUint64(value *big.Int) error {
	if value.Cmp(big.NewInt(0)) == -1 || value.Cmp(new(big.Int).Lsh(big.NewInt(1), 64)) == 1 {
		return errors.New("Value must be an integer between 0 and 18446744073709551615")
	}
	w.ensureCapacity(8)
	low := new(big.Int).And(value, big.NewInt(0xffffffff))
	high := new(big.Int).Rsh(value, 32)

	binary.LittleEndian.PutUint32(w.buffer[w.offset:], uint32(low.Uint64()))
	binary.LittleEndian.PutUint32(w.buffer[w.offset+4:], uint32(high.Uint64()))
	w.offset += 8
	return nil
}

// append
func (w *Writer) Append(value interface{}) error {
	switch v := value.(type) {
	case []interface{}:
		for _, element := range v {
			err := w.Append(element)
			if err != nil {
				return err
			}
		}
	case string:
		bytes := []byte(v)
		w.ensureCapacity(len(bytes))
		copy(w.buffer[w.offset:], bytes)
		w.offset += len(bytes)
	case int, int8, int16, int32:
		w.ensureCapacity(4)
		binary.LittleEndian.PutUint32(w.buffer[w.offset:], uint32(v.(int32)))
		w.offset += 4
	case float32, float64:
		w.ensureCapacity(8)
		binary.LittleEndian.PutUint64(w.buffer[w.offset:], math.Float64bits(v.(float64)))
		w.offset += 8
	default:
		return errors.New("Unsupported value type")
	}
	return nil
}

// writeBeve
func WriteBeve(data interface{}) ([]byte, error) {
	writer := NewWriter(0) // Use default size
	err := writeValue(writer, data)
	return writer.buffer[:writer.offset], err // Return the actual used part of the buffer
}

// writeValue
func writeValue(writer *Writer, value interface{}) error {
	switch v := value.(type) {
	case []float64:
		writer.appendUint8(0b01100000 | 4) // float64_t, 8 bytes
		writeCompressed(writer, len(v))
		for _, f := range v {
			writer.Append(f)
		}
	case []int:
		writer.appendUint8(0b01001000 | 4) // int32_t, 4 bytes
		writeCompressed(writer, len(v))
		for _, i := range v {
			writer.Append(i)
		}
	case bool:
		if v {
			writer.appendUint8(0b00011000)
		} else {
			writer.appendUint8(0b00001000)
		}
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		if v.(float64)-float64(int(v.(float64))) != 0 {
			writer.appendUint8(0b01100000)
		} else {
			writer.appendUint8(0b01001000)
		}
		writer.Append(v)
	case string:
		writer.appendUint8(2)
		writeCompressed(writer, len(v))
		writer.Append(v)
	case []interface{}:
		writer.appendUint8(5)
		writeCompressed(writer, len(v))
		for _, val := range v {
			writeValue(writer, val)
		}
	case map[string]interface{}:
		writer.appendUint8(3) // Assume string keys
		writeCompressed(writer, len(v))
		for key, val := range v {
			writeCompressed(writer, len(key))
			writer.Append(key)
			writeValue(writer, val)
		}
	default:
		return errors.New("Unsupported data type")
	}

	return nil
}

// writeCompressed
func writeCompressed(writer *Writer, N int) {
	if N < 64 {
		compressed := (N << 2) | 0
		writer.appendUint8(uint8(compressed))
	} else if N < 16384 {
		compressed := (N << 2) | 1
		writer.appendUint16(uint16(compressed))
	} else if N < 1073741824 {
		compressed := (N << 2) | 2
		writer.appendUint32(uint32(compressed))
	} else {
		compressed := (N << 2) | 3
		writer.appendUint64(big.NewInt(int64(compressed)))
	}
}

func ReadFromBuffer(buffer []byte) (interface{}, error) {
	beve := Beve{buffer: buffer, cursor: 0}
	return beve.readValue()
}

func WriteToBuffer(data interface{}) ([]byte, error) {
	writer := NewWriter(0)
	err := writeValue(writer, data)
	if err != nil {
		return nil, err
	}
	return writer.buffer[:writer.offset], nil
}

func ReadFromFile(filename string) (interface{}, error) {
	buffer, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	return ReadFromBuffer(buffer)
}

func WriteToFile(filename string, data interface{}) error {
	buffer, err := WriteToBuffer(data)
	if err != nil {
		return err
	}
	return os.WriteFile(filename, buffer, 0644)
}

// TODO toJSON,fromJSON

func main() {
	// ... initialize the buffer
	buffer := []byte{0x81, 0x35, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	beve := Beve{buffer: buffer, cursor: 0}
	value, err := beve.readValue()
	if err != nil {
		fmt.Println("Error reading value:", err)
		return
	}
	fmt.Println("Decoded value:", value)
}
