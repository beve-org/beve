# BEVE Extensions

Following the first three HEADER bits, the next five bits denote various extensions. These extensions are not expected to be implemented in every parser/serializer, but they provide convenient binary storage for more specialized use cases, such as variants, matrices, and complex numbers.

```c++
0 -> data delimiter // for specs like Newline Delimited JSON
1 -> type tag // for variant like structures
2 -> matrices
3 -> complex numbers
```

## 0 - Data Delimiter

Used to separate chunks of data to match specifications like [NDJSON](http://ndjson.org).

When converted to JSON this should add a new line (`'\n'`) character to the JSON.

## 1 - Type Tag (Variants)

Expects a subsequent compressed unsigned integer to denote a type tag. A compressed SIZE indicator is used to efficiently store the tag.

Layout : `HEADER | SIZE (i.e. type tag) | VALUE`

The converted JSON format should look like:

```json
{
  "index": 0,
  "value": "the JSON value"
}
```

The `"index"` should refer to an array of types, from zero to one less than the count of types.

The `"value"` is any JSON value.

## 2 - Matrices

Matrices can be stored as object or array types. However, this tag provides a more compact mechanism to introspect matrices.

Matrices add a one byte MATRIX HEADER.

The first bit of the matrix header denotes the data layout of the matrix.

```c++
0 -> layout_right // row-major
1 -> layout_left // column-major
```

Layout: `HEADER | MATRIX HEADER | EXTENTS | VALUE`

EXTENTS are written out as a typed array of unsigned integers.

> The VALUE in the matrix must be a typed array of numerical data.

The converted JSON format should look like:

```json
{
  "layout": "layout_right",
  "extents": [3, 3],
  "value": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
}
```

## 3 - Complex Numbers

An additional COMPLEX HEADER byte is used.

- Complex numbers are stored as pairs of numerical types.

The first three bits denote whether this is a single complex number or a complex array.

```c++
0 -> complex number
1 -> complex array
```

For a single complex number the layout is: `HEADER | COMPLEX HEADER | DATA`

> A complex value is a pair of numbers.

For a complex array the layout is: `HEADER | COMPLEX HEADER | SIZE | DATA`

> Three bits are used to align the left bits with the layouts for numbers.

The next two bits denote the numerical type:

```c++
0 -> floating point      0b000'00'000
1 -> signed integer      0b000'01'000
2 -> unsigned integer    0b000'10'000
```

The next three bits are used to indicate the BYTE COUNT. This is the same specification for BEVE numbers.

The converted JSON format should look like:

```json
[1, 2] // for a complex number
[[1, 2], [2.0, 3]] // for a complex array
```

