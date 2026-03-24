# BEVE Proposal: Aligned Typed Arrays for Zero-Copy Access

**Status:** Working Draft

## Motivation

BEVE's typed arrays store contiguous numerical data (floats, integers, etc.) in a compact layout that is already close to the native in-memory representation. However, the current specification does not guarantee that the data payload of a typed array begins at a memory address that satisfies the alignment requirement of the element type. Without alignment, a decoder must copy the data into a suitably aligned buffer before it can be reinterpreted as a native span of `float`, `double`, `int32_t`, etc.

On modern hardware, unaligned access is either a performance penalty or an outright fault. By introducing optional alignment padding, a decoder that holds the entire BEVE message in a contiguous, aligned buffer can hand back a `std::span<T>` (or equivalent) that points directly into the message buffer — **zero copies, zero allocations**.

### Design Goals

1. **Zero-copy typed arrays** — typed array data can be reinterpreted in-place as `span<T>` where `T` is the element type.
2. **Deterministic padding** — the padding length is computable from the element type and the current byte offset; it does not need to be stored explicitly.
3. **Contiguous memory requirement** — the entire BEVE message from its start up to and including any aligned typed array must reside in a single contiguous buffer.
4. **Composability** — any extension that embeds a typed array (matrices, complex numbers, timestamps) gains zero-copy support automatically.
5. **Backward compatibility** — standard BEVE decoders that predate this proposal will encounter a clean failure (unknown sub-type), not silent misinterpretation.

## Byte Offset Origin

**Byte 0 is the first byte of the message buffer.** All offset calculations for alignment padding are relative to this origin. If a framing header (Extension 5) is present, it occupies bytes 0–1 and the root value begins at byte offset 2. If no framing header is present, the root value begins at byte offset 0.

Both encoder and decoder inherently track their position from the start of the message buffer, so they always agree on byte offsets regardless of whether a framing header is present.

## Buffer Alignment Requirement

For zero-copy access, the memory buffer that holds the BEVE message **must** be aligned to at least the maximum alignment of any typed array element in the message. In practice, standard memory allocators on 64-bit systems return 16-byte aligned memory, which covers all standard types up to `int128_t` / `float128_t`.

If the buffer address is aligned to `A` and the data payload of a typed array begins at byte offset `O` where `O % alignof(T) == 0`, then the absolute address of the payload is aligned to `alignof(T)`.

## Aligned Typed Arrays — Built Into the Typed Array Tag

Rather than consuming an extension ID, aligned typed arrays are encoded as a new sub-type within the existing typed array category 3 (boolean/string). This approach means that any BEVE extension that embeds a typed array — matrices, complex numbers, timestamps — gains zero-copy alignment support automatically, with no changes to those extensions.

### Background: Typed Array Category 3

In the current specification, typed array category 3 (bits 3–4 = `11`) uses bit 5 to distinguish between two sub-types:

```
0 -> boolean      0b00'0'11'100
1 -> string       0b01'0'11'100
```

Bits 6–7 are unused and must be zero. This proposal defines a third sub-type.

### Sub-Type 2: Aligned Numeric Array

When bits 5–7 of a typed array header encode the value `2` (bit 6 set, bits 5 and 7 clear), the typed array is an **aligned numeric array**:

```
2 -> aligned      0b010'11'100  →  0x3C
```

The next byte is a **numeric typed array header** — identical to a standard BEVE typed array header for a numeric type. This second header byte encodes the element category (floating point, signed integer, or unsigned integer) and the byte count, using the same bit layout as a normal typed array header byte. The decoder already knows how to parse this; it simply reads it from the second byte instead of the first.

### Layout

```
TYPED_ARRAY_HEADER(aligned) | NUMERIC_HEADER | SIZE | PADDING | DATA
```

Where:

