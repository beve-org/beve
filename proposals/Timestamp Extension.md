# BEVE Extension 4 — Time (timestamps)

*Working draft for BEVE v1.0*

A simple timestamp encoding using **`uint64_t` nanoseconds** since the UNIX epoch.

Users who need alternative time scales, sub-nanosecond precision, or other specialized representations can encode them using existing BEVE primitives (typed arrays, strings, objects).

------

## 1. Placement in the BEVE header space

This is a BEVE **Extension** (`HEADER` top 3 bits = `6`).
Within the extension space, **id = 4** denotes *Time (timestamps)*.

> Existing ids: 0=data delimiter, 1=type tag, 2=matrices, 3=complex numbers.
> New: **4=time**.

All multi-byte integers in this extension are **little endian**.

------

## 2. TIME HEADER (1 byte)

```
bit 0      SHAPE
           0 = single timestamp
           1 = timestamp array

bits 1..7  reserved (MUST be 0; decoders MUST reject non-zero)
```

------

## 3. Payload layouts

### 3.1 Single timestamp (`SHAPE=0`)

```
EXT(4) | TIME_HEADER | uint64_t
```

- The `uint64_t` is 8 bytes, little-endian: **nanoseconds since 1970-01-01T00:00:00Z** (UNIX epoch, no leap seconds).

### 3.2 Timestamp array (`SHAPE=1`)

```
EXT(4) | TIME_HEADER | SIZE | uint64_t[]
```

- `SIZE` is a BEVE compressed unsigned integer encoding the element count.
- The payload is `SIZE × 8` bytes of contiguous little-endian `uint64_t` values.

------

## 4. Semantics

- Values represent **nanoseconds since the UNIX epoch** (1970-01-01T00:00:00Z), using POSIX time (no leap seconds).
- Range: `0` to `2^64 − 1` nanoseconds (~584 years, covering 1970–2554).
- A value of `0` represents exactly `1970-01-01T00:00:00.000000000Z`.

------

## 5. JSON / text projection

### 5.1 Human-oriented (default): RFC 3339 strings

- Single: `"2025-10-16T12:34:56.000000789Z"`
- Array: `["2025-10-16T12:34:56Z", "..."]`
- Trailing zero fractional digits MAY be omitted (e.g., `.123000000` → `.123`).
- The suffix is always `Z` (UTC).

### 5.2 Lossless structured object

- **Single**

  ```
  {
    "ns": 1760618096000000789
  }
  ```

- **Array**

  ```
  {
    "ns": [1760618096000000789, 1760618096987654321]
  }
  ```

------

## 6. Validation rules

- Decoders MUST reject TIME_HEADER bytes with non-zero reserved bits.
- Array form: the byte length of the payload MUST equal `SIZE × 8`.

------

## 7. Examples (informative)

### 7.1 Single timestamp

- Meaning: `2025-10-16T12:34:56.000000789Z`
- `ns = 1760618096000000789`

- Layout:

  ```
  EXT(4) | TIME_HEADER(shape=single) | uint64_t(1760618096000000789)
  ```

### 7.2 Timestamp array

- Layout:

  ```
  EXT(4) | TIME_HEADER(shape=array) | SIZE(3) |
  uint64_t[0] | uint64_t[1] | uint64_t[2]
  ```

------

## 8. Conformance requirements

**Writers MUST**

- set reserved bits to 0,
- write `uint64_t` values in little-endian byte order,
- write exactly `SIZE` elements in the array form.

**Readers MUST**

- reject TIME_HEADER bytes with non-zero reserved bits,
- validate that the payload length matches the expected size.

------

## 9. Security & robustness

- Large arrays: validate `SIZE` before allocation to avoid OOM.

------

## 10. Summary

BEVE Time (Extension 4) encodes instants as a **`uint64_t` of nanoseconds since the UNIX epoch** — one integer, no metadata, no configuration. Arrays are contiguous `uint64_t[]` blocks suitable for SIMD and bulk processing.

For use cases requiring different time scales (TAI, GPS), sub-nanosecond precision, timezone annotations, or pre-1970 timestamps, encode a domain-specific representation using standard BEVE primitives (objects, typed arrays, or strings).
