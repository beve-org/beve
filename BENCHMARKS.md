# Performance

BEVE with [Glaze](https://github.com/stephenberry/glaze) versus [JSON](https://www.json.org/), [MessagePack](https://github.com/msgpack/msgpack-c), and [CBOR](https://cbor.io/) (via [Glaze](https://github.com/stephenberry/glaze)).

## Speedup vs BEVE (Baseline)

Higher means BEVE is faster by that factor. Format: Write/Read

| Test | JSON | MsgPack | CBOR |
|------|------|---------|------|
| Complex Nested Object | 2.6x/2.2x | 2.2x/10.1x | 1.0x/1.1x |
| std::vector\<double\> (10K) | 150.8x/147.6x | 17.5x/37.8x | 1.0x/1.0x |
| std::vector\<float\> (10K) | 221.8x/231.6x | 33.1x/73.8x | 1.0x/1.0x |
| std::vector\<uint64_t\> (10K) | 45.6x/85.5x | 17.9x/36.5x | 1.0x/1.0x |
| std::vector\<uint32_t\> (10K) | 53.8x/88.8x | 34.0x/72.1x | 1.0x/1.0x |
| std::vector\<uint16_t\> (10K) | 91.7x/130.8x | 67.6x/164.3x | 1.0x/0.9x |

> CBOR benchmarks use [RFC 8746](https://datatracker.ietf.org/doc/rfc8746/) typed arrays via Glaze.

[Performance test code](https://github.com/stephenberry/binary_performance)

## Message Sizes

| Test | JSON | BEVE | MessagePack | CBOR |
|------|------|------|-------------|------|
| Complex Nested Object | 616 B | 564 B | 545 B | 560 B |
| std::vector\<double\> (10K) | 219.02 KB | 78.13 KB | 87.89 KB | 78.13 KB |
| std::vector\<float\> (10K) | 124.11 KB | 39.07 KB | 48.83 KB | 39.07 KB |
| std::vector\<uint64_t\> (10K) | 199.23 KB | 78.13 KB | 87.89 KB | 78.13 KB |
| std::vector\<uint32_t\> (10K) | 104.97 KB | 39.07 KB | 48.83 KB | 39.07 KB |
| std::vector\<uint16_t\> (10K) | 56.96 KB | 19.53 KB | 29.26 KB | 19.54 KB |

BEVE and CBOR (with RFC 8746 typed arrays) store contiguous arrays as raw memory blocks, achieving the same message sizes and throughput when using optimized implementations like Glaze. MessagePack encodes each element individually with type tags, resulting in larger messages and slower performance for numeric arrays.

## Struct Serialization: BEVE vs CBOR

For struct-heavy workloads, BEVE is faster than CBOR due to its little-endian wire format (no byte swaps on x86/ARM), avoiding float conversions, and easier key handling.

| Test | Write | Read |
|------|-------|------|
| Coordinate (3 doubles) | 1.25x | 1.25x |
| vector\<Sensor\> (100 elements) | 1.23x | 1.36x |
| NestedConfig (50 sensors + map) | 1.29x | 1.29x |
| vector\<Coordinate\> (1000 elements) | 1.34x | 1.23x |

[Benchmark code](https://github.com/stephenberry/beve/blob/main/cpp/benchmarks/beve_cbor_benchmark.cpp)