- `TYPED_ARRAY_HEADER(aligned)` — 1 byte (`0x3C`), a typed array header with category 3, sub-type 2, indicating an aligned numeric array.
- `NUMERIC_HEADER` — 1 byte, a standard typed array header encoding the element category (bits 3–4: 0=float, 1=signed, 2=unsigned) and byte count (bits 5–7). Bits 0–2 **must** be `0b100` (the typed array type tag); decoders **must** reject the message if they are not. This is the same byte you would write for a non-aligned typed array of the same element type.
- `SIZE` — a compressed unsigned integer giving the number of elements (same semantics as standard typed arrays).
- `PADDING` — 0 to `(alignment - 1)` bytes, inserted so that the first byte of `DATA` falls at a byte offset from the message origin that is a multiple of the element alignment. The contents of padding bytes are unspecified; decoders **must** ignore them.
- `DATA` — the raw element data, identical to a standard typed array payload.

### Alignment Calculation

Given:

- `offset_after_size` — the byte offset (from byte 0 of the message buffer) of the first byte after the `SIZE` field.
- `alignment` — the natural alignment of the element type in bytes (equal to the element size for all standard numeric types).

The number of padding bytes is:

```
padding = (alignment - (offset_after_size % alignment)) % alignment
```

This value is deterministic. The encoder inserts exactly this many bytes; the decoder computes the same value and skips them.

### Alignment Values by Element Type

| Element Type | Element Size | Required Alignment |
|---|---|---|
| `bfloat16_t` | 2 | 2 |
| `float16_t` | 2 | 2 |
| `float32_t` | 4 | 4 |
| `float64_t` | 8 | 8 |
| `float128_t` | 16 | 16 |
| `int8_t` / `uint8_t` | 1 | 1 (no padding needed) |
| `int16_t` / `uint16_t` | 2 | 2 |
| `int32_t` / `uint32_t` | 4 | 4 |
| `int64_t` / `uint64_t` | 8 | 8 |
| `int128_t` / `uint128_t` | 16 | 16 |

Note: 1-byte element types trivially satisfy alignment and never require padding. Implementations may use standard typed arrays for single-byte elements, as there is no alignment benefit.

### Restrictions

- The entire message from byte 0 through the end of the aligned typed array's `DATA` **must** reside in contiguous memory.
- The `NUMERIC_HEADER` **must** encode a numeric type (category 0, 1, or 2). Encoders **must not** write an aligned typed array with a boolean or string header. Decoders **must** reject such combinations. Boolean arrays are bit-packed and string arrays have variable-length elements, so alignment is not meaningful for these types.

## Decoding Procedure

1. **Begin at byte offset 0 of the message buffer.** If a framing header is present, decode it and advance the offset accordingly. Track the current byte offset throughout decoding.
2. **Decode the root VALUE normally**, tracking the current byte offset at each point.
3. **Upon encountering a typed array with category 3, sub-type 2 (aligned):**
   a. Read the `NUMERIC_HEADER` byte to determine element type and size.
   b. Read the `SIZE` compressed unsigned integer to get the element count.
   c. Record `offset_after_size` — the current byte offset.
   d. Compute `padding = (alignment - (offset_after_size % alignment)) % alignment`.
   e. Skip `padding` bytes.
   f. The next `element_count * element_size` bytes are the data payload, **already aligned**. Return a pointer/span directly into the buffer.

## Encoding Procedure

1. **Begin at byte offset 0 of the message buffer.** If writing a framing header, do so first and advance the offset accordingly. Track byte offsets throughout encoding.
2. **Encode the root VALUE normally**, tracking offsets.
3. **When encoding a typed array that should be aligned:**
   a. Write the `TYPED_ARRAY_HEADER(aligned)` byte (`0x3C`).
   b. Write the `NUMERIC_HEADER` byte (same as a standard numeric typed array header).
   c. Write the `SIZE` compressed unsigned integer.
   d. Compute `padding = (alignment - (current_offset % alignment)) % alignment`.
   e. Write `padding` bytes (contents are unspecified; zero is conventional).
   f. Write the raw element data.

## Worked Example

Consider encoding a message containing a single aligned `float64_t` typed array with 3 elements: `[1.0, 2.0, 3.0]`, without a framing header.

