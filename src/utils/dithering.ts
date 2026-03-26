export type RenderStyle = 'pixel' | 'dot' | 'ascii'

export interface ProcessOptions {
  gridSize: 16 | 32 | 48 | 64 | 96 | 128 | 256
  threshold: number
  ditherIntensity: number
  invert: boolean
}

export interface SubjectMask {
  data: Float32Array
  width: number
  height: number
}

export interface ProcessResult {
  pixels: Uint8Array       // 1D array, 0=black 255=white, length = width*height
  rawLuminance: Float32Array // pre-threshold lum — used by ascii mode
  width: number
  height: number
}

// Full QWERTY density ramp: dark → light
export const DEFAULT_ASCII_RAMP = `@#8OWMB%&$QD0GHK69PXEbdpqR5UAZSnkmhTY34FVJCz2wr1youiIlft;:,. `

function lumToChar(lum: number, ramp: string = DEFAULT_ASCII_RAMP): string {
  const clamped = Math.max(0, Math.min(255, lum))
  const idx = Math.floor((clamped / 255) * (ramp.length - 1))
  return ramp[idx]
}

export function getAsciiChar(lum: number): string {
  return lumToChar(lum, DEFAULT_ASCII_RAMP)
}

/** Nearest-neighbour downscale of a float mask to target dimensions */
function scaleMask(mask: SubjectMask, dstW: number, dstH: number): Float32Array {
  const { data, width, height } = mask
  const out = new Float32Array(dstW * dstH)
  const xRatio = width / dstW
  const yRatio = height / dstH
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * xRatio), width - 1)
      const sy = Math.min(Math.floor(y * yRatio), height - 1)
      out[y * dstW + x] = data[sy * width + sx]
    }
  }
  return out
}

/** Boost foreground contrast before dithering so subjects read clearly at small sizes */
function boostContrast(val: number, amount = 1.4): number {
  return Math.min(255, Math.max(0, (val - 128) * amount + 128))
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Compute grid dimensions that preserve the source aspect ratio.
 *  The longest side equals gridSize. */
function computeGrid(
  natW: number,
  natH: number,
  gridSize: number
): { gridW: number; gridH: number } {
  if (natW >= natH) {
    return {
      gridW: gridSize,
      gridH: Math.max(1, Math.round(gridSize * natH / natW)),
    }
  } else {
    return {
      gridW: Math.max(1, Math.round(gridSize * natW / natH)),
      gridH: gridSize,
    }
  }
}

export function processImage(
  source: HTMLImageElement | HTMLCanvasElement,
  opts: ProcessOptions,
  mask?: SubjectMask | null
): ProcessResult {
  const { gridSize, threshold, ditherIntensity, invert } = opts

  // Get natural dimensions to preserve aspect ratio
  const natW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const natH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const { gridW, gridH } = computeGrid(natW, natH, gridSize)

  // Step 1: draw source into a small hidden canvas at the correct aspect ratio
  const canvas = document.createElement('canvas')
  canvas.width = gridW
  canvas.height = gridH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, gridW, gridH)

  const imageData = ctx.getImageData(0, 0, gridW, gridH)
  const data = imageData.data
  const total = gridW * gridH

  // Step 2: extract luminance
  const lum = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    lum[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
  }

  // Step 2b: apply subject mask if provided
  let scaledMask: Float32Array | null = null
  if (mask) {
    scaledMask = scaleMask(mask, gridW, gridH)
    for (let i = 0; i < total; i++) {
      if (scaledMask[i] < 0.5) {
        lum[i] = 0
      } else {
        lum[i] = boostContrast(lum[i])
      }
    }
  }

  // Snapshot rawLuminance BEFORE dithering (used by ascii render mode)
  const rawLuminance = new Float32Array(lum)
  if (invert) {
    for (let i = 0; i < total; i++) {
      rawLuminance[i] = 255 - rawLuminance[i]
    }
  }

  // Step 3: Floyd-Steinberg dithering
  const intensity = ditherIntensity / 100

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = y * gridW + x
      const isBg = scaledMask && scaledMask[idx] < 0.5

      const oldVal = lum[idx]
      const newVal = oldVal < threshold ? 0 : 255
      const error = (oldVal - newVal) * intensity

      lum[idx] = newVal

      if (!isBg) {
        if (x + 1 < gridW)                  lum[idx + 1]              += error * (7 / 16)
        if (x - 1 >= 0 && y + 1 < gridH)    lum[idx + gridW - 1]      += error * (3 / 16)
        if (y + 1 < gridH)                   lum[idx + gridW]           += error * (5 / 16)
        if (x + 1 < gridW && y + 1 < gridH) lum[idx + gridW + 1]      += error * (1 / 16)
      }
    }
  }

  // Step 4: threshold to strict 1-bit
  const pixels = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    let val = lum[i] >= 128 ? 255 : 0
    if (invert) val = val === 0 ? 255 : 0
    pixels[i] = val
  }

  return { pixels, rawLuminance, width: gridW, height: gridH }
}

