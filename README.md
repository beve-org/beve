# EVE - Efficient Versatile Encoding
*High performance, tagged binary data specification like JSON.*

- Maps directly to and from JSON
- Schema less, fully described, like JSON (can be used to store documents)
- Little endian for maximum performance on modern CPUs
- Efficiently packed, stores bit packed tags and values efficiently
- Future proof, supports large numerical types (such as 128 bit integers and higher)

> EVE is much like CBOR or BSON, but is often more space efficient, and is much faster on modern hardware.

> IMPORTANT ARCHIVAL NOTE:
>
> This format is under active testing and development. It is not yet recommended for long term archival use. It will be locked for archival use after thorough testing and carefully tweaking the specification.

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Furthermore, extending specifications and adding more fields is far easier with tagged messages and unordered mapping.

## Endianness

The endianness must be `little endian`.

## File Extension

The standard extension for EVE files is `.eve`

## Implementations

### C++

- [Glaze](https://github.com/stephenberry/glaze)

## Right Most Bit Ordering

The right most bit is denoted as the first bit, or bit of index 0.

## Compressed Unsigned Integer

A compressed unsigned integer uses the first two bits to denote the number of bytes used to express an integer. The rest of the bits indicate the integer value.

> Wherever all caps `SIZE` is used in the specification, it refers to a size indicator that uses a compressed unsigned integer.

| `config` # | Number of Bytes |
| ---------- | --------------- |
| 0          | 1               |
| 1          | 2               |
| 2          | 4               |
| 3          | 8               |

| Integer Value (N)                | Number of Bytes |
| -------------------------------- | --------------- |
| N < 64 `[2^6]`                   | 1               |
| N < 16384 `[2^14]`               | 2               |
| N < 1073741824 `[2^30]`          | 4               |
| N < 4611686018427387904 `[2^62]` | 8               |

## Byte Count Indicator

> Wherever all caps `BYTE COUNT` is used, it describes this count indicator.

Mathematically, this is log2(x)

| `config` # | Number of bytes |
| ---------- | --------------- |
| 0          | 1               |
| 1          | 2               |
| 2          | 4               |
| 3          | 8               |
| 4          | 16              |
| 5          | 32              |
| 6          | 64              |
| 7          | 128             |

```c++
// In C++ you can compute the byte count via:
template <class T>
constexpr uint8_t byte_count = std::bit_width(sizeof(T)) - 1;
```

## Header

The value begins with a byte header. Any unspecified bits must be set to zero.

> Wherever all caps `HEADER` is used, it describes this header.

The first three bits describe the type via the following numerical values:

```c++
0 -> null                0b00000'000
1 -> boolean             0b00000'001
2 -> number              0b00000'010
3 -> string              0b00000'011
4 -> object              0b00000'100
5 -> typed array         0b00000'101
6 -> generic array       0b00000'110
7 -> extensions          0b00000'111
```

## Null

Null is simply the value of `0`

## Booleans

The next bit of the HEADER indicates true or false.

```c++
0b0000'0'001 == false
0b0000'1'001 == true
```

## Numbers

The next two bits of the HEADER indicates whether the number is floating point, signed integer, or unsigned integer.

```c++
0 -> floating point      0b000'00'000
1 -> signed integer      0b000'01'000
2 -> unsigned integer    0b000'10'000
```

The next three bits of the HEADER are used as the BYTE COUNT.

Types conforming to [std::is_arithmetic](https://en.cppreference.com/w/cpp/types/is_arithmetic) are stored in the same manner as a `std::memcpy` call on the value.

See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
float -> 0b010'00'010 // 32bit
double -> 0b011'00'010 // 64bit
```

```c++
int8_t  -> 0b000'01'010
int16_t -> 0b001'01'010
int32_t -> 0b010'01'010
int64_t -> 0b011'01'010
```

```c++
uint8_t  -> 0b000'10'010
uint16_t -> 0b001'10'010
uint32_t -> 0b010'10'010
uint64_t -> 0b011'10'010
```

## Objects

The next two bits of the HEADER indicates the type of key.

```c++
0 -> string
1 -> signed integer
2 -> unsigned integer
```

The next three bits of the HEADER indicate the BYTE COUNT used for the integer type (integer keys) or the character type (string keys).

> Object keys must not contain a HEADER as the type of the key has already been defined.

Layout: `HEADER | SIZE | key[0] | HEADER[0] | value[0] | ... key[N] | HEADER[N] | value[N]`

## Typed Arrays

The next two bits indicate the type stored in the array:

```c++
0 -> floating point
1 -> signed integer
2 -> unsigned integer
3 -> boolean or string
```

For integral and floating point types, the next three bits of the type header are the BYTE COUNT.

```c++
0 -> boolean
1 -> string
```

For boolean or string types the next bit indicates whether the type is a boolean or a string. The last two bits are used as the BYTE COUNT for the character size of the string. Boolean arrays are stored using single bits for booleans and packed to the nearest byte.

Layout: `HEADER | SIZE | data_bytes`

## Generic Arrays

Generic arrays expect elements to have headers.

Layout: `HEADER | SIZE | HEADER[0] | value[0] | ... HEADER[N] | value[N]`

## Extensions

The next five bits denote various extensions. These extensions are not expected to be implemented in every parser/serializer, but they provide convenient binary storage for more specific use cases, such as variants, matrices, and complex numbers.

```c++
0 -> data delimiter // for specs like Newline Delimited JSON
1 -> type tag // for variant like structures
2 -> matrices
3 -> complex numbers
```

### 0 - Data Delimiter

Expects additional data after the delimiter. Used to separate chunks of data to match a specifications like NDJSON and allow parallel thread reading.

### 1 - Type Tag

Expects a subsequent compressed unsigned integer to denote a type tag.

Layout : `HEADER | SIZE (i.e. type tag) | value`

### 2 - Matrices

Matrices can be stored as object or array types. However, this tag provides a more compact mechanism to introspect matrices.

Matrices add a one byte MATRIX HEADER.

The first bit of the matrix header denotes the data layout of the matrix.

```c++
0 -> layout_right      0b00'000010 // row-major
1 -> layout_left       0b01'000010 // column-major
```

Layout: `HEADER | MATRIX HEADER | EXTENTS | HEADER | data`

EXTENTS are written out as a typed array of unsigned integers. Refer to the specification for typed arrays.

### 3 - Complex Numbers

An additional COMPLEX HEADER byte is used.

- Complex numbers are stored as pairs of numerical types.

The first three bits denote whether this is a single complex number or a complex array.

```c++
0 -> complex number
1 -> complex array
```

For a single complex number the layout is: `HEADER | COMPLEX HEADER | value`

For a complex array the layout is: `HEADER | COMPLEX HEADER | SIZE | data`

> Three bits are used to align the left bits with the layouts for numbers.

The next two bits denote the numerical type:

```c++
0 -> floating point      0b000'00'000
1 -> signed integer      0b000'01'000
2 -> unsigned integer    0b000'10'000
```

The next three bits are used as the BYTE COUNT.
