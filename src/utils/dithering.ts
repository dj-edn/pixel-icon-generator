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
  rawLuminance: Float32Array // pre-threshold lum (after mask/contrast, before FS) — used by ascii mode
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

function lumToCharCustom(lum: number, customRamp: string): string {
  if (!customRamp) return lumToChar(lum, DEFAULT_ASCII_RAMP)
  const clamped = Math.max(0, Math.min(255, lum))
  const idx = Math.floor((clamped / 255) * (customRamp.length - 1))
  return customRamp[idx]
}

export function getAsciiChar(lum: number, customRamp?: string): string {
  if (customRamp && customRamp.length > 0) {
    return lumToCharCustom(lum, customRamp)
  }
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

export function processImage(
  source: HTMLImageElement | HTMLCanvasElement,
  opts: ProcessOptions,
  mask?: SubjectMask | null
): ProcessResult {
  const { gridSize, threshold, ditherIntensity, invert } = opts
  const size = gridSize

  // Step 1: draw source into a small hidden canvas
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, size, size)

  const imageData = ctx.getImageData(0, 0, size, size)
  const data = imageData.data

  // Step 2: extract luminance into a float array
  const lum = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    lum[i] = luminance(r, g, b)
  }

  // Step 2b: apply subject mask if provided
  let scaledMask: Float32Array | null = null
  if (mask) {
    scaledMask = scaleMask(mask, size, size)
    for (let i = 0; i < size * size; i++) {
      const fg = scaledMask[i]
      if (fg < 0.5) {
        lum[i] = 0
      } else {
        lum[i] = boostContrast(lum[i])
      }
    }
  }

  // Snapshot rawLuminance BEFORE dithering loop (used by ascii render mode)
  const rawLuminance = new Float32Array(lum)
  if (invert) {
    for (let i = 0; i < size * size; i++) {
      rawLuminance[i] = 255 - rawLuminance[i]
    }
  }

  // Step 3: Floyd-Steinberg dithering
  const intensity = ditherIntensity / 100

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const isBg = scaledMask && scaledMask[idx] < 0.5

      const oldVal = lum[idx]
      const newVal = oldVal < threshold ? 0 : 255
      const error = (oldVal - newVal) * intensity

      lum[idx] = newVal

      if (!isBg) {
        if (x + 1 < size)                lum[idx + 1]          += error * (7 / 16)
        if (x - 1 >= 0 && y + 1 < size)  lum[idx + size - 1]  += error * (3 / 16)
        if (y + 1 < size)                lum[idx + size]        += error * (5 / 16)
        if (x + 1 < size && y + 1 < size) lum[idx + size + 1]  += error * (1 / 16)
      }
    }
  }

  // Step 4: threshold the diffused luminance to strict 1-bit
  const pixels = new Uint8Array(size * size)
  for (let i = 0; i < size * size; i++) {
    let val = lum[i] >= 128 ? 255 : 0
    if (invert) val = val === 0 ? 255 : 0
    pixels[i] = val
  }

  return { pixels, rawLuminance, width: size, height: size }
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

export function renderToCanvas(
  result: ProcessResult,
  canvas: HTMLCanvasElement,
  _zoom: number,
  style: RenderStyle = 'pixel',
  asciiRamp?: string
): void {
  const { pixels, rawLuminance, width, height } = result

  // Always render at exactly DISPLAY_SIZE x DISPLAY_SIZE on screen
  canvas.width = DISPLAY_SIZE
  canvas.height = DISPLAY_SIZE
  // CSS size is set on the element, not here
  const zoom = DISPLAY_SIZE / width

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // Black background always
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE)

  const ramp = (asciiRamp && asciiRamp.length > 0) ? asciiRamp : DEFAULT_ASCII_RAMP

  if (style === 'pixel') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = pixels[y * width + x]
        if (val === 255) {
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
    const lum = rawLuminance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = getAsciiChar(lum[y * width + x], ramp)
        ctx.fillText(char, x * zoom, y * zoom)
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
  const zoom = DISPLAY_SIZE / width
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 0.5

  for (let x = 0; x <= width; x++) {
    ctx.beginPath()
    ctx.moveTo(x * zoom, 0)
    ctx.lineTo(x * zoom, DISPLAY_SIZE)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * zoom)
    ctx.lineTo(DISPLAY_SIZE, y * zoom)
    ctx.stroke()
  }
}

// Export size is always 350x350
const EXPORT_SIZE = 350