/** Build a ProcessResult directly from a 2D 0/1 grid */
export function gridToResult(grid: number[][]): ProcessResult {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const pixels = new Uint8Array(width * height)
  const rawLuminance = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = grid[y][x] === 1 ? 255 : 0
      pixels[y * width + x] = val
      rawLuminance[y * width + x] = val
    }
  }
  return { pixels, rawLuminance, width, height }
}

const DISPLAY_SIZE = 512

/** Scale canvas to DISPLAY_SIZE on the longest side, preserving aspect ratio. */
function displayDimensions(width: number, height: number): { cw: number; ch: number; zoom: number } {
  const scale = DISPLAY_SIZE / Math.max(width, height)
  return {
    cw: Math.round(width * scale),
    ch: Math.round(height * scale),
    zoom: scale,
  }
}

export function renderToCanvas(
  result: ProcessResult,
  canvas: HTMLCanvasElement,
  _zoom: number,
  style: RenderStyle = 'pixel',
): void {
  const { pixels, rawLuminance, width, height } = result
  const { cw, ch, zoom } = displayDimensions(width, height)

  canvas.width = cw
  canvas.height = ch

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // Black background always
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)

  if (style === 'pixel') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x] === 255) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(Math.floor(x * zoom), Math.floor(y * zoom), Math.ceil(zoom), Math.ceil(zoom))
        }
      }
    }
  } else if (style === 'dot') {
    const radius = (zoom * 0.85) / 2
    ctx.fillStyle = '#ffffff'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x] === 255) {
          ctx.beginPath()
          ctx.arc(x * zoom + zoom / 2, y * zoom + zoom / 2, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  } else if (style === 'ascii') {
    ctx.fillStyle = '#ffffff'
    ctx.font = `${zoom}px "Courier New", monospace`
    ctx.textBaseline = 'top'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.fillText(getAsciiChar(rawLuminance[y * width + x]), x * zoom, y * zoom)
      }
    }
  }
}

/** Render with live audio distortion — called every animation frame when mic is active.
 *  thresholdShift: 0–60 (extra luminance needed to show a pixel → dissolve)
 *  jitterPx: 0–4 (max horizontal row offset in display pixels for scanline tear)
 */
export function renderToCanvasWithAudio(
  result: ProcessResult,
  canvas: HTMLCanvasElement,
  _zoom: number,
  style: RenderStyle,
  thresholdShift: number,
  jitterPx: number,
): void {
  const { rawLuminance, width, height } = result
  const { cw, ch, zoom } = displayDimensions(width, height)

  canvas.width = cw
  canvas.height = ch

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, cw, ch)

  // Dynamic threshold: as amplitude rises, pixels with rawLuminance < threshold drop out
  const dynThreshold = 128 + thresholdShift

  // Jitter probability per row (scales with jitterPx, max ~40% of rows at full amplitude)
  const jitterChance = jitterPx / 10

  if (style === 'pixel') {
    ctx.fillStyle = '#ffffff'
    for (let y = 0; y < height; y++) {
      const jOff = jitterPx > 0 && Math.random() < jitterChance
        ? Math.round((Math.random() * 2 - 1) * jitterPx)
        : 0
      for (let x = 0; x < width; x++) {
        if (rawLuminance[y * width + x] >= dynThreshold) {
          ctx.fillRect(
            Math.floor(x * zoom) + jOff,
            Math.floor(y * zoom),
            Math.ceil(zoom),
            Math.ceil(zoom),
          )
        }
      }
    }
  } else if (style === 'dot') {
    const radius = (zoom * 0.85) / 2
    ctx.fillStyle = '#ffffff'
    for (let y = 0; y < height; y++) {
      const jOff = jitterPx > 0 && Math.random() < jitterChance
        ? Math.round((Math.random() * 2 - 1) * jitterPx)
        : 0
      for (let x = 0; x < width; x++) {
        if (rawLuminance[y * width + x] >= dynThreshold) {
          ctx.beginPath()
          ctx.arc(x * zoom + zoom / 2 + jOff, y * zoom + zoom / 2, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  } else {
    // ascii
    ctx.fillStyle = '#ffffff'
    ctx.font = `${zoom}px "Courier New", monospace`
    ctx.textBaseline = 'top'
    for (let y = 0; y < height; y++) {
      const jOff = jitterPx > 0 && Math.random() < jitterChance
        ? Math.round((Math.random() * 2 - 1) * jitterPx)
        : 0
      for (let x = 0; x < width; x++) {
        const lum = rawLuminance[y * width + x]
        if (lum >= dynThreshold) {
          ctx.fillText(getAsciiChar(lum), x * zoom + jOff, y * zoom)
        }
      }
    }
  }
}

export function renderGridOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  _zoom: number
): void {
  const { cw, ch, zoom } = displayDimensions(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 0.5

  for (let x = 0; x <= width; x++) {
    ctx.beginPath(); ctx.moveTo(x * zoom, 0); ctx.lineTo(x * zoom, ch); ctx.stroke()
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * zoom); ctx.lineTo(cw, y * zoom); ctx.stroke()
  }
}

// Export: longest side = 350px, aspect ratio preserved
const EXPORT_SIZE = 350

function exportDimensions(width: number, height: number): { ew: number; eh: number; zoom: number } {
  const scale = EXPORT_SIZE / Math.max(width, height)
  return {
    ew: Math.round(width * scale),
    eh: Math.round(height * scale),
    zoom: scale,
  }
}

function renderToExportCanvas(
  result: ProcessResult,
  transparent: boolean,
  style: RenderStyle,
): HTMLCanvasElement {
  const { pixels, rawLuminance, width, height } = result
  const { ew, eh, zoom } = exportDimensions(width, height)

  const canvas = document.createElement('canvas')
  canvas.width = ew
  canvas.height = eh
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  if (!transparent) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, ew, eh)
  }

  if (style === 'pixel') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = pixels[y * width + x]
        if (val === 255) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(Math.floor(x * zoom), Math.floor(y * zoom), Math.ceil(zoom), Math.ceil(zoom))
        } else if (!transparent) {
          ctx.fillStyle = '#000000'
          ctx.fillRect(Math.floor(x * zoom), Math.floor(y * zoom), Math.ceil(zoom), Math.ceil(zoom))
        }
      }
    }
  } else if (style === 'dot') {
    const radius = (zoom * 0.85) / 2
    ctx.fillStyle = '#ffffff'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x] === 255) {
          ctx.beginPath()
          ctx.arc(x * zoom + zoom / 2, y * zoom + zoom / 2, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  } else if (style === 'ascii') {
    ctx.fillStyle = '#ffffff'
    ctx.font = `${zoom}px "Courier New", monospace`
    ctx.textBaseline = 'top'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.fillText(getAsciiChar(rawLuminance[y * width + x]), x * zoom, y * zoom)
      }
    }
  }

  return canvas
}

