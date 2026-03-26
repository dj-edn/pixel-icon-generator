import { useEffect, useRef } from 'react'
import {
  ProcessResult,
  RenderStyle,
  renderToCanvas,
  renderToCanvasWithAudio,
} from '../utils/dithering'

interface PixelCanvasProps {
  result: ProcessResult | null
  style: RenderStyle
  micActive: boolean
  analyserRef: React.RefObject<AnalyserNode | null>
}

export function PixelCanvas({ result, style, micActive, analyserRef }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const ampHistoryRef = useRef<number[]>([])
  const runningRef = useRef(false)

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
      // Re-render at current slider state when mic stops
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

      // RMS amplitude 0–1
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length) / 255

      // 8-frame rolling average to smooth out jitter
      const hist = ampHistoryRef.current
      hist.push(rms)
      if (hist.length > 8) hist.shift()
      const smoothed = hist.reduce((a, b) => a + b, 0) / hist.length

      // Map smoothed amplitude → distortion params
      const thresholdShift = smoothed * 60   // 0–60
      const jitterPx = smoothed * 4          // 0–4 display pixels

      renderToCanvasWithAudio(result, canvas, 8, style, thresholdShift, jitterPx)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    // Pause loop when tab is hidden to save battery
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
