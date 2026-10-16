#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <string>

// Independent Winsock control: no cpp-httplib, no Ollama, no GPU.
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  WSADATA data;
  if (WSAStartup(MAKEWORD(2,2), &data)) return 3;
  SOCKET listener = WSASocketW(AF_INET, SOCK_STREAM, IPPROTO_TCP, nullptr, 0,
    WSA_FLAG_OVERLAPPED | WSA_FLAG_NO_HANDLE_INHERIT);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = htons(static_cast<unsigned short>(std::stoi(argv[1])));
  if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) || listen(listener, SOMAXCONN)) return 4;
  while (true) {
    SOCKET client = WSAAccept(listener, nullptr, nullptr, nullptr, 0);
    if (client == INVALID_SOCKET) break;
#ifdef VIEZAN_LINGER
    linger wait_for_send{1, 2};
    setsockopt(client, SOL_SOCKET, SO_LINGER, reinterpret_cast<const char*>(&wait_for_send), sizeof(wait_for_send));
#endif
    std::string request;
    char buffer[4096];
    while (request.find("\r\n\r\n") == std::string::npos) {
      int count = recv(client, buffer, sizeof(buffer), 0);
      if (count <= 0) break;
      request.append(buffer, count);
    }
    const std::string response = "HTTP/1.1 200 OK\r\nContent-Length: 15\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}";
    size_t sent = 0;
    while (sent < response.size()) {
      int count = send(client, response.data() + sent, static_cast<int>(response.size() - sent), 0);
      if (count <= 0) break;
      sent += count;
    }
    closesocket(client);
  }
  closesocket(listener);
  WSACleanup();
}
