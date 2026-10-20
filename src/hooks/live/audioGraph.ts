/** One mixed audio track for both VAD and recording. Raw tracks are owned by teardown,
 * never appended to the destination stream (which would create competing audio tracks).
 */
export function createLiveAudioGraph(context: AudioContext, inputs: MediaStream[], analyser: AnalyserNode): MediaStream {
  const mix = context.createGain()
  mix.gain.value = inputs.length > 1 ? 0.5 : 1
  for (const input of inputs) {
    const source = context.createMediaStreamSource(input)
    source.connect(mix)
  }
  const destination = context.createMediaStreamDestination()
  mix.connect(analyser)
  mix.connect(destination)
  return destination.stream
}
