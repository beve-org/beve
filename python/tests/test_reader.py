import json
import math
import struct
from pathlib import Path

import numpy as np
import pytest

import beve

EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


# -- building messages ---------------------------------------------------------------------------------------------------

def size(n):
    """A compressed unsigned integer."""
    for tag, width in ((0, 1), (1, 2), (2, 4), (3, 8)):
        if n < 1 << (8 * width - 2):
            return ((n << 2) | tag).to_bytes(width, "little")
    raise ValueError(n)


def text(s):
    b = s.encode()
    return size(len(b)) + b


def num_header(kind, index, base):
    return bytes([base | (kind << 3) | (index << 5)])


F32, F64, I8, I32, I64, U8, U16, U64 = (0, 2), (0, 3), (1, 0), (1, 2), (1, 3), (2, 0), (2, 1), (2, 3)
FMT = {F32: "<f", F64: "<d", I8: "<b", I32: "<i", I64: "<q", U8: "<B", U16: "<H", U64: "<Q"}


def number(t, x):
    return num_header(*t, 0b001) + struct.pack(FMT[t], x)


def typed(t, xs):
    return num_header(*t, 0b100) + size(len(xs)) + b"".join(struct.pack(FMT[t], x) for x in xs)


def obj(items):
    return bytes([0b011]) + size(len(items)) + b"".join(text(k) + v for k, v in items)


def generic(values):
    return bytes([0b101]) + size(len(values)) + b"".join(values)


def matrix(layout, extents, value):
    return bytes([0b110 | (2 << 3), layout]) + typed(U64, extents) + value


def aligned(t, xs, offset, alignment):
    """An aligned typed array whose header starts at byte `offset` of the message."""
    head = bytes([0x5C]) + num_header(*t, 0b100) + size(len(xs))
    pad = (alignment - (offset + len(head) + 1) % alignment) % alignment
    return head + bytes([pad]) + b"\xee" * pad + b"".join(struct.pack(FMT[t], x) for x in xs)


# -- scalars -------------------------------------------------------------------------------------------------------------

def test_null_and_booleans():
    assert beve.loads(b"\x00") is None
    assert beve.loads(bytes([0b00011000])) is True
    assert beve.loads(bytes([0b00001000])) is False


@pytest.mark.parametrize("t, x", [(F32, 1.5), (F64, -2.25), (I8, -7), (I32, -123456), (I64, -(2 ** 40)),
                                  (U8, 255), (U16, 65535), (U64, 2 ** 63 + 5)])
def test_numbers(t, x):
    v = beve.loads(number(t, x))
    assert v == x and type(v) is (float if t[0] == 0 else int)


def test_half_precision_numbers():
    assert beve.loads(num_header(0, 1, 0b001) + np.float16(0.375).tobytes()) == 0.375
    assert beve.loads(num_header(0, 0, 0b001) + (0x3FC0).to_bytes(2, "little")) == 1.5  # bfloat16


def test_128_bit_integers():
    assert beve.loads(num_header(1, 4, 0b001) + (-5).to_bytes(16, "little", signed=True)) == -5
    assert beve.loads(num_header(2, 4, 0b001) + (2 ** 100).to_bytes(16, "little")) == 2 ** 100


def test_128_bit_float_is_refused():
    with pytest.raises(beve.BeveError, match="128-bit float"):
        beve.loads(num_header(0, 4, 0b001) + bytes(16))


@pytest.mark.parametrize("s", ["", "hello", "naïve ✓", "x" * 70, "y" * 20000])
def test_strings_and_size_widths(s):
    assert beve.loads(bytes([0b010]) + text(s)) == s


def test_invalid_utf8():
    with pytest.raises(beve.BeveError, match="UTF-8"):
        beve.loads(bytes([0b010]) + size(1) + b"\xff")


# -- objects and arrays --------------------------------------------------------------------------------------------------

