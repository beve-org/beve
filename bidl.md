# BEVE Interface Description Language (BIDL)

BIDL is a conceptual, in progress, description language used to express a format of data to be sent in BEVE encoding. It is intended to be used as a human-readable schema to verify an existing beve encoded blob, or to generate a piece of usable code in the supported language of your choosing.

## Spec

TODO

## Example

```rs
// this is a comment
/*
so is this 
*/
// another module can be imported
import myothermodule;
// They can even have an alias
import yetanothermodule as yam;

// You must define a module name, which may act as a namespace or to be included in other modules
module mymodule;

// a structure must be named to refer to it internally and in generated code, 
// but the naming is not significant in the resulting schema or BEVE
// A struct's definition is between the curly brackets
struct Foo {
  // Note syntax: value name, colon, type name, trailing comma (`value_name: type,`)
  // null type. This has no value, but acts as padding for nothing
  padding: void,
  // bool type. Can be true or false.
  yes_or_no: bool,
  // number types
  // normal unsigned integers are a simple u<bitlength>, like u8,u16,u32,u64,u128...
  uint_val: u32,
  // normal signed integers are a simple i<bitlength>, like i8,i16,i32,i64,i128...
  sint_val: i16,
  // similarly for floats there's f8,f16,f32,f64,f128 (IEEE-754)
  // string type
  str_val: str,
  // for memory reasons, it may be relevant to specify the string length/range
  // (note the dot (.) to imply the chars)
  str2_val: str.[0..32],
  // object type
  // refers to an object in another module
  obj_val: yam.Bar,
  // a key can be a signed or unsigned integer, too. Valid are (u8,u16,..,u128,i8,..i128)
  // number followed by type (ie: 0xff00u16, -7i8, 0b1000'0000u8)
  -2i32: u8,
  // any UTF-8 string is usable as a key, too
  "string with chars like \"ß\" and \"þ\" and a\nnewline": str,
  // tuples have some rudimentary support
  tuple_val: (str, u32),
  // or by making it an array, a map may be expressed
  map_val: (str, u32)[],
  // array types
  // a dynamic array of u8, represented with enums
  enum_arr: IntEnum[],
  // a static array of objects. The range has no impact on the encoding whatsoever,
  // but may have an impact on the generated code
  static_arr: myothermodule.Bee[1..5],
  // extensions
  // data delimiter or separator. Adds a newline \n when transcoded to json
  newline: break,
  // type tag (see union below)
  // matrices
  // a matrix of 3x3, column major(layout_left)
  // layout can be denoted with an optional explanation mark.
  // Default is row-major. [2:2] is equivalent to [2:!2]
  matrix_val: [!3:3],
  // complex numbers
  // TODO
}
// though there is no native enum type in BEVE, these may either be
// represented in an integer or string format
// This is purely relevant for the generation and schema for data validation
enum IntEnum : u8 {
  Value1 = 3,
  // auto incremented to 4
  Value2,
  Value3,
}
enum StrEnum : str {
  // Each enum will get an appropriate value based on the name
  Value1,
  // Or they can be specified
  Value2 = "be creative",
  Value3,
}
// union variables may be used to indicate a "one of", which may not be
// represented in unextended BEVE
// the generated code and schema have to make sure that only one of these
// key-value sets is used.
union Other {
  first: str,
  other: u64,
}
// in case extensions are supported, a key is omitted to use the variant type
union Variant {
  str,
  u64,
}
```

### Minimum example

BIDL

```rs
struct Foo {
  test: u16,
}
```
This could result in this C++ code:
```cpp
struct Foo {
  uint16_t test{};
};
```
usage
```cpp
Foo f {12};
std::cout << glz::write_json(f).value_or("") << std::endl;
std::cout << glz::write_beve(f).value_or("") << std::endl;
```

output JSON

```json
{"test":12}
```

Tagged BEVE unpacked

```rs
HEADER(object(3),string(0))
string(size(4)
 , data("test"))
HEADER(number(1),unsigned(0b10),2bytes(1))
uint16(12)
```
