// Benchmark: BEVE vs CBOR serialization performance
// Showcases scenarios where BEVE's design advantages lead to faster throughput:
// - O(1) front-hash key matching on read (vs linear string comparison in CBOR)
// - Little-endian wire format (no byte swaps on x86/ARM; CBOR is big-endian)
// - Compressed integer length encoding

#include <map>
#include <string>
#include <vector>

#include "bencher/bencher.hpp"
#include "bencher/diagnostics.hpp"
#include "glaze/beve.hpp"
#include "glaze/cbor.hpp"

// ---------------------------------------------------------------------------
// Test structures
// ---------------------------------------------------------------------------

struct Coordinate
{
   double x{};
   double y{};
   double z{};
};

struct Sensor
{
   uint64_t id{};
   std::string name{};
   double value{};
   uint32_t timestamp{};
   bool active{};
};

struct NestedConfig
{
   std::string name{};
   int priority{};
   std::map<std::string, double> parameters{};
   std::vector<Sensor> sensors{};
};

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

inline std::vector<Coordinate> generate_coordinates(size_t n)
{
   std::vector<Coordinate> v(n);
   for (size_t i = 0; i < n; ++i) {
      double d = static_cast<double>(i);
      v[i] = {d * 0.1, d * 0.2 + 1.0, d * 0.3 - 2.0};
   }
   return v;
}

inline std::vector<Sensor> generate_sensors(size_t n)
{
   std::vector<Sensor> v(n);
   for (size_t i = 0; i < n; ++i) {
      v[i] = {i + 1, "sensor_" + std::to_string(i), static_cast<double>(i) * 2.5,
              1700000000u + static_cast<uint32_t>(i), i % 2 == 0};
   }
   return v;
}

