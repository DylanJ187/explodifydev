// frontend/src/components/UploadZone.tsx
import { useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'

interface Props {
  onUpload: (file: File, scalar: number) => void
  disabled?: boolean
}

export function UploadZone({ onUpload, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [scalar, setScalar] = useState(1.5)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file, scalar)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file, scalar)
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full rounded-2xl border-2 border-dashed p-12
          flex flex-col items-center justify-center gap-3 cursor-pointer
          transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
          ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400'}
        `}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-gray-600 font-medium">Drop your CAD file here</p>
        <p className="text-gray-400 text-sm">.glb · .obj · .stl</p>
        <input
          id="file-input"
          type="file"
          accept=".glb,.obj,.stl"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-3 w-full">
        <label className="text-sm text-gray-600 whitespace-nowrap">
          Explosion strength: <span className="font-semibold">{scalar.toFixed(1)}×</span>
        </label>
        <input
          type="range" min={0.5} max={3.0} step={0.1}
          value={scalar}
          onChange={(e) => setScalar(parseFloat(e.target.value))}
          className="flex-1"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
