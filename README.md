# EVE - Efficient Versatile Encoding
*High performance, tagged binary data specification like JSON, MessagePack, CBOR, etc. But, designed for higher performance and scientific computing.*

> IMPORTANT ARCHIVAL NOTE:
>
> This format is under active testing and development. It is not yet recommended for long term archival use. It will be locked for archival use after thorough testing and carefully tweaking the specification.
>
> See [Discussions](https://github.com/stephenberry/eve/discussions) for polls and active development on the specification.

- Maps to and from JSON
- Schema less, fully described, like JSON (can be used in documents)
- Little endian for maximum performance on modern CPUs
- Blazingly fast, designed for SIMD
- Future proof, supports large numerical types (such as 128 bit integers and higher)
- Designed for scientific computing, supports [brain floats](https://en.wikipedia.org/wiki/Bfloat16_floating-point_format), matrices, and complex numbers
- Simple, designed to be easy to integrate

> EVE is designed to be faster on modern hardware than CBOR, BSON, and MessagePack, but it is also more space efficient for typed arrays.

## Performance vs MessagePack

The following table lists the performance increase between EVE with [Glaze](https://github.com/stephenberry/glaze) versus other libraries and their binary formats. A benchmark of Glaze versus itself would yield 0% performance benefit.

| Test                                                         | Libraries (vs [Glaze](https://github.com/stephenberry/glaze)) | Read (% Faster) | Write (% Faster) |
| ------------------------------------------------------------ | ------------------------------------------------------------ | --------------- | ---------------- |
| [Test Object](https://github.com/stephenberry/json_performance) | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | 90%             | 1200%            |
| double array                                                 | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | 1300%           | 4900%            |
| float array                                                  | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | 2800%           | 8000%            |
| uint16_t array                                               | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | 7200%           | 16600%           |

[Performance test code](https://github.com/stephenberry/binary_performance)

The table below shows binary message size versus EVE. A positive value means the binary produced is larger than EVE.

| Test                                                         | Libraries (vs [Glaze](https://github.com/stephenberry/glaze)) | Message Size |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------ |
| [Test Object](https://github.com/stephenberry/json_performance) | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | -3.4%        |
| double array                                                 | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | +12%         |
| float array                                                  | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | +25%         |
| uint16_t array                                               | [msgpack-c](https://github.com/msgpack/msgpack-c) (c++)      | +50%         |

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. Furthermore, extending specifications and adding more fields is far easier with tagged messages and unordered mapping. Tags also make the format much more human friendly.

## Endianness

The endianness must be `little endian`.

## File Extension

The standard extension for EVE files is `.eve`

## Implementations

### C++

- [Glaze](https://github.com/stephenberry/glaze) (supports JSON and EVE through the same API)

### Matlab

- [load_eve.m](https://github.com/stephenberry/eve/blob/main/matlab/load_eve.m) (this repository)
  - Work in progress

### Python

- [load_eve.py](https://github.com/stephenberry/eve/blob/main/python/load_eve.py) (this repository)
  - Work in progress

## Right Most Bit Ordering

The right most bit is denoted as the first bit, or bit of index 0.

## Concerning Compression

Note that EVE is not a compression algorithm. It uses some bit packing to be more space efficient, but strings and numerical values see no compression. This means that EVE binary is very compressible, like JSON, and it is encouraged to use compression algorithms like [LZ4](https://lz4.org), [Zstandard](https://github.com/facebook/zstd), [Brotli](https://github.com/google/brotli), etc. where size is critical.

## Compressed Unsigned Integer

A compressed unsigned integer uses the first two bits to denote the number of bytes used to express an integer. The rest of the bits indicate the integer value.

> Wherever all caps `SIZE` is used in the specification, it refers to a size indicator that uses a compressed unsigned integer.

| #    | Number of Bytes | Integer Value (N)                |
| ---- | --------------- | -------------------------------- |
| 0    | 1               | N < 64 `[2^6]`                   |
| 1    | 2               | N < 16384 `[2^14]`               |
| 2    | 4               | N < 1073741824 `[2^30]`          |
| 3    | 8               | N < 4611686018427387904 `[2^62]` |

## Byte Count Indicator

> Wherever all caps `BYTE COUNT` is used, it describes this mapping.

```c++
#      Number of bytes
0      1
1      2
2      4
3      8
4      16
5      32
6      64
7      128
...
```

## Header

Every `VALUE` begins with a byte header. Any unspecified bits must be set to zero.

> Wherever all caps `HEADER` is used, it describes this header.

The first three bits denote types:

```c++
0 -> null or boolean                          0b00000'000
1 -> number                                   0b00000'001
2 -> string                                   0b00000'010
3 -> object                                   0b00000'011
4 -> typed array                              0b00000'100
5 -> generic array                            0b00000'101
6 -> extension                                0b00000'110
7 -> reserved                                 0b00000'111
```

## Nomenclature

Wherever `DATA` is used, it denotes bytes of data without a `HEADER`.

Wherever `VALUE` is used, it denotes a binary structure that begins with a `HEADER`.

## 0 - Null

Null is simply `0`

## 0 - Boolean

The next bit is set to indicate a boolean. The 5th bit is set to denote true or false.

```c++
false      0b000'01'000
true       0b000'11'000
```

## 1 - Number

The next two bits of the HEADER indicates whether the number is floating point, signed integer, or unsigned integer.

Float point types must conform to the IEEE-754 standard.

```c++
0 -> floating point      0b000'00'001
1 -> signed integer      0b000'01'001
2 -> unsigned integer    0b000'10'001
```

The next three bits of the HEADER are used as the BYTE COUNT.

> Note: brain floats use a byte count indicator of 1, even though they use 2 bytes per value. This is used because float8_t is not supported and not typically useful.

> See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
bfloat16_t    0b001'00'000 // brain float
float16_t     0b001'00'001
float32_t     0b010'00'001 // float
float64_t     0b011'00'001 // double
float128_t    0b100'00'001
```

```c++
int8_t        0b000'01'001
int16_t       0b001'01'001
int32_t       0b010'01'001
int64_t       0b011'01'001
int128_t      0b100'01'001
```

```c++
uint8_t       0b000'10'001
uint16_t      0b001'10'001
uint32_t      0b010'10'001
uint64_t      0b011'10'001
uint128_t     0b100'10'001
```

## 2 - Strings

Strings must be encoded with UTF-8.

Layout: `HEADER | SIZE | DATA`

### Strings as Object Keys or Typed String Arrays

When strings are used as keys in objects or typed string arrays the HEADER is not included.

Layout: `SIZE | DATA`

## 3 - Object

The next two bits of the HEADER indicates the type of key.

```c++
0 -> string
1 -> signed integer
2 -> unsigned integer
```

For integer keys the next three bits of the HEADER indicate the BYTE COUNT.

> An object `KEY` must not contain a HEADER as the type of the key has already been defined.

Layout: `HEADER | SIZE | KEY[0] | VALUE[0] | ... KEY[N] | VALUE[N]`

## 4 - Typed Array

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
1 -> string // an array of strings (not an array of characters)
```

Layout: `HEADER | SIZE | data`

### Boolean Arrays

Boolean arrays are stored using single bits for booleans and packed to the nearest byte.

### String Arrays

String arrays do not include the string HEADER for each element.

Layout: `HEADER | SIZE | string[0] | ... string[N]`

## 5 - Generic Array

Generic arrays expect elements to have headers.

Layout: `HEADER | SIZE | VALUE[0] | ... VALUE[N]`

## 6 - [Extensions](https://github.com/stephenberry/eve/blob/main/extensions.md)

See [extensions.md](https://github.com/stephenberry/eve/blob/main/extensions.md) for additional extension specifications. These are considered to be a formal part of the EVE specification, but are not expected to be as broadly implemented.
