import { ProcessOptions, RenderStyle, AudioOpts } from '../utils/dithering'

const GRID_SIZES = [16, 32, 48, 64, 96, 128, 256] as const

const STYLE_ICONS: Record<RenderStyle, { char: string; color: string }> = {
  pixel: { char: '■', color: '#ff6b35' },
  dot:   { char: '●', color: '#ffd700' },
  ascii: { char: '◆', color: '#2dd4bf' },
}

interface ControlsProps {
  opts: ProcessOptions
  style: RenderStyle
  onChange: (opts: ProcessOptions) => void
  onStyleChange: (s: RenderStyle) => void
  micActive: boolean
  audioOpts: AudioOpts
  onAudioChange: (opts: AudioOpts) => void
}

function Slider({ min, max, step = 1, value, onChange }: {
  min: number; max: number; step?: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="slider-touch">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-slider"
      />
    </div>
  )
}

export function Controls({ opts, style, onChange, onStyleChange, micActive, audioOpts, onAudioChange }: ControlsProps) {
  const set = <K extends keyof ProcessOptions>(key: K, val: ProcessOptions[K]) =>
    onChange({ ...opts, [key]: val })

  const setAudio = <K extends keyof AudioOpts>(key: K, val: AudioOpts[K]) =>
    onAudioChange({ ...audioOpts, [key]: val })

  const gridIndex = GRID_SIZES.indexOf(opts.gridSize as typeof GRID_SIZES[number])

  return (
    <div className="controls-panel">
      {/* Style tabs */}
      <div className="style-tabs">
        {(['pixel', 'dot', 'ascii'] as RenderStyle[]).map((s) => (
          <button
            key={s}
            className={`tab-btn ${style === s ? 'tab-btn--active' : ''}`}
            onClick={() => onStyleChange(s)}
          >
            <span className="tab-icon" style={{ color: STYLE_ICONS[s].color }}>
              {STYLE_ICONS[s].char}
            </span>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Main sliders */}
      <div className="sliders-section">
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Density</span>
            <span className="slider-value">{opts.gridSize}</span>
          </div>
          <Slider
            min={0} max={GRID_SIZES.length - 1}
            value={gridIndex === -1 ? 1 : gridIndex}
            onChange={(v) => set('gridSize', GRID_SIZES[v])}
          />
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Threshold</span>
            <span className="slider-value">{opts.threshold}</span>
          </div>
          <Slider min={0} max={255} value={opts.threshold} onChange={(v) => set('threshold', v)} />
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Dither</span>
            <span className="slider-value">{opts.ditherIntensity}</span>
          </div>
          <Slider min={0} max={100} value={opts.ditherIntensity} onChange={(v) => set('ditherIntensity', v)} />
        </div>
      </div>

      {/* Audio sliders — only visible when mic is on */}
      {micActive && (
        <div className="audio-sliders-section">
          <div className="audio-section-label">audio</div>

          <div className="slider-row">
            <div className="slider-header">
              <span className="slider-label">threshold</span>
              <span className="slider-value">{audioOpts.threshold}</span>
            </div>
            <Slider min={0} max={255} value={audioOpts.threshold} onChange={(v) => setAudio('threshold', v)} />
          </div>

          <div className="slider-row">
            <div className="slider-header">
              <span className="slider-label">gain</span>
              <span className="slider-value">{audioOpts.gain.toFixed(1)}</span>
            </div>
            <Slider min={0.1} max={10.0} step={0.1} value={audioOpts.gain} onChange={(v) => setAudio('gain', v)} />
          </div>

          <div className="slider-row">
            <div className="slider-header">
              <span className="slider-label">offset</span>
              <span className="slider-value">
                {audioOpts.offset > 0 ? `+${audioOpts.offset}` : audioOpts.offset}
              </span>
            </div>
            <Slider min={-128} max={128} value={audioOpts.offset} onChange={(v) => setAudio('offset', v)} />
          </div>
        </div>
      )}
    </div>
  )
}
