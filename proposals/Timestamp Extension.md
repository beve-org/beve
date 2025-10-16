# BEVE Extension 4 — Time (timestamps)

*Working draft for BEVE v1.0*

A compact, SIMD-friendly encoding for **instants in time** that:

- round-trips cleanly to RFC 3339 / ISO-8601 (and IXDTF/RFC 9557) on the text side,
- avoids floating point (no drift),
- scales to attoseconds without requiring 128-bit math for “now,” and
- supports high-throughput typed arrays.

------

## 1. Goals & non-goals

**Goals**

- Exact representation of instants using **integer ticks**.
- **Two-integer split** for precision and range without bigints on the hot path.
- Single-value and **array** encodings with **one set of metadata** per array (epoch, unit, optional TZ).
- Straightforward JSON projections: human (strings) and lossless (object).

**Non-goals**

- Calendrical formatting (time zone databases, DST rules) inside the binary payload.
- Durations/intervals (could be independent extensions).

------

## 2. Placement in the BEVE header space

This is a BEVE **Extension** (`HEADER` top 3 bits = `6`).
Within the extension space, **id = 4** denotes *Time (timestamps)*.

> Existing ids: 0=data delimiter, 1=type tag, 2=matrices, 3=complex numbers.
> New: **4=time**.

All multi-byte integers in this extension are **little endian**.

------

## 3. TIME HEADER (1 byte)

```
bits 0..1  SHAPE
           0 = single timestamp
           1 = timestamp array
           2..3 = reserved

bits 2..4  UNIT (decimal powers around seconds)
           0 = ksec (10^3 s)
           1 = s
           2 = ms   (10^-3 s)
           3 = µs   (10^-6 s)
           4 = ns   (10^-9 s)
           5 = ps   (10^-12 s)
           6 = fs   (10^-15 s)
           7 = as   (10^-18 s)

bit 5      TZ_PRESENT
           0 = no TZ field follows
           1 = int16_t minutes east of UTC follows (fixed 2 bytes)

bits 6..7  EPOCH/SCALE
           0 = UNIX/POSIX (no leap seconds)
           1 = UTC scale  (permits leap seconds)
           2 = TAI
           3 = GPS
```

### 3.1 Timezone field (optional; fixed width)

If `TZ_PRESENT=1`, immediately write a **2-byte `int16_t`**: minutes east of UTC.

- Valid range to emit: **−1439..+1439** (encoders MUST enforce).
- Semantics: **presentation metadata only**; does **not** affect the instant encoded by the numeric fields.

------

## 4. Payload layouts

### 4.1 Single timestamp

```
EXT(4) | TIME_HEADER | [TZ:int16]? |
NUMBER (signed)   SECONDS_OFFSET |
NUMBER (unsigned) PRECISION
```

- `NUMBER` is a BEVE integer value (the usual number header chooses width: 1/2/4/8/16/32 bytes, etc.).

### 4.2 Timestamp array

```
EXT(4) | TIME_HEADER | [TZ:int16]? |
TYPED_ARRAY (signed int)   SECONDS_OFFSET[] |
TYPED_ARRAY (unsigned int) PRECISION[]
```

- Both typed arrays MUST have the **same SIZE** and are written **back-to-back**.
- Each typed array uses standard BEVE typed-array headers (the header selects signed/unsigned and byte-count).

------

## 5. Semantics

Let `unit` be the selected UNIT and `epoch` the selected EPOCH/SCALE.

### 5.1 General

- The pair `(SECONDS_OFFSET, PRECISION)` represents a single **instant**:
  - **For `unit = ksec (0)`**
    - `SECONDS_OFFSET` counts **kiloseconds** since `epoch`.
    - `PRECISION` counts **whole seconds** in `[0, 999]`.
    - Instant = `epoch + (SECONDS_OFFSET * 1000 + PRECISION) seconds`.
  - **For `unit = s (1)`**
    - `SECONDS_OFFSET` counts **seconds** since `epoch`.
    - `PRECISION` **MUST be 0**.
    - Instant = `epoch + SECONDS_OFFSET seconds`.
  - **For `unit ∈ {ms, µs, ns, ps, fs, as}` (2..7)**
    - `SECONDS_OFFSET` counts **whole seconds** since `epoch`.
    - `PRECISION` counts **sub-second ticks** with base:
      - ms → `[0, 10^3-1]`, µs → `[0, 10^6-1]`, ns → `[0, 10^9-1]`,
      - ps → `[0, 10^12-1]`, fs → `[0, 10^15-1]`, as → `[0, 10^18-1]`.
    - Instant = `epoch + SECONDS_OFFSET s + PRECISION * 10^(-3*(unit-1)) s`.

### 5.2 Width guidance (non-normative)

- `PRECISION` always fits in **≤60 bits** (attoseconds < 2^60).
- Around present day, `SECONDS_OFFSET` fits in **int64** for centuries.
- Arrays SHOULD choose the **narrowest** element width that fits.

### 5.3 Epoch specifics

- **UNIX**: POSIX seconds (no leap seconds).
- **UTC**: permits encoding of leap seconds; decoders that cannot model them MAY round-trip via the structured JSON form.
- **TAI/GPS**: continuous seconds; conversion to UTC/UNIX requires a leap-second table (out of scope for BEVE).

------

## 6. JSON / text projections

Implementations SHOULD support both projections.

### 6.1 Human-oriented (default): RFC 3339 strings

- Single: `"2025-10-16T12:34:56.123456789Z"`
- Array: `["2025-10-16T12:34:56Z", "..."]`
- Fractional digits match the **UNIT** (e.g., `ns` → up to 9 digits).
- If `TZ_PRESENT=1`, use that offset for printing (e.g., `-05:00`), while the **instant** remains absolute.

