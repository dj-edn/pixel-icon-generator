import { useEffect, useRef } from 'react'
import { ProcessResult, RenderStyle, renderToCanvas } from '../utils/dithering'

interface PixelCanvasProps {
  result: ProcessResult | null
  style: RenderStyle
}

export function PixelCanvas({ result, style }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
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
  }, [result, style])

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
