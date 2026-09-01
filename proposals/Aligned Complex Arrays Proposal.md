# BEVE Proposal: Aligned Complex Arrays

**Status:** Working Draft
**Targets:** BEVE Version 2

## Motivation

The [Aligned Typed Arrays proposal](adopted/Aligned%20Typed%20Arrays%20Proposal.md) gave BEVE zero-copy numeric payloads, and claimed that extensions embedding a typed array — matrices and complex numbers — would gain that support for free. That claim holds for matrices and does not hold for complex numbers.

A matrix is:

```
EXT(2) | MATRIX_HEADER | EXTENTS | VALUE
```

`VALUE` is a nested BEVE typed array, so it may be an aligned typed array with no changes to the extension.

A complex array is:

```
EXT(3) | COMPLEX_HEADER | SIZE | DATA
```

There is no `VALUE` slot. The `COMPLEX_HEADER` itself carries the numerical type and BYTE COUNT, `SIZE` belongs to the complex layout, and `DATA` is raw bytes beginning wherever the preceding headers happen to land. There is nowhere to nest an aligned typed array and nowhere to carry a `PADDING_LENGTH`, so a complex array's payload has no alignment guarantee at all.

This matters for the payload the extension exists to serve. Signal processing data — IQ samples, spectra, transfer functions — is the case that most wants both the complex type tag and a zero-copy payload, and today an encoder must give up one of them:

- Emit a complex array and accept a copy on decode.
- Emit an aligned typed array of `2N` reals, or a matrix with extents `[N, 2]` wrapping an aligned inner array, and lose the complex type tag. The message no longer says the data is complex, so a decoder cannot round-trip it back to a complex type without out-of-band knowledge.

Neither is acceptable for the format's stated scientific computing focus.

## Design Goals

1. **Zero-copy complex payloads** — a decoder holding the message in an aligned contiguous buffer can return a span of complex elements pointing directly into the buffer.
2. **Keep the type tag** — the message still says "complex", so it round-trips to a complex type and to the same JSON as an unaligned complex array.
3. **Reuse the aligned typed array** — no new padding mechanism; the existing aligned typed array carries the payload.
4. **Additive** — existing complex sub-types are untouched, and decoders that validate the sub-type range reject the new one cleanly.

## Design

The COMPLEX HEADER's first three bits currently define two sub-types; values 2–7 are unused. This proposal defines sub-type 2.

```c++
0 -> complex number
1 -> complex array
2 -> aligned complex array
```

### Layout

```
EXT(3) | COMPLEX_HEADER(aligned) | VALUE
```

- `COMPLEX_HEADER(aligned)` — 1 byte: sub-type `2` in bits 0–2, numerical type in bits 3–4, BYTE COUNT in bits 5–7, exactly as for the other complex sub-types.
- `VALUE` — an aligned typed array (typed array category 3, sub-type 2) holding the interleaved components.

Note that there is no `SIZE` field in the complex layout. The element count lives in the nested aligned typed array, which is a self-contained BEVE value.

### Requirements

- `VALUE` **must** be an aligned typed array. An unaligned typed array **must not** be used, since that would duplicate sub-type 1 with no benefit; decoders **must** reject it.
- The aligned typed array's `SIZE` is the **component** count, `2 * N` for `N` complex elements, and **must** be even. Decoders **must** reject an odd count.
- The aligned typed array's `NUMERIC_HEADER` **must** encode the same numerical type and BYTE COUNT as the `COMPLEX_HEADER`. Decoders **must** reject a message where the two disagree.

### Interleaving

Components are stored interleaved with the real part first:

```
re[0], im[0], re[1], im[1], ... re[N-1], im[N-1]
```

This is the existing complex array layout, and it is exactly the memory layout of `std::complex<T>`, NumPy `complex64`/`complex128`, and MATLAB's interleaved complex representation. Because `alignof(std::complex<T>) == alignof(T)`, aligning the component array to `alignof(T)` aligns the complex array as well, and the payload can be reinterpreted in place as an array of complex elements.

> The base specification described the complex array payload only as "pairs of numerical types". This proposal states the interleaving explicitly, since a decoder that reads the payload as planar (all reals, then all imaginaries) produces wrong values from a valid message.

### Worked Example

Two `complex128` values, `[1.0 + 2.0i, 3.0 + 4.0i]`, at the start of a message:

```
offset  byte  meaning
0       0x1E  HEADER: extension (type 6), extension id 3 (complex)
1       0x62  COMPLEX HEADER: sub-type 2 (aligned), float, byte count 8
2       0x5C  typed array header: category 3, sub-type 2 (aligned)
3       0x64  NUMERIC_HEADER: float64
4       0x10  SIZE: 4 components (2 complex elements)
5       0x02  PADDING_LENGTH: 2
6–7           padding
8–15          1.0  (re[0])
16–23         2.0  (im[0])
24–31         3.0  (re[1])
32–39         4.0  (im[1])
```

The payload begins at offset 8, a multiple of `alignof(double)`. If the buffer is 8-byte aligned, a decoder can return a `span<std::complex<double>>` of length 2 pointing at offset 8 with no copy.

Padding is computed by the nested aligned typed array exactly as that proposal specifies, from the offset of the first byte after its `PADDING_LENGTH` field: `(8 - (6 % 8)) % 8 == 2`. No new calculation is introduced — the two complex header bytes shift the payload by two relative to a bare aligned typed array, and the padding absorbs the difference.

## JSON Mapping

Unchanged from the existing complex array:

```json
[[1, 2], [3, 4]]
```

An aligned complex array and an unaligned one with the same values convert to identical JSON. Alignment is a storage property, not a semantic one.

## Alternatives Considered

**Wrap in a matrix with extents `[N, 2]`.** Works today with no spec change, but drops the complex tag: the message describes an `N × 2` real matrix, so a decoder cannot know to produce complex output. It also invites a layout ambiguity (row-major `[N, 2]` versus column-major `[2, N]`) that the complex tag does not have.

**Give the complex array an inner `VALUE` like matrices, allowing any typed array.** Cleaner in the abstract, but it would make sub-type 1 redundant while leaving it in the format, giving two encodings of the same unaligned data. Restricting the new sub-type to aligned payloads keeps exactly one way to encode each case.

**Add padding fields directly to the complex array layout.** Duplicates the aligned typed array's padding mechanism in a second place, and every future extension wanting alignment would duplicate it again.

## Backward Compatibility

- Sub-types 0 and 1 are unchanged. Existing messages and existing decoders are unaffected.
- Decoders that predate this proposal encounter complex sub-type 2 and reject it as an unsupported complex sub-type, the same clean failure as any other unknown sub-type.
- Encoders should continue to emit sub-type 1 for small arrays. As with aligned typed arrays, the overhead (four extra bytes plus up to `alignment - 1` bytes of padding) is only worth paying when the payload is large enough that a copy costs more.

## Security Considerations

No new length fields are introduced. The nested aligned typed array's `SIZE` and `PADDING_LENGTH` are validated as that proposal specifies. The added validation is structural and cheap: the nested value must be an aligned typed array, its element type must match the complex header, and its component count must be even.

Only the first of those is derivable before the nested `SIZE` is known, so a decoder that validates the other two after reading the payload will materialize a large mismatched array before rejecting it. Decoders that treat a declared `SIZE` as untrusted should compare the `NUMERIC_HEADER` against the `COMPLEX HEADER` as soon as both bytes are read, before allocating for the payload.

## Summary

Complex sub-type 2 makes the payload a nested aligned typed array of `2N` interleaved components, so an IQ payload can be both zero-copy and tagged as complex.
