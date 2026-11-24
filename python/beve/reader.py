"""Decoding BEVE into Python values and numpy arrays.

The whole message is read into one writable buffer, and every numeric typed array is returned as a numpy view of that
buffer: the data is not copied or converted element by element. The views keep the buffer alive.

Values map as follows:

- null, booleans, strings: `None`, `bool`, `str`
- numbers: `int` or `float` (bfloat16 and float16 widen to `float`; 128-bit integers are `int`)
- objects: `dict`, with `str` keys, or `int` keys for integer-keyed objects
- numeric typed arrays, aligned typed arrays: 1-D `numpy.ndarray` of the stored little-endian type. bfloat16 is widened
  to float32, a copy. 128-bit integer arrays, which numpy has no type for, are lists of `int`.
- boolean typed arrays: 1-D `numpy.ndarray` of `bool` (a copy, since they are stored as bits)
- string typed arrays and generic arrays: `list`
- matrices: `numpy.ndarray` whose leading dimensions are the matrix's extents, in its layout (row-major as C order,
  column-major as Fortran order)
- complex numbers: `complex`, or for integer parts a tuple `(re, im)` of `int`
- complex arrays: `complex64` or `complex128` arrays (half-precision parts are widened to `complex64`, a copy); integer
  complex arrays, which numpy has no type for, are integer arrays of shape (N, 2), real part first
- the deprecated type tag (Version 1): `{"index": <tag>, "value": <value>}`, its historical JSON form

128-bit floats and the data delimiter are not supported. They raise `BeveError`, as does a malformed message.
"""
import math
import os
import struct

import numpy as np

__all__ = ["BeveError", "load", "loads"]


class BeveError(ValueError):
    """A message that is malformed, truncated, or uses a feature this decoder does not support."""


FLOAT, SIGNED, UNSIGNED = 0, 1, 2
_NAMES = {FLOAT: "float", SIGNED: "signed integer", UNSIGNED: "unsigned integer"}
# dtype by (numerical type, BYTE COUNT index). Floating point index 0 is bfloat16, which numpy lacks: it is read as
# uint16 and widened to float32. 128-bit integers (index 4) are read as Python ints.
_DTYPES = {
    (FLOAT, 1): np.dtype("<f2"), (FLOAT, 2): np.dtype("<f4"), (FLOAT, 3): np.dtype("<f8"),
    (SIGNED, 0): np.dtype("i1"), (SIGNED, 1): np.dtype("<i2"), (SIGNED, 2): np.dtype("<i4"), (SIGNED, 3): np.dtype("<i8"),
    (UNSIGNED, 0): np.dtype("u1"), (UNSIGNED, 1): np.dtype("<u2"), (UNSIGNED, 2): np.dtype("<u4"), (UNSIGNED, 3): np.dtype("<u8"),
}
# struct formats of the same types, for single numbers
_FORMATS = {
    (FLOAT, 1): "<e", (FLOAT, 2): "<f", (FLOAT, 3): "<d",
    (SIGNED, 0): "<b", (SIGNED, 1): "<h", (SIGNED, 2): "<i", (SIGNED, 3): "<q",
    (UNSIGNED, 0): "<B", (UNSIGNED, 1): "<H", (UNSIGNED, 2): "<I", (UNSIGNED, 3): "<Q",
}
_BFLOAT16 = (FLOAT, 0)
_INT128 = 4
_COMPLEX = {np.dtype("<f4"): np.dtype("<c8"), np.dtype("<f8"): np.dtype("<c16")}
_COMPLEX_HEADER = 0b110 | (3 << 3)
_ALIGNED_HEADER = 0x5C


def load(path):
    """The value stored in the BEVE file at `path`."""
    with open(path, "rb") as f:
        buf = bytearray(os.fstat(f.fileno()).st_size)
        if f.readinto(buf) != len(buf):
            raise BeveError(f"{path} changed size while it was read")
    return _decode(buf)


def loads(data):
    """The value encoded in `data` (bytes, bytearray or memoryview). Arrays are views of `data` when it is a bytearray,
    and of a copy of it otherwise, so they are always writable. While any of them is alive, the bytearray cannot be
    resized."""
    return _decode(data if isinstance(data, bytearray) else bytearray(data))


