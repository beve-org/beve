# Crusher
*Tagged binary compression for C++*

C++ is a well defined ISO standard, so we can think of C++ as a data specification. The aim of Crusher is to lightly extend the C++ data layout specification to enable extremely fast tagged binary messaging.

**We want ultimate speed with ultimate flexibility!**

## Why tagged messages?

For flexibility and efficiency. JSON is ubiquitous because it is tagged (has keys), and therefore messages can be sent in part. A fixed binary message without tags means that we must always send the entire message. Also, when we want to add more fields, tagged messaged with unordered mapping make this really easy.

## What about endianness and platform differences?

Crusher is intended to be used in contexts where we know how C++ will encode on the given hardware. We intend to support endianness conversions, but in most cases we would prefer to use the endianness of the hardware in our given context in order to achieve maximum performance.

Much like software interfaces that require a level of binary compatibility, so does Crusher. But, it does so with simplicity in mind and is typically a non-issue.

# The Specification

See [Concepts](# Concepts) for definitions of types.

| Concept    | Transform   |      |
| ---------- | ----------- | ---- |
| Arithmetic | std::memcpy |      |
|            |             |      |
|            |             |      |

## Concepts

- Arithmetic: `std::is_arithmetic_v`
