# Crusher
*Tagged binary compression for C++*

C++ is a well defined ISO standard, so we use C++ as a data specification. Crusher aims to lightly extend the C++ data layout specification to enable extremely fast tagged binary messaging.

**The aim is for high speed with excellent flexibility.**

## Why tagged messages?

Flexibility and efficiency. JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that the entire message must always be sent. Also, extending specifications and adding more fields if much easier with tagged messages and unordered mapping.

## Endianness

The default endianness is expected to be `little endian`. Implementors may support endian conversions or clearly communicate the use of big endian for specific use cases.

## File Extension

The standard extension for crusher files is `.crush`

If big endian is used in a file then the extension standard is `.bcrush`

## Implementations

### C++

- [Glaze](https://github.com/stephenberry/glaze)

# The Specification

See [Concepts](# Concepts) for definitions of types.

| Concept    | Transform   |      |
| ---------- | ----------- | ---- |
| Arithmetic | std::memcpy |      |
|            |             |      |
|            |             |      |

## Concepts

- Arithmetic: `std::is_arithmetic_v`
