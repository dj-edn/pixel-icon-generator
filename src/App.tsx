import { useState, useCallback, useEffect, useRef } from 'react'
import orchidSrc from './assets/orchid.jpg'
import {
  ProcessOptions,
  ProcessResult,
  RenderStyle,
  AudioOpts,
  DEFAULT_AUDIO_OPTS,
  processImage,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  copyToClipboard,
} from './utils/dithering'
import { DropZone } from './components/DropZone'
import { PixelCanvas } from './components/PixelCanvas'
import { Controls } from './components/Controls'
import { useMic } from './hooks/useMic'

const DEFAULT_OPTS: ProcessOptions = {
  gridSize: 128,
  threshold: 128,
  ditherIntensity: 100,
  invert: false,
}

export default function App() {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null)
  const [opts, setOpts] = useState<ProcessOptions>(DEFAULT_OPTS)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('pixel')
  const [darkMode, setDarkMode] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)
  const [audioOpts, setAudioOpts] = useState<AudioOpts>(DEFAULT_AUDIO_OPTS)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optsRef = useRef(opts)
  const darkModeRef = useRef(darkMode)
  optsRef.current = opts
  darkModeRef.current = darkMode

  const exportRef = useRef<HTMLDivElement>(null)

  const { micActive, micError, analyserRef, toggleMic } = useMic()

  useEffect(() => {
    document.body.className = darkMode ? '' : 'light-mode'
  }, [darkMode])

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

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setSourceImage(img)
      setResult(processImage(img, { ...DEFAULT_OPTS, invert: false }))
    }
    img.src = orchidSrc
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
      await copyToClipboard(result, renderStyle)
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 1500)
    } catch { /* ignore */ }
    setShowExport(false)
  }

  return (
    <div className="app-root">
      {/* Top bar */}
      <div className="topbar">
        {/* Animated pill toggle switch */}
        <button
          className={`theme-toggle ${darkMode ? 'theme-toggle--dark' : 'theme-toggle--light'}`}
          onClick={handleDarkModeToggle}
          aria-label="toggle theme"
        >
          <span className="toggle-thumb" />
        </button>

        {/* Mic button */}
        <button
          className={`mic-btn ${micActive ? 'mic-btn--active' : ''}`}
          onClick={toggleMic}
          aria-label={micActive ? 'stop microphone' : 'start microphone'}
          title={micActive ? 'stop mic' : 'mic reactivity'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="5.25" y="1.25" width="5.5" height="7.5" rx="2.75" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2.5 8C2.5 11.0376 5.13401 13.5 8 13.5C10.866 13.5 13.5 11.0376 13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="8" y1="13.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="5.5" y1="15" x2="10.5" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
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
              <button onClick={() => { exportToPNG(result, 1, false, renderStyle); setShowExport(false) }}>
                png
              </button>
              <button onClick={() => { exportToSVG(result, false, renderStyle); setShowExport(false) }}>
                svg
              </button>
              <button onClick={() => { exportToJPEG(result, false, renderStyle); setShowExport(false) }}>
                jpg
              </button>
              <button onClick={handleExportCopy}>
                {exportCopied ? 'copied!' : 'copy'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mic error message */}
      {micError && (
        <p className="mic-error">mic access denied</p>
      )}

      <div className="layout-grid">
        <div className="area-canvas">
          <PixelCanvas
            result={result}
            style={renderStyle}
            micActive={micActive}
            analyserRef={analyserRef}
            audioOpts={audioOpts}
          />
        </div>

        <div className="area-controls">
          <Controls
            opts={opts}
            style={renderStyle}
            onChange={handleOptsChange}
            onStyleChange={setRenderStyle}
            micActive={micActive}
            audioOpts={audioOpts}
            onAudioChange={setAudioOpts}
          />
          <DropZone onImage={handleImage} />
        </div>
      </div>
    </div>
  )
}
