cmake_minimum_required(VERSION 3.18)
project(beve_benchmarks)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# Fetch bencher
FetchContent_Declare(
  bencher
  GIT_REPOSITORY https://github.com/stephenberry/bencher.git
  GIT_TAG main
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(bencher)

# Fetch glaze
FetchContent_Declare(
  glaze
  GIT_REPOSITORY https://github.com/stephenberry/glaze.git
  GIT_TAG main
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(glaze)

# BEVE vs CBOR benchmark
add_executable(beve_cbor_benchmark beve_cbor_benchmark.cpp)
target_link_libraries(beve_cbor_benchmark PRIVATE
  glaze::glaze
  bencher::bencher
)
target_compile_options(beve_cbor_benchmark PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-O3 -march=native>
  $<$<CXX_COMPILER_ID:MSVC>:/O2>
)
