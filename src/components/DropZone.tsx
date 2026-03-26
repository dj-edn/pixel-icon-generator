import { useRef, useState, useCallback } from 'react'

interface DropZoneProps {
  onImage: (img: HTMLImageElement, file: File) => void
}

export function DropZone({ onImage }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    const img = new Image()
    img.onload = () => onImage(img, file)
    img.src = url
  }, [onImage])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }, [loadFile])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  return (
    <div
      className={`drop-zone ${dragging ? 'dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      {preview ? (
        <div className="drop-zone-inner">
          <img src={preview} alt="source" className="drop-zone-thumb" />
          <span className="drop-zone-label">tap to upload</span>
        </div>
      ) : (
        <div className="drop-zone-inner">
          <span className="drop-zone-label">tap to upload</span>
        </div>
      )}
    </div>
  )
}
