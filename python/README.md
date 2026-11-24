# beve (Python)

A decoder for [BEVE](../README.md) that returns numeric arrays as numpy arrays. The message is read into one buffer and each numeric typed array is a view of it, so arrays are neither copied nor converted element by element.

```python
import beve

data = beve.load("file.beve")   # from a file
data = beve.loads(buffer)       # from bytes, bytearray or memoryview
```

From the command line, `python -m beve file.beve` prints a file's contents.

## Install

```bash
pip install "beve @ git+https://github.com/beve-org/beve#subdirectory=python"
```

To pin a commit, use `git+https://github.com/beve-org/beve@<commit>#subdirectory=python`. With uv: `uv add "beve @ git+https://github.com/beve-org/beve@<commit>#subdirectory=python"`.

## Types

| BEVE | Python |
|---|---|
| null, boolean, string | `None`, `bool`, `str` |
| number | `int` or `float` (bfloat16 and float16 widen to `float`; 128-bit integers are `int`) |
| object | `dict`, with `str` keys or, for integer-keyed objects, `int` keys |
| numeric typed array, aligned typed array | 1-D `numpy.ndarray` of the stored type; bfloat16 is widened to float32 (a copy); 128-bit integer arrays, which numpy has no type for, are lists of `int` |
| boolean typed array | 1-D `numpy.ndarray` of `bool` (a copy, since BEVE stores bits) |
| string typed array, generic array | `list` |
| matrix | `numpy.ndarray` whose leading dimensions are the extents, in the matrix's layout (row-major as C order, column-major as Fortran order); an integer complex matrix has a last dimension of 2 |
| complex number | `complex`, or for integer parts a tuple `(re, im)` of `int` |
| complex array | `complex64` or `complex128` array (half-precision parts widen to `complex64`, a copy); integer complex arrays, which numpy has no type for, are integer arrays of shape (N, 2), real part first |
| type tag (Version 1, deprecated) | `{"index": <tag>, "value": <value>}`, its historical JSON form |

Arrays are writable. When the input is a `bytearray` they are views of it, so it cannot be resized while any of them is alive; any other input is copied first.

An empty sequence written without its element type (for example an empty `Vec<f64>` serialized by plain serde in Rust) is a generic array of size 0, and decodes to `[]` rather than an empty `ndarray`. Encoders that write typed arrays for empty sequences avoid this.

128-bit floats and the data delimiter are not supported. They raise `beve.BeveError`, as do a malformed or truncated message and nesting too deep to decode.

## Tests

```bash
pip install -e '.[test]'
pytest
```

The tests decode every file in [`examples`](../examples) and compare it with its `.json` twin, and cover each BEVE type with messages built byte by byte.