### 6.2 Lossless structured object

- **Single**

  ```
  {
    "epoch": "unix",                 // "unix" | "utc" | "tai" | "gps"
    "unit": "ps",                    // "ksec","s","ms","us","ns","ps","fs","as"
    "seconds": 1750000000,           // signed integer
    "precision": 123456789012,       // unsigned integer
    "offset_minutes": -300           // optional; omitted if TZ not present
  }
  ```

- **Array**

  ```
  {
    "epoch": "unix",
    "unit": "ns",
    "offset_minutes": 0,
    "seconds":   [1697463296, 1697466896],
    "precision": [        42,  987654321]
  }
  ```

### 6.3 IXDTF (RFC 9557) considerations

- Encoders **MAY** emit IXDTF (RFC 9557) strings when a time-zone identifier (tzid) is available in surrounding metadata, e.g. `2025-10-16T12:34:56-05:00[America/Chicago]`.
- Decoders **SHOULD** accept both RFC 3339 and IXDTF on input.
- On offset/tzid disagreement, preserve the **instant** defined by the numeric fields and **MAY** signal inconsistency to callers.

------

## 7. Validation rules

- `PRECISION` must be within the unit’s range (see §5.1); otherwise **invalid**.
- `unit=s` requires `PRECISION=0`; otherwise **invalid**.
- Array form requires `len(seconds) == len(precision)`; otherwise **invalid**.
- If `TZ_PRESENT=1` and `offset_minutes ∉ [-1439, +1439]`, decoders **MUST** treat TZ as absent (and MAY report an error).
- Encoders SHOULD use `TZ_PRESENT=0` for UTC (`+00:00`) unless preserving original local formatting is required.

------

## 8. Examples (informative)

### 8.1 Single, UNIX epoch, nanoseconds, UTC

- Meaning: `2025-10-16T12:34:56.000000789Z`

- Layout:

  ```
  EXT(4) | TH(shape=single, unit=ns, tz=0, epoch=unix) |
  NUMBER(int64) seconds=1697463296 |
  NUMBER(uint32) precision=789
  ```

### 8.2 Array, UNIX epoch, microseconds, TZ = −05:00

- Meaning: local offset preserved for printing; instants absolute.

- Layout:

  ```
  EXT(4) | TH(shape=array, unit=us, tz=1, epoch=unix) | int16(-300) |
  TYPED_ARRAY(int64)   seconds[ N ] |
  TYPED_ARRAY(uint32)  precision[ N ]
  ```

### 8.3 ksec example

- `unit = ksec`
- `seconds = 2` (→ 2000 s), `precision = 17` → instant = epoch + 2017 s.

------

## 9. Conformance requirements

**Writers MUST**

- set `TZ_PRESENT` consistently (include exactly two TZ bytes when 1),
- enforce precision ranges for the chosen `unit`,
- use signed integers for `seconds` and unsigned for `precision`,
- ensure array field lengths match.

**Readers MUST**

- validate ranges and lengths as above,
- treat TZ as **presentation only**,
- accept any legal BEVE integer widths for the numbers/typed-arrays.

**Readers SHOULD**

- choose the narrowest native integer types that can hold values losslessly,
- expose both RFC 3339/IXDTF strings and the structured form to callers.

------

## 10. Reference algorithms (non-normative)

### 10.1 Encode (single)

1. Choose `epoch`, `unit`, set `TZ_PRESENT` as needed.
2. If `unit = ksec`:
   - compute `k = floor(seconds_total / 1000)` and `p = seconds_total - k*1000`.
   - emit `seconds=k`, `precision=p`.
3. If `unit = s`:
   - emit `seconds=seconds_total`, `precision=0`.
4. If sub-second unit:
   - `seconds = floor(t)`; `precision = round((t - seconds) * base)` with `base ∈ {1e3, 1e6, …, 1e18}`; validate range.
5. Emit `EXT(4)`, `TIME_HEADER`, optional TZ, then the two integers.

### 10.2 Decode (single)

1. Read and validate `EXT(4)`, then `TIME_HEADER` and optional TZ.
2. Read `seconds`, `precision`.
3. Reconstruct instant using §5.1.
4. For text output, print with RFC 3339 (or IXDTF if tzid is available).

------

## 11. Interop with other BEVE features

- **Type Tag (1):** Wrap a timestamp when modeling `variant<time, …>`. The timestamp payload is unchanged.
- **Matrices (2):** Time grids (e.g., time × channel) can store the value as a *Timestamp Array* inside the matrix value.
- **Compression:** Timestamp arrays compress very well with LZ4/Zstd; metadata is minimal.

------

## 12. Compatibility & migration

- This extension is orthogonal to earlier “integer ticks” proposals. A transcoder can map:
  - old `(ticks, unit)` ⇄ new `(seconds, precision, unit)` mechanically.
- Unknown `UNIT`/`EPOCH` values: readers MUST surface a structured JSON object (do not drop data).

------

## 13. Security & robustness

- Treat external time-zone identifiers (if any, in surrounding data) as untrusted strings.
- Large arrays: validate sizes before allocation to avoid OOM.
- Conversions between epochs (UTC/TAI/GPS) require maintained tables; keep them up to date if you perform such conversions.

------

## 14. Summary

BEVE Time (Extension 4) encodes instants as:

- **`seconds` (signed) + `precision` (unsigned)**,
- with a **unit ladder** from **ksec** down to **attoseconds**,
- an optional fixed-width **`int16` TZ minutes** for presentation,
- support for **single values** and **SIMD-friendly arrays**,
- and clean mapping to **RFC 3339 / IXDTF** strings or a **lossless JSON** object.

This meets scientific/telemetry needs for speed and precision while keeping interop with everyday JSON tooling straightforward.
