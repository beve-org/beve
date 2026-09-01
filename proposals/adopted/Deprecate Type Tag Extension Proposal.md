# BEVE Proposal: Deprecate the Type Tag Extension (Variants as Objects)

**Status:** Adopted
**Targets:** BEVE Version 2

## Motivation

BEVE is a schema-less, fully self-describing format. Like JSON, a BEVE message can be understood without any external type information: an object carries its keys, a number carries its width and signedness, a matrix carries its layout and extents, a complex number carries its numeric type. This property is what allows BEVE to map cleanly to and from JSON and to be used for standalone documents.

The **type tag** extension (Extension 1) is the one place the format departs from this principle.

```
HEADER(0x0E) | SIZE (i.e. type tag) | VALUE
```

The type tag is a **positional integer index** into an ordered list of alternative types. Unlike every other construct in BEVE, that index carries no self-contained meaning. A type tag of `3` is uninterpretable without the external schema that says "index 3 is `SomeType`". A decoder converting the message to JSON cannot do better than emit an opaque:

```json
{ "index": 3, "value": "the JSON value" }
```

This has three practical consequences:

1. **It is not self-describing.** The one property that defines BEVE is lost precisely where a discriminated union most needs to be understood.
2. **It does not match how variants appear in JSON.** Real-world tagged unions use a named discriminator (`{"type":"circle","radius":5}`), not a positional index. The `{"index","value"}` mapping is an artifact of the binary encoding, not something a JSON producer would ever choose.
3. **It is brittle across schema evolution.** Reordering, inserting, or removing an alternative silently changes the meaning of every previously-encoded index.

Notably, the other extensions do **not** share this problem. Matrices (Extension 2) and complex numbers (Extension 3) are fully self-describing, so the argument below applies only to the type tag.

## Design Goals

1. **Restore self-description.** Variant-like structures should be as self-describing as any other BEVE value.
2. **Restore JSON equivalence.** The variant representation should map to and from JSON with no special-case rules.
3. **No new binary machinery.** Solve the problem by removing an encoding, not adding one.
4. **Do not impose a convention.** BEVE should not mandate a discriminator key or force a particular JSON shape, any more than JSON itself does. The choice belongs to the application and its schema.
5. **Smooth migration.** Existing BEVE Version 1 data containing type tags must remain readable.

## The Change

### Variants Are Ordinary Values

BEVE Version 2 introduces **no special encoding for variants**. A discriminated union is represented as an ordinary BEVE value, chosen by the application exactly as it would choose the JSON representation. In the common case this is a BEVE object whose members include a discriminator, but BEVE imposes no requirement on the shape.

Because the result is a plain object (or plain value), it requires no special decoder support: every BEVE reader already handles it, and it is self-describing to exactly the degree the application's own convention is. Variant semantics live at the application/schema layer, precisely as they do in JSON.

### Deprecate Extension 1

Extension 1 (type tag) is **deprecated** in BEVE Version 2.

- The extension ID `1` is **reserved**. It **must not** be reused for any future extension.
- Encoders targeting Version 2 **must not** emit the type tag extension.
- Decoders **should** continue to accept and decode the type tag extension when reading Version 1 data, to preserve backward compatibility. A decoder that does not require legacy support **may** reject it as an unknown/deprecated extension.

## Representing Variants in Practice (Informative)

This section is **non-normative**. BEVE does not mandate any of the following; it documents the conventions applications commonly use so that BEVE and JSON representations line up. Because BEVE objects map 1:1 to JSON objects, whatever convention an application already uses for JSON tagged unions works unchanged in BEVE.

The two widely-used shapes are:

**Internally tagged** — the discriminator is a member of the alternative's own object. Requires the alternative to serialize as an object.

```json
{ "type": "circle", "radius": 5 }
```

**Adjacently tagged** — the discriminator and payload are separate members. Works for any alternative type, including non-objects.

```json
{ "type": "circle", "value": { "radius": 5 } }
```

The discriminator **key** (`"type"`, `"tag"`, `"kind"`, ...) is chosen by the application. The discriminator **value** is best given as a **string** naming the alternative when the goal is a self-describing, interchange-friendly message; an integer discriminator works but reintroduces the schema dependence this proposal set out to remove, so it is discouraged for interchange.

Where a schema is available, an application may also deduce the active alternative **structurally** from the value itself, for example from the set of object keys present, or, in BEVE specifically, from the value's type header (BEVE distinguishes `int32` from `int64` from `float64` in-band, which JSON cannot). This is an application-level concern; BEVE neither requires nor precludes it.

## JSON Mapping

There is no special mapping. A variant encoded as an object maps to JSON as any object does, and back again. The Version 1 `{"index","value"}` mapping is removed along with the extension.

## Backward Compatibility

- **Forward direction is free.** A Version 2 variant is an ordinary BEVE value, so it is already valid Version 1 BEVE. A Version 1 decoder reads it with no error and no special handling.
- **Reverse direction is covered by the read rule.** The only construct a Version 2 decoder may encounter that a Version 1 producer emitted is the type tag extension itself; per the deprecation rule above, decoders should continue to read it.
- **No version signal is required for interop.** Because the Version 2 variant encoding is a strict subset of existing Version 1 value types, a producer need not advertise a version for a consumer to read its variants. Where explicit version negotiation is desired for other reasons, the [Framing Header](../Framing%20Header%20Proposal.md) extension (Extension 5, version byte) provides it; a Version 2 producer may set its `VERSION` byte to `2`.

## Migration

- **Producers:** replace type-tag output with the object (or value) the application uses for the corresponding JSON. No BEVE-specific encoding is needed.
- **Consumers:** retain the existing type-tag decode path so previously-serialized Version 1 data continues to load; route newly-produced data through the ordinary object path.

## Impact on Implementations

Implementations that today special-case variants in their BEVE reader/writer will move that logic to the same object path they already use for JSON tagged unions, unifying two mechanisms into one. Readers gain (or reuse) an ordinary object-parsing path for variants and keep a legacy branch for the deprecated extension. The reference C++ implementation, [Glaze](https://github.com/stephenberry/glaze), already provides the target behavior through its JSON variant support (a named discriminator plus per-alternative ids, with structural fallback).

## Summary

BEVE Version 2 deprecates the type tag extension (Extension 1) and represents variant-like structures as ordinary BEVE values, chosen by the application exactly as for JSON. This restores full self-description and JSON equivalence, adds no new binary machinery, and imposes no discriminator convention. Extension ID 1 is reserved and must not be reused; encoders must not emit it, while decoders should continue to read it for backward compatibility with Version 1 data.
