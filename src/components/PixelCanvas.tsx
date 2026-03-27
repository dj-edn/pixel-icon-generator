import { useEffect, useRef } from 'react'
import {
  ProcessResult,
  RenderStyle,
  AudioOpts,
  renderToCanvas,
  renderToCanvasWithAudio,
} from '../utils/dithering'

interface PixelCanvasProps {
  result: ProcessResult | null
  style: RenderStyle
  micActive: boolean
  analyserRef: React.RefObject<AnalyserNode | null>
  audioOpts: AudioOpts
}

export function PixelCanvas({ result, style, micActive, analyserRef, audioOpts }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const ampHistoryRef = useRef<number[]>([])
  const runningRef = useRef(false)
  // Keep audioOpts current inside the RAF loop without restarting it
  const audioOptsRef = useRef(audioOpts)
  audioOptsRef.current = audioOpts

  // Normal render (no mic)
  useEffect(() => {
    if (micActive) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (!result) {
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, 512, 512)
      return
    }
    renderToCanvas(result, canvas, 8, style)
  }, [result, style, micActive])

  // Mic animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!micActive || !result || !canvas) {
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      if (canvas && result) renderToCanvas(result, canvas, 8, style)
      return
    }

    ampHistoryRef.current = []
    runningRef.current = true

    const loop = () => {
      if (!runningRef.current) return
      const analyser = analyserRef.current
      if (!analyser) return

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)

      // RMS in 0–255 space
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)

      // 8-frame rolling average
      const hist = ampHistoryRef.current
      hist.push(rms)
      if (hist.length > 8) hist.shift()
      const smoothed = hist.reduce((a, b) => a + b, 0) / hist.length

      // Signal chain: × gain → + offset → clamp → noise gate
      const { threshold, gain, offset } = audioOptsRef.current
      const gained = smoothed * gain
      const shifted = gained + offset
      const clamped = Math.max(0, Math.min(255, shifted))
      const effective = clamped < threshold ? 0 : clamped

      // Normalise to 0–1 for distortion mapping
      const n = effective / 255

      const thresholdShift = n * 60   // 0–60: dissolve
      const jitterPx      = n * 4    // 0–4px: scanline tear

      renderToCanvasWithAudio(result, canvas, 8, style, thresholdShift, jitterPx)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else if (runningRef.current) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [micActive, result, style, analyserRef])

  const aspectRatio = result ? `${result.width} / ${result.height}` : '1 / 1'

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="output-canvas"
        style={{ aspectRatio }}
      />
    </div>
  )
}
