import { useState, useRef, useCallback } from 'react'

export function useMic() {
  const [micActive, setMicActive] = useState(false)
  const [micError, setMicError] = useState(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const toggleMic = useCallback(async () => {
    if (micActive) {
      // Tear down
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close()
      }
      analyserRef.current = null
      streamRef.current = null
      audioCtxRef.current = null
      setMicActive(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        source.connect(analyser)
        streamRef.current = stream
        audioCtxRef.current = ctx
        analyserRef.current = analyser
        setMicError(false)
        setMicActive(true)
      } catch {
        setMicError(true)
      }
    }
  }, [micActive])

  return { micActive, micError, analyserRef, toggleMic }
}