export function exportToPNG(
  result: ProcessResult,
  _scale: 1 | 2 | 4,
  transparent: boolean,
  style: RenderStyle = 'pixel',
  asciiRamp?: string
): void {
  const { pixels, rawLuminance, width, height } = result

  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_SIZE
  canvas.height = EXPORT_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  if (!transparent) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
  }

  const zoom = EXPORT_SIZE / width
  const ramp = (asciiRamp && asciiRamp.length > 0) ? asciiRamp : DEFAULT_ASCII_RAMP

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
          ctx.arc(
            x * zoom + zoom / 2,
            y * zoom + zoom / 2,
            radius,
            0,
            Math.PI * 2
          )
          ctx.fill()
        }
      }
    }
  } else if (style === 'ascii') {
    ctx.fillStyle = '#ffffff'
    ctx.font = `${zoom}px "Courier New", monospace`
    ctx.textBaseline = 'top'
    const lum = rawLuminance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = getAsciiChar(lum[y * width + x], ramp)
        ctx.fillText(char, x * zoom, y * zoom)
      }
    }
  }

  const link = document.createElement('a')
  link.download = `pixel-icon-${EXPORT_SIZE}x${EXPORT_SIZE}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function exportToJPEG(
  result: ProcessResult,
  _transparent: boolean,
  style: RenderStyle = 'pixel',
  asciiRamp?: string
): void {
  const { pixels, rawLuminance, width, height } = result

  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_SIZE
  canvas.height = EXPORT_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // JPEG always black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)

  const zoom = EXPORT_SIZE / width
  const ramp = (asciiRamp && asciiRamp.length > 0) ? asciiRamp : DEFAULT_ASCII_RAMP

  if (style === 'pixel') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = pixels[y * width + x]
        if (val === 255) {
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
    const lum = rawLuminance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = getAsciiChar(lum[y * width + x], ramp)
        ctx.fillText(char, x * zoom, y * zoom)
      }
    }
  }

  const link = document.createElement('a')
  link.download = `pixel-icon-${EXPORT_SIZE}x${EXPORT_SIZE}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
}

export function exportToSVG(
  result: ProcessResult,
  transparent: boolean,
  style: RenderStyle = 'pixel',
  asciiRamp?: string
): void {
  const { pixels, rawLuminance, width, height } = result
  const vw = EXPORT_SIZE
  const vh = EXPORT_SIZE
  const ramp = (asciiRamp && asciiRamp.length > 0) ? asciiRamp : DEFAULT_ASCII_RAMP

  if (style === 'ascii') {
    const cell = EXPORT_SIZE / width
    const lines: string[] = []

    if (!transparent) {
      lines.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
    }

    const lum = rawLuminance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = getAsciiChar(lum[y * width + x], ramp)
        // escape XML special chars
        const safe = char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char
        lines.push(
          `<text x="${x * cell}" y="${y * cell}" font-size="${cell}" font-family="Courier New, monospace" fill="#ffffff" dominant-baseline="hanging">${safe}</text>`
        )
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">
${lines.join('\n')}
</svg>`
    _downloadSVG(svg)
    return
  }

  if (style === 'dot') {
    const cell = EXPORT_SIZE / width
    const parts: string[] = []
    if (!transparent) {
      parts.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x] === 255) {
          const cx = (x + 0.5) * cell
          const cy = (y + 0.5) * cell
          const r = cell * 0.425
          parts.push(
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>`
          )
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">
${parts.join('\n')}
</svg>`
    _downloadSVG(svg)
    return
  }

  // Default: pixel mode
  const cell = EXPORT_SIZE / width
  const rects: string[] = []
  if (!transparent) {
    rects.push(`<rect width="${vw}" height="${vh}" fill="#000000"/>`)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 255) {
        rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#ffffff"/>`)
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" shape-rendering="crispEdges">
${rects.join('\n')}
</svg>`
  _downloadSVG(svg)
}

function _downloadSVG(svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = `pixel-icon-${EXPORT_SIZE}x${EXPORT_SIZE}.svg`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

export function copyToClipboard(
  result: ProcessResult,
  style: RenderStyle = 'pixel',
  _zoom = 8,
  asciiRamp?: string
): Promise<void> {
  const canvas = document.createElement('canvas')
  renderToCanvas(result, canvas, _zoom, style, asciiRamp)

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

export function copyAsciiToClipboard(
  result: ProcessResult,
  asciiRamp?: string
): Promise<void> {
  const { rawLuminance, width, height } = result
  const ramp = (asciiRamp && asciiRamp.length > 0) ? asciiRamp : DEFAULT_ASCII_RAMP
  const rows: string[] = []
  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) {
      row += getAsciiChar(rawLuminance[y * width + x], ramp)
    }
    rows.push(row)
  }
  return navigator.clipboard.writeText(rows.join('\n'))
}

/** Create a default placeholder image using canvas drawing */
export function createDefaultImage(): HTMLCanvasElement {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2

  // Concentric rings
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

  // Center dot
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}
