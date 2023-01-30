# Crusher
*High performance, tagged binary data specification*

The aim is extremely high transfer performance with excellent flexibility.

Crusher lightly extends the C++ data layout specification to enable extremely fast tagged binary messaging.

> Crusher works very much like JSON, allowing partial objects via tags and dynamically sized arrays.

## Why Tagged Messages?

*Flexibility and efficiency*

JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Furthermore, extending specifications and adding more fields if far easier with tagged messages and unordered mapping.

## Endianness

The default endianness is expected to be `little endian`. Implementors may support endian conversions or clearly communicate the use of big endian for specialized applications.

## File Extension

The standard extension for crusher files should be `.crush`

If big endian is used in a file then the extension standard is `.bcrush`

## Implementations

### C++

- [Glaze](https://github.com/stephenberry/glaze)

## Values

Types conforming to [std::is_arithmetic](https://en.cppreference.com/w/cpp/types/is_arithmetic) are considered values and are stored in the same manner as a `std::memcpy` call on the value.

See [Fixed width integer types](https://en.cppreference.com/w/cpp/types/integer) for integer specification.

```c++
int32_t x{};
std::memcpy(dest, &x, sizeof(int32_t));
```

## Size Header

Sizes, such as the length of a dynamic array, are compressed using the first two bits to denote the number of bytes expressing the size.

```c++
// single byte header
struct header8 final {
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

## Strings

Strings are arrays of bytes prefixed by a size header. The transform must be `std::memcpy` compliant.

Layout: `size_header | data_bytes`

## Objects

Specification (e.g. compile time) known keys are sent as 32bit hashes conforming to the [Murmur3](https://en.wikipedia.org/wiki/MurmurHash) algorithm. The seed must always be thirty-one (31) and collisions are invalid. It is up to the user to ensure that no two keys will generate the same hash.

Layout: `size_header | key0_hash | value0 | ... keyN_hash | valueN`

## Dynamic Objects (Maps)

Dynamic objects use string or integer keys. The key type is not denoted in the message and must be part of the message specification.

Layout: `size_header | key0 | value0 | ... keyN | valueN`

If keys are strings, then the keys follow the string specification, including a size header.

## Dynamic Arrays

Layout: `size_header | data_bytes`

## Fixed Size Arrays

Layout: `data_bytes`

> Fixed sized arrays (compile time known) must not include the size of the array. This is to improve the efficiency of array messages in contexts where the size is known. *This means that statically sized arrays and dynamically sized arrays cannot be intermixed across implementations.*

A message or API specification using Crusher must denote whether an array is dynamic or fixed size.

## Enums

Enumerations are passed in their integer form.

## Untagged Objects With Known Keys

Crusher permits messages with known keys to be sent without tags under user defined circumstances. It is not generally recommended, but where message size is critical crusher implementations should allow object of known keys to eliminate the keys from the message. The receiver must be aware of this message change.
