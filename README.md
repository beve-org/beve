# Crusher
*High performance, tagged binary data specification like JSON.*

- Maps directly to and from JSON
- Schema less, fully described, like JSON (can be used to store documents)
- Little endian for maximum performance on modern CPUs
- Efficiently packed, stores bit packed tags and values efficiently
- Future proof, supports large numerical types (such as 128 bit integers)

> Crusher is much like CBOR or BSON, but is more space efficient in some cases, and is much faster on modern hardware.

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Furthermore, extending specifications and adding more fields if far easier with tagged messages and unordered mapping.

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

## Type Header

The type of every value is defined within a single byte.

> Wherever all caps `HEADER` is used, it describes this single byte type header.

The first three bits describe the type via the following numerical values:

```c++
0 -> boolean
1 -> null
2 -> number
3 -> string
4 -> object
5 -> typed array
6 -> untyped array
7 -> type tag
```

## Booleans

The next bit of the HEADER indicates true or false.

## Numbers

The next bit of the HEADER indicates whether the number is an integer or floating point value:

```c++
0 -> integer
1 -> floating point
```

The final four bits of the HEADER are used as the BYTE COUNT.

| TYPE | integer or floating point |

Types conforming to [std::is_arithmetic](https://en.cppreference.com/w/cpp/types/is_arithmetic) are stored in the same manner as a `std::memcpy` call on the value.

See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
int32_t x{};
std::memcpy(destination, &x, sizeof(int32_t));
```

## Strings

The final five bits indicate the number of bytes used for each character (BYTE COUNT).

The transform must be `std::memcpy` compliant.

Layout: `HEADER | SIZE | data_bytes`

## Objects

The next bit of the HEADER indicates the type of key.

```c++
0 -> integer keys
1 -> string keys
```

The next four bits of the HEADER indicate the number of bytes used for the integer type (integer keys) or the character type (string keys).

Layout: `HEADER | SIZE | key[0] | value[0] | ... key[N] | value[N]`

## Typed Arrays

The next two bits indicate the type stored in the array:

```c++
0 -> boolean
1 -> integer
2 -> floating point
3 -> string
```

The next three bits of the type header are the BYTE COUNT.

Layout: `HEADER | SIZE | data_bytes`

> Boolean arrays are stored using single bits for booleans.

## Untyped Arrays

The next five bits indicate of the HEADER are the BYTE COUNT.

Untyped arrays expect elements to have type information.

Layout: `HEADER | SIZE | HEADER[0] | value[0] | ... HEADER[N] | value[N]`

## Type Tag

Uses a Compressed Integer to indicate a type.

## Enums

Enumerations are passed in their integer form.