def test_object_with_string_keys():
    assert beve.loads(obj([("a", number(I32, 1)), ("b", bytes([0b010]) + text("x"))])) == {"a": 1, "b": "x"}


def test_object_with_integer_keys():
    signed = bytes([0b011 | (1 << 3) | (2 << 5)]) + size(2) + struct.pack("<i", -3) + b"\x00" + struct.pack("<i", 7) + number(F64, 2.5)
    assert beve.loads(signed) == {-3: None, 7: 2.5}
    unsigned = bytes([0b011 | (2 << 3)]) + size(1) + bytes([200]) + bytes([0b00011000])
    assert beve.loads(unsigned) == {200: True}


@pytest.mark.parametrize("t, xs, dtype", [(F32, [1.5, -2.0], "<f4"), (F64, [math.nan, 1e300], "<f8"), (I8, [-1, 2], "i1"),
                                          (I32, [3, -4], "<i4"), (U16, [0, 65535], "<u2"), (U64, [2 ** 64 - 1], "<u8")])
def test_typed_arrays(t, xs, dtype):
    a = beve.loads(typed(t, xs))
    assert isinstance(a, np.ndarray) and a.dtype == np.dtype(dtype)
    np.testing.assert_array_equal(a, np.array(xs, dtype=dtype))


def test_arrays_are_writable_views_of_the_buffer():
    buf = bytearray(typed(F64, [1.0, 2.0, 3.0]))
    a = beve.loads(buf)
    a[0] = 10.0
    assert a.flags.writeable and struct.unpack_from("<d", buf, 2)[0] == 10.0
    b = beve.loads(bytes(typed(F64, [1.0])))  # immutable input: arrays are views of a copy, still writable
    b[0] = 2.0


def test_half_precision_arrays():
    a = beve.loads(num_header(0, 1, 0b100) + size(2) + np.array([0.5, -1.0], "<f2").tobytes())
    assert a.dtype == np.float16 and a.tolist() == [0.5, -1.0]
    b = beve.loads(num_header(0, 0, 0b100) + size(2) + struct.pack("<HH", 0x3FC0, 0xC000))  # bfloat16
    assert b.dtype == np.float32 and b.tolist() == [1.5, -2.0]


def test_boolean_arrays():
    assert beve.loads(bytes([0b100 | (3 << 3)]) + size(3) + bytes([0b101])).tolist() == [True, False, True]
    nine = beve.loads(bytes([0b100 | (3 << 3)]) + size(9) + bytes([0b10000000, 0b1]))
    assert nine.dtype == bool and nine.tolist() == [False] * 7 + [True, True]


def test_string_arrays():
    assert beve.loads(bytes([0b100 | (3 << 3) | (1 << 5)]) + size(2) + text("a") + text("bc")) == ["a", "bc"]


@pytest.mark.parametrize("offset", [0, 1, 3, 6])
def test_aligned_typed_arrays(offset):
    prefix = bytes([0b101]) + size(offset + 1) + b"\x00" * offset  # generic array: `offset` nulls, then the aligned array
    msg = prefix + aligned(F64, [1.0, -2.0], len(prefix), 8)
    buf = bytearray(msg)
    *nulls, a = beve.loads(buf)
    assert nulls == [None] * offset and a.dtype == np.float64 and a.tolist() == [1.0, -2.0]
    base = np.frombuffer(buf, np.uint8).ctypes.data
    assert (a.ctypes.data - base) % 8 == 0  # the padding put the data on an 8-byte offset in the message


def test_generic_arrays_nest():
    assert beve.loads(generic([b"\x00", generic([number(U8, 1)]), bytes([0b010]) + text("s")])) == [None, [1], "s"]


# -- extensions ----------------------------------------------------------------------------------------------------------

def test_row_major_matrix():
    m = beve.loads(matrix(0, [2, 3], typed(F64, [0, 1, 2, 3, 4, 5])))
    np.testing.assert_array_equal(m, [[0, 1, 2], [3, 4, 5]])


