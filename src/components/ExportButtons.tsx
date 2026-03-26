import { useState } from 'react'
import {
  ProcessResult,
  RenderStyle,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  copyToClipboard,
} from '../utils/dithering'

interface ExportButtonsProps {
  result: ProcessResult | null
  transparent: boolean
  style: RenderStyle
  asciiRamp?: string
}

export function ExportButtons({ result, transparent, style, asciiRamp }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!result) return
    try {
      await copyToClipboard(result, style, 8, asciiRamp)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard write may fail in non-secure contexts
    }
  }

  const disabled = !result

  return (
    <div className="export-row">
      <button
        className="btn-pixel"
        disabled={disabled}
        onClick={() => result && exportToPNG(result, 1, transparent, style, asciiRamp)}
      >
        png
      </button>
      <button
        className="btn-pixel"
        disabled={disabled}
        onClick={() => result && exportToSVG(result, transparent, style, asciiRamp)}
      >
        svg
      </button>
      <button
        className="btn-pixel"
        disabled={disabled}
        onClick={() => result && exportToJPEG(result, transparent, style, asciiRamp)}
      >
        jpg
      </button>
      <button className="btn-pixel" disabled={disabled} onClick={handleCopy}>
        {copied ? 'copied!' : 'copy'}
      </button>
    </div>
  )
}
