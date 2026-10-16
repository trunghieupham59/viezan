// Standalone diagnostic against llama.cpp b11521's vendored cpp-httplib.
// No model, GPU, or installed Ollama runtime is involved.
#include "httplib.h"
#include <string>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  httplib::Server server;
  server.Get("/health", [](const auto &, auto &response) {
    response.set_content("{\"status\":\"ok\"}", "application/json");
  });
  for (const bool fixed : {false, true}) {
    server.Post(fixed ? "/fixed" : "/original", [fixed](const auto &, auto &response) {
      response.set_chunked_content_provider("text/event-stream",
        [fixed, count = 0](size_t, httplib::DataSink &sink) mutable {
          if (count++ < 96) {
            const auto chunk = "data: " + std::string(300, 'x') + "\n\n";
            return sink.write(chunk.data(), chunk.size());
          }
          if (!sink.write("data: [DONE]\n\n", 14)) return false;
          sink.done();
          // Original llama.cpp returns has_next (false) even after done().
          return fixed;
        });
    });
  }
  return server.listen("127.0.0.1", std::stoi(argv[1])) ? 0 : 1;
}
