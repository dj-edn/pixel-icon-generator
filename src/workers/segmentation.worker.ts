/* eslint-disable */
// @ts-nocheck
import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers'

// Use browser cache (IndexedDB) so the 175MB model only downloads once
env.allowLocalModels = false
env.useBrowserCache = true

let model = null
let processor = null

async function loadModel() {
  if (model && processor) {
    self.postMessage({ type: 'ready' })
    return
  }

  try {
    self.postMessage({ type: 'progress', progress: 0, message: 'loading model...' })

    model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
      config: { model_type: 'custom' },
      progress_callback: (info) => {
        if (info.status === 'progress') {
          self.postMessage({
            type: 'progress',
            progress: Math.round(info.progress ?? 0),
            message: `downloading ${info.file ?? 'model'}...`,
          })
        }
      },
    })

    processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor',
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        size: { width: 1024, height: 1024 },
      },
    })

    self.postMessage({ type: 'ready' })
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
      id: null,
    })
  }
}

async function processImage(data, width, height, id) {
  if (!model || !processor) {
    self.postMessage({ type: 'error', error: 'model not loaded', id })
    return
  }

  try {
    // Reconstruct Uint8ClampedArray from transferred ArrayBuffer
    const pixels = new Uint8ClampedArray(data)
    const rawImage = new RawImage(pixels, width, height, 4)

    const { pixel_values } = await processor(rawImage)
    const { output } = await model({ input: pixel_values })

    // output[0] is the alpha/foreground mask, shape [1, 1, H, W]
    const maskTensor = output[0].mul(255).to('uint8')
    const maskImage = await RawImage.fromTensor(maskTensor).resize(width, height)

    // Extract as Float32Array (0 = background, 1 = foreground)
    const ch = maskImage.channels
    const maskData = new Float32Array(width * height)
    for (let i = 0; i < maskData.length; i++) {
      maskData[i] = maskImage.data[i * ch] / 255
    }

    self.postMessage(
      { type: 'result', mask: maskData, width, height, id },
      [maskData.buffer]
    )
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
      id,
    })
  }
}

self.onmessage = async (event) => {
  const msg = event.data

  if (msg.type === 'load') {
    await loadModel()
  } else if (msg.type === 'process') {
    await processImage(msg.data, msg.width, msg.height, msg.id)
  }
}
