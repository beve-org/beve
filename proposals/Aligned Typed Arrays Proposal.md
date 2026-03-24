# BEVE Proposal: Aligned Typed Arrays for Zero-Copy Access

**Status:** Working Draft

## Motivation

BEVE's typed arrays store contiguous numerical data (floats, integers, etc.) in a compact layout that is already close to the native in-memory representation. However, the current specification does not guarantee that the data payload of a typed array begins at a memory address that satisfies the alignment requirement of the element type. Without alignment, a decoder must copy the data into a suitably aligned buffer before it can be reinterpreted as a native span of `float`, `double`, `int32_t`, etc.

On modern hardware, unaligned access is either a performance penalty or an outright fault. By introducing optional alignment padding, a decoder that holds the entire BEVE message in a contiguous, aligned buffer can hand back a `std::span<T>` (or equivalent) that points directly into the message buffer — **zero copies, zero allocations**.

### Design Goals

1. **Zero-copy typed arrays** — typed array data can be reinterpreted in-place as `span<T>` where `T` is the element type.
2. **Self-describing padding** — the padding length is stored as a single byte, so decoders can skip padding without tracking byte offsets from the message origin.
3. **Contiguous memory requirement** — the entire BEVE message from its start up to and including any aligned typed array must reside in a single contiguous buffer.
4. **Composability** — any extension that embeds a typed array (matrices, complex numbers, timestamps) gains zero-copy support automatically.
5. **Simple decoding** — decoders do not need to track absolute byte offsets; all information needed to parse an aligned typed array is local to the header.

## Buffer Alignment Requirement

For zero-copy access, the memory buffer that holds the BEVE message **must** be aligned to at least the maximum alignment of any typed array element in the message. In practice, standard memory allocators on 64-bit systems return 16-byte aligned memory, which covers all standard types up to `int128_t` / `float128_t`.

If the buffer address is aligned to `A` and the data payload of a typed array begins at byte offset `O` where `O % alignof(T) == 0`, then the absolute address of the payload is aligned to `alignof(T)`.

## Aligned Typed Arrays — Built Into the Typed Array Tag

Rather than consuming an extension ID, aligned typed arrays are encoded as a new sub-type within the existing typed array category 3 (boolean/string). This approach means that any BEVE extension that embeds a typed array — matrices, complex numbers, timestamps — gains zero-copy alignment support automatically, with no changes to those extensions.

### Background: Typed Array Category 3

In the current specification, typed array category 3 (bits 3–4 = `11`) uses bit 5 to distinguish between two sub-types:

```
0 -> boolean      0b00'0'11'100  →  0x1C
1 -> string       0b00'1'11'100  →  0x3C
```

Bits 6–7 are unused and must be zero. This proposal defines a third sub-type.

### Sub-Type 2: Aligned Numeric Array

When bits 5–7 of a typed array header encode the value `2` (bit 6 set, bits 5 and 7 clear), the typed array is an **aligned numeric array**:

```
2 -> aligned      0b010'11'100  →  0x5C
```

The next byte is a **numeric typed array header** — identical to a standard BEVE typed array header for a numeric type. This second header byte encodes the element category (floating point, signed integer, or unsigned integer) and the byte count, using the same bit layout as a normal typed array header byte. The decoder already knows how to parse this; it simply reads it from the second byte instead of the first.

### Layout

```
TYPED_ARRAY_HEADER(aligned) | NUMERIC_HEADER | SIZE | PADDING_LENGTH | PADDING | DATA
```

Where:

- `TYPED_ARRAY_HEADER(aligned)` — 1 byte (`0x5C`), a typed array header with category 3, sub-type 2, indicating an aligned numeric array.
- `NUMERIC_HEADER` — 1 byte, a standard typed array header encoding the element category (bits 3–4: 0=float, 1=signed, 2=unsigned) and byte count (bits 5–7). Bits 0–2 **must** be `0b100` (the typed array type tag); decoders **must** reject the message if they are not. This is the same byte you would write for a non-aligned typed array of the same element type.
- `SIZE` — a compressed unsigned integer giving the number of elements (same semantics as standard typed arrays).
- `PADDING_LENGTH` — 1 byte, the number of padding bytes that follow. Valid range is 0 to `alignment - 1`. Decoders **must** validate that `PADDING_LENGTH` does not extend past the end of the message buffer.
- `PADDING` — 0 to `(alignment - 1)` bytes, as indicated by `PADDING_LENGTH`. The contents of padding bytes are unspecified; decoders **must** ignore them.
- `DATA` — the raw element data, identical to a standard typed array payload.

### Alignment Calculation

The encoder computes the padding length as follows:

Given:

- `offset_after_padding_length` — the byte offset (from byte 0 of the message buffer) of the first byte after the `PADDING_LENGTH` field.
- `alignment` — the natural alignment of the element type in bytes (equal to the element size for all standard numeric types).

The number of padding bytes is:

