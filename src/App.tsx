import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ProcessOptions,
  ProcessResult,
  RenderStyle,
  processImage,
  createDefaultImage,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  copyToClipboard,
} from './utils/dithering'
import { DropZone } from './components/DropZone'
import { PixelCanvas } from './components/PixelCanvas'
import { Controls } from './components/Controls'

const DEFAULT_OPTS: ProcessOptions = {
  gridSize: 32,
  threshold: 128,
  ditherIntensity: 100,
  invert: false,
}

export default function App() {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null)
  const [opts, setOpts] = useState<ProcessOptions>(DEFAULT_OPTS)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('pixel')
  const [asciiRamp, setAsciiRamp] = useState('')
  const [darkMode, setDarkMode] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optsRef = useRef(opts)
  const darkModeRef = useRef(darkMode)
  optsRef.current = opts
  darkModeRef.current = darkMode

  const exportRef = useRef<HTMLDivElement>(null)

  // Apply theme to body
  useEffect(() => {
    document.body.className = darkMode ? '' : 'light-mode'
  }, [darkMode])

  // Close export popover on outside click
  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

  const runDither = useCallback((img: HTMLImageElement | HTMLCanvasElement, o: ProcessOptions) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setResult(processImage(img, { ...o, invert: !darkModeRef.current }))
    }, 30)
  }, [])

  // Load default image on mount
  useEffect(() => {
    const canvas = createDefaultImage()
    setSourceImage(canvas)
    setResult(processImage(canvas, { ...DEFAULT_OPTS, invert: false }))
  }, [])

  const handleImage = useCallback(
    (img: HTMLImageElement) => {
      setSourceImage(img)
      runDither(img, optsRef.current)
    },
    [runDither]
  )

  const handleOptsChange = useCallback(
    (newOpts: ProcessOptions) => {
      setOpts(newOpts)
      if (sourceImage) runDither(sourceImage, newOpts)
    },
    [sourceImage, runDither]
  )

  const handleDarkModeToggle = useCallback(() => {
    const newDark = !darkModeRef.current
    setDarkMode(newDark)
    if (sourceImage) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setResult(processImage(sourceImage, { ...optsRef.current, invert: !newDark }))
    }
  }, [sourceImage])

  const handleExportCopy = async () => {
    if (!result) return
    try {
      await copyToClipboard(result, renderStyle, 8, asciiRamp)
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 1500)
    } catch { /* ignore */ }
    setShowExport(false)
  }

  return (
    <div className="app-root">
      {/* Top bar */}
      <div className="topbar">
        <button className="theme-swatch" onClick={handleDarkModeToggle} aria-label="toggle theme">
          <span className="swatch-square" />
        </button>

        <div className="export-container" ref={exportRef}>
          <button
            className={`export-btn ${!result ? 'export-btn--disabled' : ''}`}
            onClick={() => result && setShowExport((v) => !v)}
            aria-label="export"
          >
            ↑
          </button>
          {showExport && result && (
            <div className="export-popover">
              <button onClick={() => { exportToPNG(result, 1, false, renderStyle, asciiRamp); setShowExport(false) }}>
                png
              </button>
              <button onClick={() => { exportToSVG(result, false, renderStyle, asciiRamp); setShowExport(false) }}>
                svg
              </button>
              <button onClick={() => { exportToJPEG(result, false, renderStyle, asciiRamp); setShowExport(false) }}>
                jpg
              </button>
              <button onClick={handleExportCopy}>
                {exportCopied ? 'copied!' : 'copy'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="layout-grid">
        {/* Canvas — comes first in DOM for mobile (shows above controls) */}
        <div className="area-canvas">
          <PixelCanvas result={result} style={renderStyle} asciiRamp={asciiRamp} />
        </div>

        {/* Controls — style tabs + sliders + upload zone */}
        <div className="area-controls">
          <Controls
            opts={opts}
            style={renderStyle}
            asciiRamp={asciiRamp}
            onChange={handleOptsChange}
            onStyleChange={setRenderStyle}
            onAsciiRampChange={setAsciiRamp}
          />
          <DropZone onImage={handleImage} />
        </div>
      </div>
    </div>
  )
}
