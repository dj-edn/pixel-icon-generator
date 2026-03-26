export type SegmentationStatus = 'idle' | 'loading' | 'ready' | 'processing' | 'error'

export interface SegmentationResult {
  mask: Float32Array
  width: number
  height: number
}

type StatusListener = (s: SegmentationStatus, progress?: number, message?: string) => void

class SegmentationWorkerManager {
  private worker: Worker | null = null
  private pending = new Map<
    string,
    { resolve: (r: SegmentationResult) => void; reject: (e: Error) => void }
  >()
  private _status: SegmentationStatus = 'idle'
  private listeners: StatusListener[] = []

  get status(): SegmentationStatus {
    return this._status
  }

  subscribe(cb: StatusListener) {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  private emit(s: SegmentationStatus, progress?: number, message?: string) {
    this._status = s
    this.listeners.forEach((cb) => cb(s, progress, message))
  }

  async initialize(): Promise<void> {
    if (this.worker) return

    this.emit('loading')

    this.worker = new Worker(
      new URL('../workers/segmentation.worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        type: string
        progress?: number
        message?: string
        mask?: Float32Array
        width?: number
        height?: number
        id?: string
        error?: string
      }

      switch (msg.type) {
        case 'progress':
          this.emit('loading', msg.progress, msg.message)
          break

        case 'ready':
          this.emit('ready')
          break

        case 'result': {
          const req = this.pending.get(msg.id!)
          if (req) {
            this.pending.delete(msg.id!)
            req.resolve({ mask: msg.mask!, width: msg.width!, height: msg.height! })
          }
          this.emit('ready')
          break
        }

        case 'error': {
          const req = msg.id ? this.pending.get(msg.id) : null
          if (req && msg.id) {
            this.pending.delete(msg.id)
            req.reject(new Error(msg.error))
          }
          this.emit('error')
          break
        }
      }
    }

    this.worker.onerror = (e) => {
      this.emit('error')
      console.error('Segmentation worker error:', e)
    }

    // Kick off model load
    this.worker.postMessage({ type: 'load' })

    // Wait until ready or error
    return new Promise((resolve, reject) => {
      const unsub = this.subscribe((status) => {
        if (status === 'ready') { unsub(); resolve() }
        if (status === 'error') { unsub(); reject(new Error('Model failed to load')) }
      })
    })
  }

  async removeBackground(
    source: HTMLImageElement | HTMLCanvasElement
  ): Promise<SegmentationResult> {
    if (!this.worker || this._status === 'idle') {
      await this.initialize()
    } else if (this._status === 'loading') {
      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        const unsub = this.subscribe((s) => {
          if (s === 'ready') { unsub(); resolve() }
          if (s === 'error') { unsub(); reject(new Error('Model failed to load')) }
        })
      })
    }

    this.emit('processing')

    // Draw source to a canvas to extract ImageData
    const canvas = document.createElement('canvas')
    const w = 'naturalWidth' in source ? source.naturalWidth : source.width
    const h = 'naturalHeight' in source ? source.naturalHeight : source.height
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, w, h)

    // Copy buffer so transfer doesn't corrupt anything
    const buf = imageData.data.buffer.slice(0)

    const id = Math.random().toString(36).slice(2)

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'process', data: buf, width: w, height: h, id }, [buf])
    })
  }
}

// Singleton shared across the app
export const segmentation = new SegmentationWorkerManager()
