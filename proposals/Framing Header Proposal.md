# BEVE Proposal: Framing Header

**Status:** Working Draft

## Motivation

BEVE messages currently begin directly with the root value. While this is compact, it means there is no in-band mechanism to:

1. **Identify** a byte sequence as a BEVE message (format identification for files and network protocols).
2. **Version** the specification, allowing decoders to reject messages from unsupported future versions.

This proposal introduces a lightweight, optional framing header as a BEVE extension.

### Design Goals

1. **Format identification** — a BEVE message can be unambiguously identified by its leading bytes.
2. **Version negotiation** — decoders can detect and reject messages from unsupported specification versions.
3. **Minimal overhead** — the header is 2 bytes.
4. **Backward compatibility** — legacy decoders encounter a clean failure (unknown extension), not silent misinterpretation.

## Extension 5 — Framing Header

**Extension ID:** 5

### Layout

```
HEADER(ext=5) | VERSION (1 byte)
```

**Total: 2 bytes before the root VALUE.**

#### HEADER(ext=5)

A single byte using the standard BEVE extension encoding: type bits = `6` (`0b110`), extension ID = `5` (`0b00101`).

```
0b00101'110  →  0x2E
```

Because this is a valid BEVE extension header, there is no collision with any standard BEVE root value type. A legacy decoder encountering this byte will parse it as an extension and either handle it or report an unknown extension — it will never silently misinterpret the message.

A normal BEVE message begins with a data-carrying type (null/boolean, number, string, object, typed array, generic array). A framing extension at position zero is unambiguously a framing header, not a data value.

#### VERSION (1 byte)

A single incrementing version number for the BEVE specification. The initial value is `1` for BEVE 1.0. This allows decoders to reject messages from unsupported future versions.

### Uniqueness

A BEVE message **must** contain at most one framing header, and if present it **must** be the first byte of the message (byte offset 0). A decoder **must** reject a message that contains a framing header at any other position.

### Backward Compatibility

- Messages **without** the framing header are fully valid BEVE and decode as before.
- The framing header is always optional. A message may include a framing header even if it contains no other extensions or special features. Decoders **must** handle messages both with and without a framing header.
- Decoders that do not understand extension 5 will encounter an unknown extension ID at the root. Per standard extension handling, they should report this rather than silently misparse.
- The framing header is a valid BEVE extension byte, so it cannot be confused with any standard root value type.

## Summary

This proposal adds a 2-byte optional framing header (Extension 5) to BEVE: an extension header byte (`0x2E`) that unambiguously identifies a BEVE message, followed by a version byte. This is useful for files, network protocols, and any context where format identification or version negotiation is needed.
