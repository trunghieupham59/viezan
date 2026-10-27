import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreMedia

public struct NativeInputDevice: Identifiable, Sendable { public let id: String; public let name: String }
private final class MicrophoneSession: @unchecked Sendable {
    let session = AVCaptureSession()
    let queue = DispatchQueue(label: "com.viezan.native.microphone-session")
    func start() async { await withCheckedContinuation { continuation in queue.async { [self] in session.startRunning(); continuation.resume() } } }
    func stop() async { await withCheckedContinuation { continuation in queue.async { [self] in session.stopRunning(); continuation.resume() } } }
}

/// The screen stream supplies timestamped audio only. Samples stay on one queue,
/// are resampled to mono, and are mixed before bounded WAV segments leave the sink.
@MainActor public final class SystemAudioCapture {
    public static var inputs: [NativeInputDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified).devices.map { .init(id: $0.uniqueID, name: $0.localizedName) }
    }
    private var microphoneSession: MicrophoneSession?
    private var stopped = false
    private var stream: SCStream?
    private var sink: SystemAudioSink?
    public init() {}
    public func start(system: Bool = true, microphone: Bool, deviceID: String?, segment: @escaping @Sendable (URL, Double, Double) -> Void,
                      level: @escaping @Sendable (Double) -> Void, failure: @escaping @Sendable () -> Void) async throws {
        if !system {
            let selected = (deviceID?.isEmpty == false) ? AVCaptureDevice(uniqueID: deviceID!) : AVCaptureDevice.default(for: .audio)
            guard let selected else { throw CloudFailure.invalidResponse }
            let box = MicrophoneSession(), sink = SystemAudioSink(segment: segment, level: level, failure: failure)
            let input = try AVCaptureDeviceInput(device: selected), output = AVCaptureAudioDataOutput()
            box.session.beginConfiguration()
            guard box.session.canAddInput(input), box.session.canAddOutput(output) else { box.session.commitConfiguration(); throw CloudFailure.invalidResponse }
            box.session.addInput(input); box.session.addOutput(output); output.setSampleBufferDelegate(sink, queue: sink.queue); box.session.commitConfiguration()
            self.sink = sink; microphoneSession = box
            await box.start()
            guard !stopped, !Task.isCancelled, box.session.isRunning else { await stop(flush: false); throw CancellationError() }
            return
        }
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        try Task.checkCancellation(); guard !stopped else { throw CancellationError() }
        guard let display = content.displays.first else { throw CloudFailure.network }
        let configuration = SCStreamConfiguration()
        configuration.width = 2; configuration.height = 2; configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.capturesAudio = true; configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 24000; configuration.channelCount = 1
        configuration.captureMicrophone = microphone
        if let deviceID, !deviceID.isEmpty { configuration.microphoneCaptureDeviceID = deviceID }
        let sink = SystemAudioSink(segment: segment, level: level, failure: failure)
        let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: configuration, delegate: sink)
        try stream.addStreamOutput(sink, type: .audio, sampleHandlerQueue: sink.queue)
        if microphone { try stream.addStreamOutput(sink, type: .microphone, sampleHandlerQueue: sink.queue) }
        self.sink = sink; self.stream = stream
        do { try await stream.startCapture(); try Task.checkCancellation(); guard !stopped else { throw CancellationError() } }
        catch { await stop(flush: false); throw error }
    }
    public func stop(flush: Bool) async {
        stopped = true
        let stream = self.stream, sink = self.sink, microphone = microphoneSession; self.stream = nil; self.sink = nil; microphoneSession = nil
        await microphone?.stop()
        try? await stream?.stopCapture()
        await sink?.finish(flush: flush)
    }
}
private final class SystemAudioSink: NSObject, SCStreamOutput, SCStreamDelegate, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "com.viezan.native.system-audio")
    private let segment: @Sendable (URL, Double, Double) -> Void
    private let level: @Sendable (Double) -> Void
    private let failure: @Sendable () -> Void
    private var converters: [Int: AVAudioConverter] = [:]
    private let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24000, channels: 1, interleaved: false)!
    private var origin: Double?
    private var base: Int64 = 0
    private var samples: [Float] = []
    private var closed = false
    init(segment: @escaping @Sendable (URL, Double, Double) -> Void, level: @escaping @Sendable (Double) -> Void, failure: @escaping @Sendable () -> Void) { self.segment = segment; self.level = level; self.failure = failure }
    func stream(_ stream: SCStream, didStopWithError error: Error) { queue.async { [self] in if !closed { closed = true; samples.removeAll(); failure() } } }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) { consume(sampleBuffer, type: type.rawValue) }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) { consume(sampleBuffer, type: SCStreamOutputType.microphone.rawValue) }
    private func consume(_ sampleBuffer: CMSampleBuffer, type: Int) {
        guard !closed, CMSampleBufferDataIsReady(sampleBuffer),
              let description = CMSampleBufferGetFormatDescription(sampleBuffer) else { return }
        let source = AVAudioFormat(cmAudioFormatDescription: description)
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        guard time.isFinite, (8000...192000).contains(source.sampleRate), source.channelCount <= 32 else { return }
        let bufferCount = Int(max(1, source.channelCount))
        let size = MemoryLayout<AudioBufferList>.size + (bufferCount - 1) * MemoryLayout<AudioBuffer>.size
        let storage = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<AudioBufferList>.alignment)
        storage.initializeMemory(as: UInt8.self, repeating: 0, count: size)
        defer { storage.deallocate() }
        let pointer = storage.bindMemory(to: AudioBufferList.self, capacity: 1)
        pointer.pointee.mNumberBuffers = UInt32(bufferCount)
        let list = UnsafeMutableAudioBufferListPointer(pointer)
        var retained: CMBlockBuffer?
        defer { withExtendedLifetime(retained) {} }
        guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sampleBuffer, bufferListSizeNeededOut: nil, bufferListOut: list.unsafeMutablePointer,
                bufferListSize: size, blockBufferAllocator: kCFAllocatorDefault, blockBufferMemoryAllocator: kCFAllocatorDefault,
                flags: 0, blockBufferOut: &retained) == noErr,
              let input = AVAudioPCMBuffer(pcmFormat: source, bufferListNoCopy: list.unsafePointer, deallocator: nil) else { return }
        let count = CMSampleBufferGetNumSamples(sampleBuffer)
        guard count > 0, count <= 192000 else { return }; input.frameLength = AVAudioFrameCount(count)
        let key = type
        if converters[key]?.inputFormat != source { converters[key] = AVAudioConverter(from: source, to: format) }
        guard let converter = converters[key], let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(ceil(Double(count) * 24000 / source.sampleRate) + 256)) else { fail(); return }
        var supplied = false; var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, state in
            if supplied { state.pointee = .noDataNow; return nil }; supplied = true; state.pointee = .haveData; return input
        }
        guard status != .error, error == nil, let data = output.floatChannelData?[0] else { fail(); return }
        if origin == nil { origin = time }
        let relative = (time - origin!) * 24000
        guard relative.isFinite, abs(relative) < Double(Int64.max / 2) else { fail(); return }
        let offset = Int64(relative.rounded()) - base, frames = Int(output.frameLength)
        guard offset < 720000, offset > -720000, frames <= 192000 else { fail(); return }
        let required = Int(offset) + frames
        if required > samples.count { samples.append(contentsOf: repeatElement(0, count: required - samples.count)) }
        var peak: Float = 0
        for i in 0..<frames { let index = Int(offset) + i; if index >= 0 && index < samples.count { let value = data[i].isFinite ? data[i] : 0; samples[index] += value; peak = max(peak, abs(value)) } }
        level(Double(min(1, peak)))
        // A half-second watermark tolerates interleaving between the two streams.
        while samples.count >= 132000 && !closed { emit(frames: 120000) }
    }
    private func fail() { guard !closed else { return }; closed = true; samples.removeAll(); failure() }
    private func emit(frames: Int) {
        guard frames > 0, frames <= samples.count else { return }
        let start = Double(base) / 24000, values = Array(samples.prefix(frames)); samples.removeFirst(frames); base += Int64(frames)
        guard values.contains(where: { abs($0) > 0.008 }), let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)), let destination = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        for i in 0..<frames { destination[i] = max(-1, min(1, values[i])) }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        do {
            var file: AVAudioFile? = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 24000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false], commonFormat: .pcmFormatFloat32, interleaved: false)
            try file?.write(from: buffer); file = nil; segment(url, start, Double(base) / 24000)
        } catch { try? FileManager.default.removeItem(at: url); fail() }
    }
    func finish(flush: Bool) async {
        await withCheckedContinuation { continuation in queue.async { [self] in
            if !closed && flush { emit(frames: samples.count) }
            closed = true; samples.removeAll(); continuation.resume()
        } }
    }
}
