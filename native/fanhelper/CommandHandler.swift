import Foundation

struct Options {
  var daemon = false
  var socketPath = ""
  var uid: uid_t = 0
  var watchdogSeconds = 15.0
  var idleExitSeconds = 60.0
  var ceilingCelsius = 105.0
}

struct CommandEnvironment {
  let protocolVersion: Int
  let helperVersion: String
  let teamSigned: Bool
  let executableSha256: String?
  let isAllowedPeer: (uid_t, Options) -> Bool
  let writeLog: (String) -> Void
  let shutdownSocket: (Int32) -> Void
  let requestExit: () -> Void
}

func jsonLine(_ object: [String: Any]) -> Data {
  var data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data("{}".utf8)
  data.append(0x0A)
  return data
}

func reply(_ id: Any, result: Any) -> Data { jsonLine(["id": id, "ok": true, "result": result]) }
func replyError(_ id: Any, _ code: String, _ message: String) -> Data { jsonLine(["id": id, "ok": false, "error": ["code": code, "message": message]]) }

func handle(_ line: Data, from client: Int32, controller: FanController, options: Options,
            environment: CommandEnvironment) -> Data? {
  guard let raw = try? JSONSerialization.jsonObject(with: line), let request = raw as? [String: Any] else {
    return replyError(NSNull(), "bad-request", "Not a JSON object.")
  }
  let id: Any = request["id"] ?? NSNull()
  guard let op = request["op"] as? String else { return replyError(id, "bad-request", "Missing op.") }
  let args = request["args"] as? [String: Any] ?? [:]

  return controller.queue.sync {
    // The watchdog checks the console user once a second; a command must not run in between.
    if options.daemon, let current = controller.client, current.fd == client, !environment.isAllowedPeer(current.uid, options) {
      environment.writeLog("uid \(current.uid) is no longer the console user; dropping the client")
      controller.disconnect(client, reason: "console-user")
      environment.shutdownSocket(client)
      return nil
    }
    guard controller.beginCommand(from: client) else { return nil }
    do {
      switch op {
      case "hello":
        var hello: [String: Any] = [
          "protocol": environment.protocolVersion,
          "helperVersion": environment.helperVersion,
          "platform": "darwin",
          "mode": options.daemon ? "daemon" : "session",
          "pid": Int(getpid()),
          "watchdogSeconds": options.watchdogSeconds,
          "ceilingCelsius": options.ceilingCelsius,
          "capabilities": ["fans.write"],
          "teamSigned": environment.teamSigned,
        ]
        if let executableSha256 = environment.executableSha256 { hello["binarySha256"] = executableSha256 }
        return reply(id, result: hello)
      case "status":
        return reply(id, result: controller.status())
      case "fans.list":
        return reply(id, result: controller.listFans())
      case "fans.setMode":
        guard let fanId = args["id"] as? String, let mode = args["mode"] as? String else {
          return replyError(id, "bad-request", "fans.setMode needs id and mode.")
        }
        guard mode == "auto" else { return replyError(id, "bad-request", "Only mode \"auto\" is settable; use fans.setTarget for manual.") }
        return reply(id, result: try controller.setAuto(id: fanId))
      case "fans.setTarget":
        // A JSON boolean also bridges to NSNumber; it is not a speed.
        guard let fanId = args["id"] as? String, let number = args["rpm"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), case let rpm = number.doubleValue else {
          return replyError(id, "bad-request", "fans.setTarget needs id and a numeric rpm.")
        }
        return reply(id, result: try controller.setTarget(id: fanId, rpm: rpm))
      case "fans.restoreAll":
        let ok = controller.restoreAll(reason: "client")
        return reply(id, result: ["restored": ok])
      case "helper.exit":
        // Restore and leave once the reply is out; launchd starts the daemon again from the
        // (possibly updated) binary.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { environment.requestExit() }
        return reply(id, result: ["exiting": true])
      default:
        return replyError(id, "bad-request", "Unknown op \(op).")
      }
    } catch let error as HelperError {
      return replyError(id, error.code, error.message)
    } catch {
      return replyError(id, "smc-error", "\(error)")
    }
  }
}
