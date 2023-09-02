# EVE - Efficient Versatile Encoding
*High performance, tagged binary data specification like JSON, MessagePack, etc.*

> IMPORTANT ARCHIVAL NOTE:
>
> This format is under active testing and development. It is not yet recommended for long term archival use. It will be locked for archival use after thorough testing and carefully tweaking the specification.

- Maps to and from JSON
- Schema less, fully described, like JSON (can be used to store documents)
- Little endian for maximum performance on modern CPUs
- Blazingly fast, designed for SIMD
- Efficiently packed, stores bit packed tags and values efficiently
- Future proof, supports large numerical types (such as 128 bit integers and higher)
- Supports matrices and complex numbers
- Simple spec, designed to be easy to integrate

> EVE is much like CBOR or BSON, but is often more space efficient, and is much faster on modern hardware.

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Furthermore, extending specifications and adding more fields is far easier with tagged messages and unordered mapping.

## Endianness

The endianness must be `little endian`.

## File Extension

The standard extension for EVE files is `.eve`

## Implementations

### C++

- [Glaze](https://github.com/stephenberry/glaze) (supports JSON and EVE through the same API)

### Matlab

- [load_eve.m](https://github.com/stephenberry/eve/blob/main/matlab/load_eve.m) (in this repository)
  - This code is not yet complete

## Right Most Bit Ordering

The right most bit is denoted as the first bit, or bit of index 0.

## Compressed Unsigned Integer

A compressed unsigned integer uses the first two bits to denote the number of bytes used to express an integer. The rest of the bits indicate the integer value.

> Wherever all caps `SIZE` is used in the specification, it refers to a size indicator that uses a compressed unsigned integer.

| #                   | Number of Bytes | Integer Value (N)                |
| ------------------- | --------------- | -------------------------------- |
| 0     `0b000000'00` | 1               | N < 64 `[2^6]`                   |
| 1     `0b000000'01` | 2               | N < 16384 `[2^14]`               |
| 2     `0b000000'10` | 4               | N < 1073741824 `[2^30]`          |
| 3     `0b000000'11` | 8               | N < 4611686018427387904 `[2^62]` |

## Byte Count Indicator

> Wherever all caps `BYTE COUNT` is used, it describes this count indicator.

| #    | Number of bytes |
| ---- | --------------- |
| 0    | 1               |
| 1    | 2               |
| 2    | 4               |
| 3    | 8               |
| 4    | 16              |
| 5    | 32              |
| 6    | 64              |
| 7    | 128             |

```c++
// In C++ you can compute the byte count via:
template <class T>
constexpr uint8_t byte_count = std::bit_width(sizeof(T)) - 1;
```

## Header

Every value begins with a byte header. Any unspecified bits must be set to zero.

> Wherever all caps `HEADER` is used, it describes this header.

The first three bits describe the type via the following numerical values:

```c++
0 -> null or boolean     0b00000'000
1 -> number              0b00000'001
2 -> small string        0b00000'010
3 -> string              0b00000'011
4 -> object              0b00000'100
5 -> typed array         0b00000'101
6 -> generic array       0b00000'110
7 -> extensions          0b00000'111
```

## 0 - Null

Null is simply `0`

## 0 - Boolean

The next bit is set if the value is a boolean (otherwise null).

The 5th bit is set to denote true or false.

```c++
false      0b000'01'000
true       0b000'11'000
```

## 1 - Number

The next two bits of the HEADER indicates whether the number is floating point, signed integer, or unsigned integer.

```c++
0 -> floating point      0b000'00'001
1 -> signed integer      0b000'01'001
2 -> unsigned integer    0b000'10'001
```

The next three bits of the HEADER are used as the BYTE COUNT.

> Numbers are stored in the same manner as a `std::memcpy` call on the value.
>
> See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
float         0b010'00'001 // 32bit
double        0b011'00'001 // 64bit
```

```c++
int8_t        0b000'01'001
int16_t       0b001'01'001
int32_t       0b010'01'001
int64_t       0b011'01'001
```

```c++
uint8_t       0b000'10'001
uint16_t      0b001'10'001
uint32_t      0b010'10'001
uint64_t      0b011'10'001
```

## Strings

Strings in EVE must be encoded with UTF-8.

### 2 - Small String

If a string is less than 32 characters, the next five bits indicate the size of the string.

```c++
0bXXXXX'010 // a small string with size stored in XXXXX
```

Layout: `HEADER | data`

### 3 - String

If the string is 32 or more characters then a SIZE indicator is used after the header.

Layout: `HEADER | SIZE | data`

### Strings as Object Keys or Typed String Arrays

When strings are used as keys in objects or typed string arrays the HEADER is not included, because the HEADER information is provided by the object's HEADER.

Layout: `SIZE | data`

## 4 - Object

The next two bits of the HEADER indicates the type of key.

```c++
0 -> string
1 -> signed integer
2 -> unsigned integer
```

For integer keys the next three bits of the HEADER indicate the BYTE COUNT.

> Object keys must not contain a HEADER as the type of the key has already been defined.

Layout: `HEADER | SIZE | key[0] | HEADER[0] | value[0] | ... key[N] | HEADER[N] | value[N]`

## 5 - Typed Array

The next two bits indicate the type stored in the array:

```c++
0 -> floating point
1 -> signed integer
2 -> unsigned integer
3 -> boolean or string
```

For integral and floating point types, the next three bits of the type header are the BYTE COUNT.

For boolean or string types the next bit indicates whether the type is a boolean or a string

```c++
0 -> boolean // packed as single bits to the nearest byte
1 -> string // an array of strings, this does not denote an array of characters
```

Layout: `HEADER | SIZE | data`

### Boolean Arrays

Boolean arrays are stored using single bits for booleans and packed to the nearest byte.

### String Arrays

String arrays do not include the string HEADER for each element, because the information has already been supplied.

## 6 - Generic Array

Generic arrays expect elements to have headers.

Layout: `HEADER | SIZE | HEADER[0] | value[0] | ... HEADER[N] | value[N]`

# 7 - [Extensions](https://github.com/stephenberry/eve/blob/main/extensions.md)

See [extensions.md](https://github.com/stephenberry/eve/blob/main/extensions.md) for additional extension specifications. These are considered to be a formal part of the EVE specification, but are not expected to be as broadly implemented.