def test_column_major_matrix():
    m = beve.loads(matrix(1, [2, 3], typed(F64, [0, 1, 2, 3, 4, 5])))
    np.testing.assert_array_equal(m, [[0, 2, 4], [1, 3, 5]])


def test_three_dimensional_matrix():
    m = beve.loads(matrix(0, [2, 2, 2], typed(I32, list(range(8)))))
    assert m.shape == (2, 2, 2) and m[1, 0, 1] == 5


def test_matrix_extents_must_match():
    with pytest.raises(beve.BeveError, match="extents"):
        beve.loads(matrix(0, [2, 2], typed(F64, [1, 2, 3])))


def test_complex_values():
    c = bytes([0b110 | (3 << 3)])
    assert beve.loads(c + num_header(0, 3, 0b000) + struct.pack("<dd", 1.0, -2.0)) == complex(1, -2)
    a = beve.loads(c + num_header(0, 2, 0b001) + size(2) + struct.pack("<ffff", 1, 0.5, 0.1, 2))
    assert a.dtype == np.complex64 and a.tolist() == [complex(1, 0.5), complex(np.float32(0.1), 2)]
    i = beve.loads(c + num_header(1, 2, 0b001) + size(2) + struct.pack("<iiii", -1, 5, 7, -9))
    assert i.shape == (2, 2) and i.tolist() == [[-1, 5], [7, -9]]


def test_aligned_complex_array():
    c = bytes([0b110 | (3 << 3)]) + num_header(0, 3, 0b010)
    a = beve.loads(c + aligned(F64, [1.0, 2.0, 3.0, 4.0], 2, 8))
    assert a.tolist() == [complex(1, 2), complex(3, 4)]
    with pytest.raises(beve.BeveError, match="does not match"):
        beve.loads(c + aligned(F32, [1.0, 2.0], 2, 4))


def test_legacy_type_tag():
    assert beve.loads(bytes([0b110 | (1 << 3)]) + size(2) + number(I32, 9)) == {"index": 2, "value": 9}


def test_matrix_of_an_aligned_typed_array():
    m = beve.loads(matrix(0, [2, 2], aligned(F64, [1.0, 2.0, 3.0, 4.0], 2 + 3 + 16, 8)))
    assert m.tolist() == [[1.0, 2.0], [3.0, 4.0]]


def test_column_major_three_dimensional_matrix():
    m = beve.loads(matrix(1, [2, 3, 4], typed(I32, list(range(24)))))
    expected = np.arange(24, dtype=np.int32).reshape((2, 3, 4), order="F")
    assert m.shape == (2, 3, 4) and np.array_equal(m, expected)


def complex_array(t, pairs):
    return bytes([0b110 | (3 << 3)]) + num_header(*t, 0b001) + size(len(pairs)) + b"".join(struct.pack("<" + FMT[t][1] * 2, *p) for p in pairs)


def test_complex_matrices():
    z = beve.loads(matrix(1, [2, 2], complex_array(F64, [(1, 1), (2, 2), (3, 3), (4, 4)])))
    assert z.dtype == np.complex128 and z.tolist() == [[1 + 1j, 3 + 3j], [2 + 2j, 4 + 4j]]
    i = beve.loads(matrix(0, [1, 2], complex_array(I32, [(1, -1), (2, -2)])))
    assert i.shape == (1, 2, 2) and i.tolist() == [[[1, -1], [2, -2]]]
    c = beve.loads(matrix(1, [2, 2], complex_array(I32, [(1, 0), (2, 0), (3, 0), (4, 0)])))
    assert c[:, :, 0].tolist() == [[1, 3], [2, 4]]


@pytest.mark.parametrize("extents", [[], [0, 2], [2 ** 32, 2 ** 32]])
def test_matrix_extents_are_checked(extents):
    with pytest.raises(beve.BeveError, match="extents"):
        beve.loads(matrix(0, extents, typed(F64, [])))


