import { useEffect, useRef, useState } from 'react'
import {
  ProcessResult,
  RenderStyle,
  renderToCanvas,
  copyAsciiToClipboard,
} from '../utils/dithering'

interface PixelCanvasProps {
  result: ProcessResult | null
  style: RenderStyle
  asciiRamp?: string
}

export function PixelCanvas({ result, style, asciiRamp }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

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

    renderToCanvas(result, canvas, 8, style, asciiRamp)
  }, [result, style, asciiRamp])

  const handleCopyAscii = async () => {
    if (!result) return
    try {
      await copyAsciiToClipboard(result, asciiRamp)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="output-canvas" />
      {style === 'ascii' && result && (
        <button className="ascii-copy-btn" onClick={handleCopyAscii}>
          {copied ? 'copied!' : 'copy ascii'}
        </button>
      )}
    </div>
  )
}
