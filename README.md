# Crusher
*High performance, tagged binary data specification like JSON.*

- Little endian for maximum performance on modern CPUs
- Maps directly to and from JSON
- Schema less, fully described, like JSON (can be used to store documents)
- Efficiently packed

Crusher is much like CBOR or BSON, but is more space efficient in some cases, and is much faster on modern hardware.

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

## Compressed Integer

A compressed integer uses the first two bits to denote the number of bytes used to express an integer.

```c++
// single byte header
struct compressed_int final {
  uint8_t config : 2;
  uint8_t size : 6;
};
//... 2, 4, and 8 byte headers follow the same layout
```

| `config` # | Number of bytes |
| ---------- | --------------- |
| 0          | 1               |
| 1          | 2               |
| 2          | 4               |
| 3          | 8               |

| Size or length (N)               | Number of bytes used |
| -------------------------------- | -------------------- |
| N < 64 `[2^6]`                   | 1                    |
| N < 16384 `[2^14]`               | 2                    |
| N < 1073741824 `[2^30]`          | 4                    |
| N < 4611686018427387904 `[2^62]` | 8                    |

## Byte Count Indicator

Only requires three bits, but may use more.

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

The first three bits describe the high level type via the following numerical values:

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

The next bit indicates true or false.

## Numbers

The next bit indicates whether the number is an integer or floating point value:

```c++
0 -> integer
1 -> floating point
```

The final four bits are used as a byte count indicator.

Types conforming to [std::is_arithmetic](https://en.cppreference.com/w/cpp/types/is_arithmetic) are stored in the same manner as a `std::memcpy` call on the value.

See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
int32_t x{};
std::memcpy(dest, &x, sizeof(int32_t));
```

## Strings

The final five bits indicate the number of bytes used for each character (using a byte count indicator).

Strings are arrays of bytes prefixed by a size header. The transform must be `std::memcpy` compliant.

Layout: `type_header | size | data_bytes`

## Objects

The next bit indicates the type of key.

```c++
0 -> integer keys
1 -> string keys
```

The next four bits indicate the number of bytes used for the integer type (integer keys) or the character type (string keys).

Layout: `type_header | size | key[0] | value[0] | ... key[N] | value[N]`

## Typed Arrays

The next two bits indicate the type stored in the array:

```c++
0 -> boolean
1 -> integer
2 -> floating point
3 -> string
```

The next three bits of the type header are the byte count indicator.

Layout: `type_header | size | data_bytes`

> Boolean arrays are stored using single bits for booleans.

## Untyped Arrays

The next five bits indicate are the byte count indicator.

Untyped arrays simply expect elements to have type information according to this specification.

Layout: `type_header | size | value[0] | ... value[N]`

## Type Tag

Uses a Compressed Integer to indicate a type.

## Enums

Enumerations are passed in their integer form.

## Untagged Objects With Known Keys

Crusher permits messages with known keys to be sent without tags under user defined circumstances. It is not generally recommended, but where message size is critical crusher implementations should allow object of known keys to eliminate the keys from the message. The receiver must be aware of this message change.
