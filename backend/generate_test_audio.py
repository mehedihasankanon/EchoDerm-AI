"""
Generate two test WAV audio files for EchoDerm AI testing:
1. measles_cough.wav — harsh, barking cough bursts (simulated)
2. dengue_silence.wav — near-silent recording (dengue has no significant cough)
"""
import wave
import struct
import math
import random
import os

DESKTOP = os.path.expanduser(r"~\OneDrive\Desktop")

def generate_barking_cough(filename, duration_s=10, sample_rate=44100):
    """Generate a WAV with harsh, barking cough-like bursts."""
    samples = []
    total_samples = duration_s * sample_rate
    
    # Define 4 cough bursts at different times
    cough_times = [
        (1.0, 0.4),   # (start_second, duration)
        (2.5, 0.35),
        (4.0, 0.5),
        (6.5, 0.3),
    ]
    
    for i in range(total_samples):
        t = i / sample_rate
        sample = 0.0
        
        in_cough = False
        for (start, dur) in cough_times:
            if start <= t <= start + dur:
                in_cough = True
                # Relative position within this cough burst
                rel = (t - start) / dur
                # Envelope: sharp attack, fast decay
                envelope = math.exp(-3.0 * rel) * (1.0 - math.exp(-50.0 * rel))
                # Harsh, rough sound: mix of low freq buzz + noise
                buzz = math.sin(2 * math.pi * 120 * t) * 0.4
                buzz2 = math.sin(2 * math.pi * 240 * t) * 0.25
                harsh = math.sin(2 * math.pi * 800 * t + math.sin(2 * math.pi * 50 * t) * 3) * 0.15
                noise = (random.random() * 2 - 1) * 0.5
                sample = envelope * (buzz + buzz2 + harsh + noise) * 0.7
                break
        
        if not in_cough:
            # Very quiet background noise
            sample = (random.random() * 2 - 1) * 0.005
        
        # Clamp
        sample = max(-1.0, min(1.0, sample))
        samples.append(sample)
    
    # Write WAV
    filepath = os.path.join(DESKTOP, filename)
    with wave.open(filepath, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for s in samples:
            wf.writeframes(struct.pack('<h', int(s * 32767)))
    print(f"[OK] Created: {filepath}")


def generate_silence(filename, duration_s=10, sample_rate=44100):
    """Generate a near-silent WAV with very faint ambient noise."""
    filepath = os.path.join(DESKTOP, filename)
    with wave.open(filepath, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for _ in range(duration_s * sample_rate):
            # Very faint ambient noise
            s = (random.random() * 2 - 1) * 0.008
            wf.writeframes(struct.pack('<h', int(s * 32767)))
    print(f"[OK] Created: {filepath}")


if __name__ == "__main__":
    print("[MIC] Generating test audio files for EchoDerm AI...")
    generate_barking_cough("measles_cough.wav")
    generate_silence("dengue_silence.wav")
    print("\n[DONE] Both audio files are on your Desktop.")
