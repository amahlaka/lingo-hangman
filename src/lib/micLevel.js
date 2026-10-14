// Live microphone input level for the mic debug panel (src/lib/micDebug.js).
// Opens the microphone with getUserMedia and reads it through a Web Audio
// analyser; nothing is recorded or kept.

export function canMeasureLevel() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== "undefined" && Boolean(window.AudioContext || window.webkitAudioContext);
}

// Calls onLevel({ rms, peak, db }) about 15 times a second, rms and peak from
// 0 to 1. Resolves to { stop, track } where track describes the input
// (label and settings), or rejects with the browser's error.
export async function startLevelMeter(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let peakHold = 0;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      sum += v * v;
      if (v > peak) peak = v;
    }
    const rms = Math.sqrt(sum / data.length);
    peakHold = Math.max(peak, peakHold * 0.92);
    onLevel({ rms, peak: peakHold, db: rms > 0 ? 20 * Math.log10(rms) : -Infinity });
  }, 66);

  const [mic] = stream.getAudioTracks();
  const settings = mic?.getSettings?.() || {};
  return {
    track: {
      label: mic?.label || "",
      sampleRate: settings.sampleRate || ctx.sampleRate,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    },
    stop() {
      clearInterval(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      ctx.close?.();
    },
  };
}
