import Darwin

enum FixtureRefusal: Error { case cannotVerify }

final class UnreadableDestination: LinkEntry {
    override func verify(_ dev: String, _ ino: String) throws {
        throw FixtureRefusal.cannotVerify
    }
}

let args = CommandLine.arguments
guard args.count == 5 else { exit(2) }
let source = try LinkEntry(args[1])
let destination = try UnreadableDestination(args[2])
do {
    try source.move(to: destination, dev: args[3], ino: args[4])
    exit(1)
} catch FixtureRefusal.cannotVerify {
    exit(0)
}
