import Foundation
import AVFoundation
import AudioToolbox

struct Note: Decodable { let time: Double; let duration: Double; let pitch: UInt8; let velocity: UInt8; let part: Int }
struct Score: Decodable { let duration: Double; let notes: [Note] }
let args = CommandLine.arguments
let score = try JSONDecoder().decode(Score.self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let engine = AVAudioEngine()
let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
let programs: [UInt8] = [0, 24, 73]
var samplers: [AVAudioUnitSampler] = []
for program in programs {
    let sampler = AVAudioUnitSampler()
    engine.attach(sampler)
    engine.connect(sampler, to: engine.mainMixerNode, format: format)
    try sampler.loadSoundBankInstrument(at: URL(fileURLWithPath: args[1]), program: program, bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB), bankLSB: 0)
    sampler.sendController(91, withValue: 20, onChannel: 0)
    sampler.sendController(93, withValue: 0, onChannel: 0)
    sampler.masterGain = program == 0 ? -7 : program == 24 ? -15 : -20
    samplers.append(sampler)
}
try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
try engine.start()
struct Event { let frame: Int64; let pitch: UInt8; let velocity: UInt8; let part: Int; let on: Bool }
var events: [Event] = []
for n in score.notes {
    events.append(Event(frame: Int64(n.time * 44100), pitch: n.pitch, velocity: n.velocity, part: n.part, on: true))
    events.append(Event(frame: Int64((n.time + n.duration) * 44100), pitch: n.pitch, velocity: n.velocity, part: n.part, on: false))
}
events.sort { $0.frame != $1.frame ? $0.frame < $1.frame : !$0.on && $1.on }
var output: AVAudioFile? = try AVAudioFile(forWriting: URL(fileURLWithPath: args[3]), settings: format.settings)
let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount)!
var index = 0
let end = Int64(score.duration * 44100)
while engine.manualRenderingSampleTime < end {
    let now = engine.manualRenderingSampleTime
    while index < events.count && events[index].frame <= now {
        let e = events[index]
        if e.on { samplers[e.part].startNote(e.pitch, withVelocity: e.velocity, onChannel: 0) }
        else { samplers[e.part].stopNote(e.pitch, onChannel: 0) }
        index += 1
    }
    let next = index < events.count ? events[index].frame : end
    let frames = AVAudioFrameCount(min(4096, max(1, min(end - now, next - now))))
    let status = try engine.renderOffline(frames, to: buffer)
    switch status {
    case .success: try output!.write(from: buffer)
    case .cannotDoInCurrentContext: continue
    default: fatalError("Offline render failed: \(status)")
    }
}
engine.stop()
output = nil
print("Rendered \(score.notes.count) notes over \(score.duration) seconds")