inline NestedConfig generate_config(size_t sensor_count)
{
   NestedConfig cfg;
   cfg.name = "production_line_A";
   cfg.priority = 5;
   cfg.parameters = {{"threshold", 0.95}, {"interval", 30.0}, {"gain", 1.5}, {"offset", -0.2}, {"max_rate", 100.0}};
   cfg.sensors = generate_sensors(sensor_count);
   return cfg;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main()
{
   // ========================================================================
   // Small struct (Coordinate - 3 doubles)
   // BEVE's front-hash key matching + native-endian doubles vs CBOR's string compare + byteswap
   // ========================================================================
   {
      const Coordinate coord{40.7128, -74.0060, 10.5};

      std::string beve_buf, cbor_buf;
      (void)glz::write_beve(coord, beve_buf);
      (void)glz::write_cbor(coord, cbor_buf);

      {
         bencher::stage stage;
         stage.name = "write Coordinate (3 doubles)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::string buf{};
            auto ec = glz::write_beve(coord, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         stage.run("CBOR", [&] {
            std::string buf{};
            auto ec = glz::write_cbor(coord, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         bencher::print_results(stage);
      }

      {
         bencher::stage stage;
         stage.name = "read Coordinate (3 doubles)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            Coordinate out{};
            auto ec = glz::read_beve(out, beve_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return beve_buf.size();
         });

         stage.run("CBOR", [&] {
            Coordinate out{};
            auto ec = glz::read_cbor(out, cbor_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return cbor_buf.size();
         });

         bencher::print_results(stage);
      }
   }

   // ========================================================================
   // Vector of structs (100 Sensors)
   // Per-element key matching and endian overhead amplified across many objects
   // ========================================================================
   {
      const auto sensors = generate_sensors(100);

      std::string beve_buf, cbor_buf;
      (void)glz::write_beve(sensors, beve_buf);
      (void)glz::write_cbor(sensors, cbor_buf);

      {
         bencher::stage stage;
         stage.name = "write vector<Sensor> (100 elements)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::string buf{};
            auto ec = glz::write_beve(sensors, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         stage.run("CBOR", [&] {
            std::string buf{};
            auto ec = glz::write_cbor(sensors, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         bencher::print_results(stage);
      }

      {
         bencher::stage stage;
         stage.name = "read vector<Sensor> (100 elements)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::vector<Sensor> out{};
            auto ec = glz::read_beve(out, beve_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return beve_buf.size();
         });

         stage.run("CBOR", [&] {
            std::vector<Sensor> out{};
            auto ec = glz::read_cbor(out, cbor_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return cbor_buf.size();
         });

         bencher::print_results(stage);
      }
   }

   // ========================================================================
   // Nested struct with maps (NestedConfig, 50 sensors)
   // Deep nesting + map keys compound BEVE's read-side advantage
   // ========================================================================
   {
      const auto config = generate_config(50);

      std::string beve_buf, cbor_buf;
      (void)glz::write_beve(config, beve_buf);
      (void)glz::write_cbor(config, cbor_buf);

      {
         bencher::stage stage;
         stage.name = "write NestedConfig (50 sensors + map)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::string buf{};
            auto ec = glz::write_beve(config, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         stage.run("CBOR", [&] {
            std::string buf{};
            auto ec = glz::write_cbor(config, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         bencher::print_results(stage);
      }

      {
         bencher::stage stage;
         stage.name = "read NestedConfig (50 sensors + map)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            NestedConfig out{};
            auto ec = glz::read_beve(out, beve_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return beve_buf.size();
         });

         stage.run("CBOR", [&] {
            NestedConfig out{};
            auto ec = glz::read_cbor(out, cbor_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return cbor_buf.size();
         });

         bencher::print_results(stage);
      }
   }

   // ========================================================================
   // Vector of Coordinates (1000 elements)
   // Many small structs: per-field key matching and endian overhead dominates
   // ========================================================================
   {
      const auto coords = generate_coordinates(1000);

      std::string beve_buf, cbor_buf;
      (void)glz::write_beve(coords, beve_buf);
      (void)glz::write_cbor(coords, cbor_buf);

      {
         bencher::stage stage;
         stage.name = "write vector<Coordinate> (1000 elements)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::string buf{};
            auto ec = glz::write_beve(coords, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         stage.run("CBOR", [&] {
            std::string buf{};
            auto ec = glz::write_cbor(coords, buf);
            if (ec) std::abort();
            bencher::do_not_optimize(buf);
            return buf.size();
         });

         bencher::print_results(stage);
      }

      {
         bencher::stage stage;
         stage.name = "read vector<Coordinate> (1000 elements)";
         stage.baseline = "CBOR";

         stage.run("BEVE", [&] {
            std::vector<Coordinate> out{};
            auto ec = glz::read_beve(out, beve_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return beve_buf.size();
         });

         stage.run("CBOR", [&] {
            std::vector<Coordinate> out{};
            auto ec = glz::read_cbor(out, cbor_buf);
            if (ec) std::abort();
            bencher::do_not_optimize(out);
            return cbor_buf.size();
         });

         bencher::print_results(stage);
      }
   }

   // ========================================================================
   // Roundtrip: NestedConfig (100 sensors)
   // End-to-end write + read
   // ========================================================================
   {
      const auto config = generate_config(100);

      bencher::stage stage;
      stage.name = "roundtrip NestedConfig (100 sensors)";
      stage.baseline = "CBOR";

      stage.run("BEVE", [&] {
         std::string buf{};
         auto ec = glz::write_beve(config, buf);
         if (ec) std::abort();
         NestedConfig out{};
         auto ec2 = glz::read_beve(out, buf);
         if (ec2) std::abort();
         bencher::do_not_optimize(out);
         return buf.size();
      });

      stage.run("CBOR", [&] {
         std::string buf{};
         auto ec = glz::write_cbor(config, buf);
         if (ec) std::abort();
         NestedConfig out{};
         auto ec2 = glz::read_cbor(out, buf);
         if (ec2) std::abort();
         bencher::do_not_optimize(out);
         return buf.size();
      });

      bencher::print_results(stage);
   }

   return 0;
}
