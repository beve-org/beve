# Crusher
*High performance, tagged binary data specification like JSON.*

- Maps directly to and from JSON
- Schema less, fully described, like JSON (can be used to store documents)
- Little endian for maximum performance on modern CPUs
- Efficiently packed, stores bit packed tags and values efficiently
- Future proof, supports large numerical types (such as 128 bit integers and higher)

> Crusher is much like CBOR or BSON, but is more space efficient in some cases, and is much faster on modern hardware.

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Furthermore, extending specifications and adding more fields is far easier with tagged messages and unordered mapping.

## Endianness

The endianness must be `little endian`.

## File Extension

The standard extension for crusher files should be `.crush`

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
0 -> null
1 -> boolean
2 -> number
3 -> string
4 -> object
5 -> typed array
6 -> untyped array
7 -> additional
```

## Booleans

The next bit of the HEADER indicates true or false.

```c++
0b0000'0'001 -> false
0b0000'1'001 -> true
```

## Numbers

The next two bits of the HEADER indicates whether the number is floating point, signed integer, or unsigned integer.

```c++
0 -> floating point
1 -> signed integer
2 -> unsigned integer
```

The next three bits of the HEADER are used as the BYTE COUNT.

Types conforming to [std::is_arithmetic](https://en.cppreference.com/w/cpp/types/is_arithmetic) are stored in the same manner as a `std::memcpy` call on the value.

See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
float -> 0b010'00'010 // 32bit
double -> 0b011'00'010 // 64bit
```

```c++
int8_t -> 0b000'01'010
int16_t -> 0b001'01'010
int32_t -> 0b010'01'010
int64_t -> 0b011'01'010
```

```c++
uint8_t -> 0b000'10'010
uint16_t -> 0b001'10'010
uint32_t -> 0b010'10'010
uint64_t -> 0b011'10'010
```

## Strings

The next two bits indicate the BYTE COUNT used for each character.

The transform must be `std::memcpy` compliant.

Layout: `HEADER | SIZE | data_bytes`

```c++
std::string -> 0b000'01'011
```

## Objects

The next two bits of the HEADER indicates the type of key.

```c++
0 -> string
1 -> signed integer
2 -> unsigned integer
```

The next three bits of the HEADER indicate the BYTE COUNT used for the integer type (integer keys) or the character type (string keys).

Layout: `HEADER | SIZE | key[0] | value[0] | ... key[N] | value[N]`

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

## Untyped Arrays

Untyped arrays expect elements to have headers.

Layout: `HEADER | SIZE | HEADER[0] | value[0] | ... HEADER[N] | value[N]`

## Additional

The next three bits denote various additional structures. These are all JSON compliant, meaning they can also be expressed in JSON.

```c++
0 -> type tag // for variant like structures
1 -> data delimiter // for specs like Newline Delimited JSON
```

### Type Tag (0)

Expects a subsequent compressed unsigned integer to denote a type tag.

Layout : `HEADER | SIZE (i.e. tag) | value`

### Data Delimiter

Expects additional data after the delimiter. Used to separate chunks of data to match a specifications like NDJSON and allow parallel thread reading.

> IMPORTANT: The rest of the bits in the HEADER for Additional data are not guaranteed to be zero (in order to allow the specification to extend). Implementations must ignore these additional bits when checking this HEADER.

## Enums

Enumerations are passed in their integer form.