export function exportToPNG(
  result: ProcessResult,
  _scale: 1 | 2 | 4,
  transparent: boolean,
  style: RenderStyle = 'pixel',
): void {
  const canvas = renderToExportCanvas(result, transparent, style)
  const link = document.createElement('a')
  link.download = `pixel-icon.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function exportToJPEG(
  result: ProcessResult,
  _transparent: boolean,
  style: RenderStyle = 'pixel',
): void {
  const canvas = renderToExportCanvas(result, false, style)
  const link = document.createElement('a')
  link.download = `pixel-icon.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
}

export function exportToSVG(
  result: ProcessResult,
  transparent: boolean,
  style: RenderStyle = 'pixel',
): void {
  const { pixels, rawLuminance, width, height } = result
  const { ew, eh } = exportDimensions(width, height)
  const vw = ew
  const vh = eh

  if (style === 'ascii') {
    const cellW = ew / width
    const cellH = eh / height
    const lines: string[] = []
    if (!transparent) lines.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = getAsciiChar(rawLuminance[y * width + x])
        const safe = char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char
        lines.push(
          `<text x="${x * cellW}" y="${y * cellH}" font-size="${cellH}" font-family="Courier New, monospace" fill="#ffffff" dominant-baseline="hanging">${safe}</text>`
        )
      }
    }
    _downloadSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">\n${lines.join('\n')}\n</svg>`)
    return
  }

  if (style === 'dot') {
    const cellW = ew / width
    const cellH = eh / height
    const parts: string[] = []
    if (!transparent) parts.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x] === 255) {
          const cx = (x + 0.5) * cellW
          const cy = (y + 0.5) * cellH
          const r = Math.min(cellW, cellH) * 0.425
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>`)
        }
      }
    }
    _downloadSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">\n${parts.join('\n')}\n</svg>`)
    return
  }

  // pixel mode
  const cellW = ew / width
  const cellH = eh / height
  const rects: string[] = []
  if (!transparent) rects.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 255) {
        rects.push(`<rect x="${x * cellW}" y="${y * cellH}" width="${cellW}" height="${cellH}" fill="#ffffff"/>`)
      }
    }
  }
  _downloadSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" shape-rendering="crispEdges">\n${rects.join('\n')}\n</svg>`)
}

function _downloadSVG(svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = `pixel-icon.svg`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

export function copyToClipboard(
  result: ProcessResult,
  style: RenderStyle = 'pixel',
  _zoom = 8,
): Promise<void> {
  const canvas = document.createElement('canvas')
  renderToCanvas(result, canvas, _zoom, style)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Failed to create blob')); return }
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(resolve)
        .catch(reject)
    }, 'image/png')
  })
}

/** Create a default placeholder image using canvas drawing */
export function createDefaultImage(): HTMLCanvasElement {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const rings = [
    { r: 100, w: 18 },
    { r: 72, w: 14 },
    { r: 48, w: 10 },
    { r: 28, w: 8 },
  ]
  ctx.strokeStyle = '#ffffff'
  for (const ring of rings) {
    ctx.lineWidth = ring.w
    ctx.beginPath()
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}