```
padding = (alignment - (offset_after_padding_length % alignment)) % alignment
```

The encoder writes this value into `PADDING_LENGTH` and then inserts exactly that many padding bytes. The decoder simply reads `PADDING_LENGTH` and skips that many bytes — it does not need to recompute the value.

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

1. **Upon encountering a typed array with category 3, sub-type 2 (aligned):**
   a. Read the `NUMERIC_HEADER` byte to determine element type and size.
   b. Read the `SIZE` compressed unsigned integer to get the element count.
   c. Read the `PADDING_LENGTH` byte.
   d. Validate that `PADDING_LENGTH` bytes remain in the buffer.
   e. Skip `PADDING_LENGTH` bytes.
   f. The next `element_count * element_size` bytes are the data payload, **already aligned**. Return a pointer/span directly into the buffer.

Note: The decoder does not need to track absolute byte offsets from the message origin. All information needed to parse the aligned typed array is contained in its header fields.

## Encoding Procedure

1. **When encoding a typed array that should be aligned:**
   a. Write the `TYPED_ARRAY_HEADER(aligned)` byte (`0x5C`).
   b. Write the `NUMERIC_HEADER` byte (same as a standard numeric typed array header).
   c. Write the `SIZE` compressed unsigned integer.
   d. Compute `padding = (alignment - ((current_offset + 1) % alignment)) % alignment`, where `current_offset` is the byte offset of the `PADDING_LENGTH` field and `+1` accounts for the `PADDING_LENGTH` byte itself.
   e. Write `padding` as the `PADDING_LENGTH` byte.
   f. Write `padding` bytes (contents are unspecified; zero is conventional).
   g. Write the raw element data.

## Worked Example

Consider encoding a message containing a single aligned `float64_t` typed array with 3 elements: `[1.0, 2.0, 3.0]`, without a framing header.

```
Offset  Bytes             Description
------  -----             -----------
0       5C                TYPED_ARRAY_HEADER: aligned typed array
                          (0b010'11'100: category=3, sub-type=2=aligned)
1       64                NUMERIC_HEADER: float64 typed array
                          (0b011'00'100: byte_count=3→8 bytes, float, typed array)
2       0C                SIZE: 3 elements (3 << 2 | 0 = 0x0C, 1-byte compressed uint)
3       04                PADDING_LENGTH: 4 bytes
                          (alignment=8, offset_after_padding_length=4, padding=(8-4%8)%8=4)
4       xx xx xx xx       PADDING: 4 bytes (contents unspecified)
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

A message may contain multiple aligned typed arrays (for example, as values in an object). Each one computes its own padding independently based on its position in the message. The contiguous-memory requirement applies to the entire message.

Because the headers, sizes, and keys between typed arrays will vary in length, each aligned typed array may have a different amount of padding. This is expected and correct.

## Impact on Message Size

An aligned typed array uses two extra bytes compared to a standard typed array (the additional `NUMERIC_HEADER` byte and the `PADDING_LENGTH` byte), plus at most `alignment - 1` bytes of padding. For typical payloads containing large arrays, this overhead is negligible. For messages with many small aligned arrays, the overhead could be more significant. Implementations should consider using standard (unaligned) typed arrays for small arrays where the copy cost is trivial.

As a guideline: the copy cost of re-aligning `N` bytes is roughly proportional to `N`, while the padding overhead is bounded by a constant. For arrays larger than a few cache lines (e.g., >64 bytes of data), alignment padding is almost always worthwhile.

## Backward Compatibility

- Decoders that predate this proposal will encounter typed array category 3 with sub-type 2 in bits 5–7. Decoders that validate the sub-type range will reject the message cleanly. Decoders that only check bit 5 (boolean vs string) may misinterpret the header — this is consistent with how any new sub-type or extension interacts with older parsers that do not validate reserved bits. Implementations are encouraged to validate the full sub-type range for category 3 typed arrays.

## Security Considerations

- The `PADDING_LENGTH` byte is a length field subject to the same validation as any other length in the format (e.g., `SIZE`, string lengths). Decoders **must** validate that `PADDING_LENGTH` does not extend beyond the message buffer. No additional validation beyond standard bounds checking is required — a corrupted padding length poses the same class of risk as a corrupted element count.
- Padding bytes are unspecified and **must** be ignored by decoders.

## Summary

This proposal adds zero-copy typed array support to BEVE through a new sub-type within the existing typed array tag:

**Aligned Typed Array** (typed array category 3, sub-type 2): uses a second header byte to encode the numeric element type, followed by the element count, a padding length byte, padding, and the data payload. Because alignment lives within the typed array tag itself, every extension that embeds a typed array — matrices, complex numbers, timestamps — gains zero-copy support automatically with no modifications.

The explicit padding length byte means decoders do not need to track absolute byte offsets from the message origin — all information needed to parse the array is local to its header. This simplifies decoder implementation while maintaining zero-copy access for large numerical arrays.