def test_matrix_value_must_be_numeric():
    with pytest.raises(beve.BeveError, match="typed array or a complex array"):
        beve.loads(matrix(0, [1], matrix(0, [1], typed(F64, [1.0]))))


def test_half_precision_complex_arrays():
    c = bytes([0b110 | (3 << 3)]) + num_header(0, 1, 0b001) + size(1) + np.array([0.5, -1.0], "<f2").tobytes()
    a = beve.loads(c)
    assert a.dtype == np.complex64 and a.tolist() == [0.5 - 1j]


def test_integer_complex_number_keeps_its_integers():
    c = bytes([0b110 | (3 << 3)]) + num_header(2, 3, 0b000) + struct.pack("<QQ", 2 ** 64 - 1, 3)
    assert beve.loads(c) == (2 ** 64 - 1, 3)


def test_odd_aligned_complex_array():
    c = bytes([0b110 | (3 << 3)]) + num_header(0, 3, 0b010)
    with pytest.raises(beve.BeveError, match="odd"):
        beve.loads(c + aligned(F64, [1.0, 2.0, 3.0], 2, 8))


def test_128_bit_integer_arrays_and_keys():
    arr = beve.loads(num_header(1, 4, 0b100) + size(2) + (-1).to_bytes(16, "little", signed=True) + (2 ** 100).to_bytes(16, "little"))
    assert arr == [-1, 2 ** 100]
    keys = bytes([0b011 | (2 << 3) | (4 << 5)]) + size(1) + (2 ** 70).to_bytes(16, "little") + b"\x00"
    assert beve.loads(keys) == {2 ** 70: None}


def test_eight_byte_size():
    assert beve.loads(bytes([0b010]) + ((3 << 2) | 3).to_bytes(8, "little") + b"abc") == "abc"


def test_deep_nesting_is_a_beve_error():
    with pytest.raises(beve.BeveError, match="nested too deeply"):
        beve.loads((bytes([0b101]) + size(1)) * 100000 + b"\x00")


# -- malformed messages --------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("msg, match", [
    (typed(F64, [1.0, 2.0])[:-1], "ends before"),
    (bytes([0b010]) + size(5) + b"ab", "ends before"),
    (b"", "ends before"),
    (b"\x00\x00", "trailing data"),
    (bytes([0b110]), "delimiter"),
    (bytes([0b111]), "reserved"),
    (bytes([0b110 | (9 << 3)]), "unknown extension"),
    (bytes([0b011 | (3 << 3)]) + size(0), "key type 3"),
    (bytes([0b100 | (3 << 3) | (5 << 5)]), "sub-type 5"),
])
def test_malformed(msg, match):
    with pytest.raises(beve.BeveError, match=match):
        beve.loads(msg)


# -- the repository's example files --------------------------------------------------------------------------------------

def as_json(v):
    """The JSON form of a decoded value, as the examples' .json files write it."""
    if isinstance(v, np.ndarray):
        if np.iscomplexobj(v):
            return [[float(x.real), float(x.imag)] for x in v]
        return v.tolist()
    if isinstance(v, complex):
        return [v.real, v.imag]
    if isinstance(v, dict):
        return {k: as_json(x) for k, x in v.items()}
    if isinstance(v, list):
        return [as_json(x) for x in v]
    return v


def close(a, b):
    if isinstance(a, dict):
        return isinstance(b, dict) and a.keys() == b.keys() and all(close(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(map(close, a, b))
    if isinstance(a, float) or isinstance(b, float):
        return math.isclose(a, b, rel_tol=1e-6)  # float32 values against their decimal JSON form
    return a == b


def test_examples_exist():
    assert sorted(EXAMPLES.glob("*.beve")), f"no example files in {EXAMPLES}"


@pytest.mark.parametrize("path", sorted(EXAMPLES.glob("*.beve")), ids=lambda p: p.stem)
def test_examples(path):
    expected = json.loads(path.with_suffix(".json").read_text())
    assert close(as_json(beve.load(path)), expected)