```
Offset  Bytes             Description
------  -----             -----------
0       3C                TYPED_ARRAY_HEADER: aligned typed array
                          (0b010'11'100: category=3, sub-type=2=aligned)
1       64                NUMERIC_HEADER: float64 typed array
                          (0b011'00'100: byte_count=3→8 bytes, float, typed array)
2       0C                SIZE: 3 elements (3 << 2 | 0 = 0x0C, 1-byte compressed uint)
3       xx xx xx xx xx    PADDING: 5 bytes (contents unspecified)
                          (alignment=8, offset_after_size=3, padding=(8-3%8)%8=5)
8       00 00 00 00       DATA[0]: 1.0 as float64 little-endian
        00 00 F0 3F
16      00 00 00 00       DATA[1]: 2.0 as float64 little-endian
        00 00 00 40
24      00 00 00 00       DATA[2]: 3.0 as float64 little-endian
        00 00 08 40
------
Total: 32 bytes
```

The data begins at offset 8, which is a multiple of 8 (`alignof(float64_t)`). If the buffer itself is 8-byte aligned, the decoder can return a `span<double>` pointing at buffer offset 8 with no copy.

## Composability with Existing Extensions

Because alignment is a property of the typed array itself, every extension that embeds a typed array benefits automatically.

### Matrices (Extension 2)

A matrix stores its data as a typed array. By using an aligned typed array as the inner `VALUE`, the matrix data payload is automatically aligned:

```
EXT(2) | MATRIX_HEADER | EXTENTS | ALIGNED_TYPED_ARRAY
```

No changes to the matrix extension are required.

### Complex Numbers (Extension 3)

Complex arrays store pairs of numerical values in a typed array. Using an aligned typed array as the inner data automatically aligns the complex data:

```
EXT(3) | COMPLEX_HEADER | SIZE | ALIGNED_TYPED_ARRAY_DATA
```

No changes to the complex number extension are required.

## Nested / Multiple Aligned Arrays

A message may contain multiple aligned typed arrays (for example, as values in an object). Each one computes its own padding independently based on its offset from byte 0. The contiguous-memory requirement applies to the entire message.

Because the headers, sizes, and keys between typed arrays will vary in length, each aligned typed array may have a different amount of padding. This is expected and correct.

## Impact on Message Size

An aligned typed array uses one extra byte compared to a standard typed array (the additional `NUMERIC_HEADER` byte), plus at most `alignment - 1` bytes of padding. For typical payloads containing large arrays, this overhead is negligible. For messages with many small aligned arrays, the overhead could be more significant. Implementations should consider using standard (unaligned) typed arrays for small arrays where the copy cost is trivial.

As a guideline: the copy cost of re-aligning `N` bytes is roughly proportional to `N`, while the padding overhead is bounded by a constant. For arrays larger than a few cache lines (e.g., >64 bytes of data), alignment padding is almost always worthwhile.

## Backward Compatibility

- Decoders that predate this proposal will encounter typed array category 3 with an unrecognized sub-type value of 2. This is a clean failure — the decoder knows it is dealing with a typed array but does not recognize the sub-type. This is no worse than an unknown extension ID, and arguably better since the context is preserved.

## Security Considerations

- Padding bytes are unspecified and **must** be ignored by decoders. Because zeros are valid data in a binary format, requiring zero-padding provides no security benefit and adds unnecessary verification cost in the decode path.
- Decoders **must** validate that the computed padding does not extend beyond the message buffer.

## Summary

This proposal adds zero-copy typed array support to BEVE through a new sub-type within the existing typed array tag:

**Aligned Typed Array** (typed array category 3, sub-type 2): uses a second header byte to encode the numeric element type, followed by the element count, deterministic padding, and the data payload. Because alignment lives within the typed array tag itself, every extension that embeds a typed array — matrices, complex numbers, timestamps — gains zero-copy support automatically with no modifications.

This allows decoders to return direct pointers into the message buffer as typed spans, eliminating copy and allocation overhead for large numerical arrays — a critical optimization for scientific computing, real-time data processing, and high-throughput serialization pipelines.
