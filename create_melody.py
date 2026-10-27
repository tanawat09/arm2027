"""Generate a short original, softly voiced invitation melody; stdlib only."""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
DURATION = 24
samples = [0.0] * (RATE * DURATION)

def note(midi, start, duration, volume):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    for k in range(int(duration * RATE)):
        i = int(start * RATE) + k
        if i >= len(samples):
            break
        t = k / RATE
        envelope = min(1, t / .025) * math.exp(-2.8 * t / duration)
        envelope *= min(1, max(0, duration - t) / .12)
        tone = (math.sin(2 * math.pi * frequency * t)
                + .22 * math.sin(4 * math.pi * frequency * t)
                + .07 * math.sin(6 * math.pi * frequency * t))
        samples[i] += tone * envelope * volume

# Four arpeggiated harmonies supporting an original eight-bar melody.
chords = [(48, 55, 60, 64), (45, 52, 57, 60), (41, 48, 53, 57), (43, 50, 55, 59)]
melody = [76, 79, 74, 72, 76, 74, 71, 72, 69, 72, 76, 74, 72, 71, 67, 72]
for bar in range(8):
    chord = chords[bar % 4]
    for step in range(6):
        note(chord[step % 4], bar * 3 + step * .5, 1.6, .065)
    note(melody[bar * 2], bar * 3, 1.5, .105)
    note(melody[bar * 2 + 1], bar * 3 + 1.5, 1.4, .095)

out = Path(__file__).parent / 'dist/assets/our-little-melody.wav'
with wave.open(str(out), 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    pcm = bytearray()
    for i, sample in enumerate(samples):
        fade = min(1, i / (RATE * .4), (len(samples) - i) / (RATE * 1.2))
        pcm.extend(struct.pack('<h', int(max(-1, min(1, sample * fade)) * 32767)))
    w.writeframes(pcm)
print(f'Created original melody: {out.name} ({DURATION}s)')