def _decode(buf):
    r = _Reader(buf)
    try:
        value = r.value()
    except RecursionError:
        raise BeveError("the message is nested too deeply to decode") from None
    if r.pos != len(buf):
        raise BeveError(f"{len(buf) - r.pos} bytes of trailing data after the value at offset {r.pos}")
    return value


class _Reader:
    def __init__(self, buf):
        self.buf, self.pos = buf, 0

    # -- primitives -----------------------------------------------------------------------------------------------------

    def take(self, n):
        """Advance past `n` bytes, returning where they start."""
        if self.pos + n > len(self.buf):
            raise BeveError(f"message ends before the {n} bytes needed at offset {self.pos}")
        start = self.pos
        self.pos += n
        return start

    def byte(self):
        return self.buf[self.take(1)]

    def peek(self):
        if self.pos >= len(self.buf):
            raise BeveError(f"message ends before the header needed at offset {self.pos}")
        return self.buf[self.pos]

    def size(self):
        """A compressed unsigned integer: the low two bits give its width (1, 2, 4 or 8 bytes)."""
        width = 1 << (self.peek() & 0b11)
        start = self.take(width)
        return int.from_bytes(self.buf[start:start + width], "little") >> 2

    def string(self):
        n = self.size()
        start = self.take(n)
        try:
            return self.buf[start:start + n].decode("utf-8")
        except UnicodeDecodeError as e:
            raise BeveError(f"invalid UTF-8 in the string at offset {start}: {e}") from None

    def number_type(self, header, at, what):
        """(numerical type, BYTE COUNT index) from bits 3-7 of the header at offset `at`."""
        kind, index = (header >> 3) & 0b11, header >> 5
        if kind == 3:
            raise BeveError(f"{what} at offset {at} has numerical type 3, which is not a number")
        return kind, index

    def unsupported(self, kind, index, what):
        return BeveError(f"{what}: {8 << index}-bit {_NAMES[kind]} values are not supported")

    def scalar(self, kind, index, what):
        """One number as a Python `int` or `float`."""
        if (kind, index) == _BFLOAT16:
            start = self.take(2)
            return struct.unpack("<f", bytes(2) + self.buf[start:start + 2])[0]
        if kind != FLOAT and index == _INT128:
            start = self.take(16)
            return int.from_bytes(self.buf[start:start + 16], "little", signed=kind == SIGNED)
        fmt = _FORMATS.get((kind, index))
        if fmt is None:
            raise self.unsupported(kind, index, what)
        return struct.unpack_from(fmt, self.buf, self.take(struct.calcsize(fmt)))[0]

    def numbers(self, kind, index, count, what):
        """`count` numbers as a 1-D array: a view of the buffer, except bfloat16 (widened to float32) and 128-bit
        integers (a list of `int`)."""
        if (kind, index) == _BFLOAT16:
            bits = np.frombuffer(self.buf, "<u2", count, self.take(2 * count)).astype(np.uint32) << 16
            return bits.view(np.float32)
        if kind != FLOAT and index == _INT128:
            start = self.take(16 * count)
            return [int.from_bytes(self.buf[i:i + 16], "little", signed=kind == SIGNED) for i in range(start, start + 16 * count, 16)]
        dt = _DTYPES.get((kind, index))
        if dt is None:
            raise self.unsupported(kind, index, what)
        return np.frombuffer(self.buf, dt, count, self.take(dt.itemsize * count))

    # -- values ---------------------------------------------------------------------------------------------------------

    def value(self):
        at = self.pos
        header = self.byte()
        kind = header & 0b111
        if kind == 0:
            if header == 0:
                return None
            if header & 0b1000:
                return bool(header & 0b10000)
            raise BeveError(f"invalid null or boolean header {header:#010b} at offset {at}")
        if kind == 1:
            return self.scalar(*self.number_type(header, at, "number"), "number")
        if kind == 2:
            return self.string()
        if kind == 3:
            return self.object(header, at)
        if kind == 4:
            return self.typed_array(header, at)
        if kind == 5:
            return [self.value() for _ in range(self.size())]
        if kind == 6:
            return self.extension(header, at)
        raise BeveError(f"reserved type 7 in the header at offset {at}")

    def object(self, header, at):
        key_kind, index = (header >> 3) & 0b11, header >> 5
        if key_kind == 3:
            raise BeveError(f"object at offset {at} has key type 3, which is not defined")
        n = self.size()
        if key_kind == 0:
            return {self.string(): self.value() for _ in range(n)}
        return {self.scalar(key_kind, index, "object key"): self.value() for _ in range(n)}

    def typed_array(self, header, at):
        kind = (header >> 3) & 0b11
        if kind != 3:
            return self.numbers(kind, header >> 5, self.size(), "typed array")
        sub = header >> 5
        if sub == 0:  # booleans, packed LSB first
            n = self.size()
            packed = np.frombuffer(self.buf, np.uint8, (n + 7) // 8, self.take((n + 7) // 8))
            return np.unpackbits(packed, bitorder="little", count=n).astype(bool)
        if sub == 1:
            return [self.string() for _ in range(self.size())]
        if sub == 2:
            return self.aligned()[0]
        raise BeveError(f"unknown typed array sub-type {sub} at offset {at}")

    def aligned(self):
        """An aligned typed array whose header byte was read: (its elements, its numeric header)."""
        at = self.pos
        numeric = self.byte()
        if numeric & 0b111 != 0b100:
            raise BeveError(f"invalid aligned typed array numeric header {numeric:#010b} at offset {at}")
        kind, index = self.number_type(numeric, at, "aligned typed array")
        n = self.size()
        self.take(self.byte())  # padding
        return self.numbers(kind, index, n, "aligned typed array"), numeric

    def extension(self, header, at):
        ext = header >> 3
        if ext == 1:  # type tag, deprecated in Version 2: read for Version 1 data
            return {"index": self.size(), "value": self.value()}
        if ext == 2:
            return self.matrix(at)
        if ext == 3:
            return self.complex(at)
        if ext == 0:
            raise BeveError(f"data delimiter at offset {at}: delimited streams are not supported")
        raise BeveError(f"unknown extension {ext} at offset {at}")

    def matrix(self, at):
        layout = self.byte() & 1
        extents = self.value()
        if not isinstance(extents, np.ndarray) or extents.dtype.kind not in "iu":
            raise BeveError(f"the extents of the matrix at offset {at} must be a typed array of integers")
        shape = tuple(int(e) for e in extents)
        if not shape or min(shape) < 1:
            raise BeveError(f"the matrix at offset {at} has extents {shape}; each must be at least 1")
        header = self.peek()
        if header & 0b111 != 0b100 and header != _COMPLEX_HEADER:
            raise BeveError(f"the value of the matrix at offset {at} must be a typed array or a complex array")
        values = self.value()
        if not isinstance(values, np.ndarray):
            raise BeveError(f"the value of the matrix at offset {at} must hold numbers or booleans")
        if math.prod(shape) != len(values):
            raise BeveError(f"the matrix at offset {at} has extents {shape} but {len(values)} values")
        tail = values.shape[1:]  # (2,) for integer complex values
        if not layout:
            return values.reshape(shape + tail)
        # column-major: the first extent varies fastest
        m = values.reshape(shape[::-1] + tail)
        return m.transpose(tuple(reversed(range(len(shape)))) + tuple(range(len(shape), m.ndim)))

    def complex(self, at):
        header = self.byte()
        sub = header & 0b111
        kind, index = self.number_type(header, at + 1, "complex")
        if sub == 0:
            re, im = self.scalar(kind, index, "complex number"), self.scalar(kind, index, "complex number")
            return complex(re, im) if kind == FLOAT else (re, im)
        if sub == 1:
            parts = self.numbers(kind, index, 2 * self.size(), "complex array")
        elif sub == 2:
            if self.byte() != _ALIGNED_HEADER:
                raise BeveError(f"the aligned complex array at offset {at} must hold an aligned typed array")
            parts, numeric = self.aligned()
            if numeric & 0b11111000 != header & 0b11111000:
                raise BeveError(f"aligned complex array at offset {at}: the element type does not match the complex header")
            if len(parts) % 2:
                raise BeveError(f"aligned complex array at offset {at}: odd number of components")
        else:
            raise BeveError(f"unknown complex sub-type {sub} at offset {at}")
        if kind == FLOAT:
            dt = _COMPLEX.get(parts.dtype)
            return parts.view(dt) if dt is not None else parts.astype(np.float32).view(np.complex64)
        if isinstance(parts, list):  # 128-bit integer parts
            return [tuple(parts[i:i + 2]) for i in range(0, len(parts), 2)]
        return parts.reshape(-1, 2)
