import Testing

// AppKit fixtures share NSApplication, NativeTheme and application notifications.
// MainActor prevents simultaneous access, but async layout waits still allow
// other tests to open windows. Serialize the entire fixture lifetime across
// suites so one test's notification cannot change another test's shell.
@Suite(.serialized) @MainActor struct AppKitFixtureTests {}
