import { ProcessOptions, RenderStyle } from '../utils/dithering'

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
}

export function Controls({ opts, style, onChange, onStyleChange }: ControlsProps) {
  const set = <K extends keyof ProcessOptions>(key: K, val: ProcessOptions[K]) =>
    onChange({ ...opts, [key]: val })

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

      {/* Sliders */}
      <div className="sliders-section">
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Density</span>
            <span className="slider-value">{opts.gridSize}</span>
          </div>
          <input
            type="range"
            min={0}
            max={GRID_SIZES.length - 1}
            step={1}
            value={gridIndex === -1 ? 1 : gridIndex}
            onChange={(e) => set('gridSize', GRID_SIZES[Number(e.target.value)])}
            className="h-slider"
          />
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Threshold</span>
            <span className="slider-value">{opts.threshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={opts.threshold}
            onChange={(e) => set('threshold', Number(e.target.value))}
            className="h-slider"
          />
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Dither</span>
            <span className="slider-value">{opts.ditherIntensity}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={opts.ditherIntensity}
            onChange={(e) => set('ditherIntensity', Number(e.target.value))}
            className="h-slider"
          />
        </div>
      </div>
    </div>
  )
}
