

#include "glaze/glaze.hpp"
#include "glaze/glaze_exceptions.hpp"
#include <glaze/exceptions/binary_exceptions.hpp>

static constexpr std::string_view json0 = R"(
{
   "fixed_object": {
      "int_array": [0, 1, 2, 3, 4, 5, 6],
      "float_array": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      "double_array": [3288398.238, 233e22, 289e-1, 0.928759872, 0.22222848, 0.1, 0.2, 0.3, 0.4]
   },
   "fixed_name_object": {
      "name0": "James",
      "name1": "Abraham",
      "name2": "Susan",
      "name3": "Frank",
      "name4": "Alicia"
   },
   "another_object": {
      "string": "here is some text",
      "another_string": "Hello World",
      "boolean": false,
      "nested_object": {
         "v3s": [[0.12345, 0.23456, 0.001345],
                  [0.3894675, 97.39827, 297.92387],
                  [18.18, 87.289, 2988.298]],
         "id": "298728949872"
      }
   },
   "string_array": ["Cat", "Dog", "Elephant", "Tiger"],
   "string": "Hello world",
   "number": 3.14,
   "boolean": true,
   "another_bool": false
}
)";

struct fixed_object_t
{
   std::vector<int> int_array;
   std::vector<float> float_array;
   std::vector<double> double_array;
};

struct fixed_name_object_t
{
   std::string name0{};
   std::string name1{};
   std::string name2{};
   std::string name3{};
   std::string name4{};
};

struct nested_object_t
{
   std::vector<std::array<double, 3>> v3s{};
   std::string id{};
};

struct another_object_t
{
   std::string string{};
   std::string another_string{};
   bool boolean{};
   nested_object_t nested_object{};
};

struct obj_t
{
   fixed_object_t fixed_object{};
   fixed_name_object_t fixed_name_object{};
   another_object_t another_object{};
   std::vector<std::string> string_array{};
   std::string string{};
   double number{};
   bool boolean{};
   bool another_bool{};
};

template <>
struct glz::meta<fixed_object_t> {
   using T = fixed_object_t;
   static constexpr auto value = object(
      "int_array", &T::int_array,
      "float_array", &T::float_array,
      "double_array", &T::double_array
   );
};

template <>
struct glz::meta<fixed_name_object_t> {
   using T = fixed_name_object_t;
   static constexpr auto value = object(
      "name0", &T::name0,
      "name1", &T::name1,
      "name2", &T::name2,
      "name3", &T::name3,
      "name4", &T::name4
   );
};

template <>
struct glz::meta<nested_object_t> {
   using T = nested_object_t;
   static constexpr auto value = object(
      "v3s", &T::v3s,
      "id", &T::id
   );
};

template <>
struct glz::meta<another_object_t> {
   using T = another_object_t;
   static constexpr auto value = object(
      "string", &T::string,
      "another_string", &T::another_string,
      "boolean", &T::boolean,
      "nested_object", &T::nested_object
   );
};

template <>
struct glz::meta<obj_t> {
   using T = obj_t;
   static constexpr auto value = object(
      "fixed_object", &T::fixed_object,
      "fixed_name_object", &T::fixed_name_object,
      "another_object", &T::another_object,
      "string_array", &T::string_array,
      "string", &T::string,
      "number", &T::number,
      "boolean", &T::boolean,
      "another_bool", &T::another_bool
   );
};

int main() {
   obj_t obj{};
   glz::ex::read_json(obj, json0);
   glz::ex::write_file_binary(obj, "output.eve", std::string{});

   obj = {};
   glz::ex::read_file_binary(obj, "output.eve", std::string{});

   glz::ex::write_file_json(obj, "output.json", std::string{});

   return 0;
}