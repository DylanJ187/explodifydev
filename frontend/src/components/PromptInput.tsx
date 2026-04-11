// frontend/src/components/PromptInput.tsx
import { useState } from 'react'

const EXAMPLES = [
  "Brushed steel on white marble, soft diffused studio light",
  "Dark cyberpunk aesthetic, neon edge lighting, black background",
  "Luxury product photography, warm golden hour, shallow depth of field",
  "Clean Scandinavian design, matte white surfaces, natural daylight",
  "High-tech military grade, dark olive and carbon fibre, harsh spotlight",
]

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function PromptInput({ value, onChange, disabled }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full max-w-xl flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">
        Style prompt
        <span className="ml-1 text-gray-400 font-normal">(optional — leave blank for default studio look)</span>
      </label>

      <textarea
        rows={3}
        placeholder="Describe the visual style you want — lighting, materials, mood, background..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`
          w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm
          resize-none focus:outline-none focus:ring-2 focus:ring-blue-400
          placeholder:text-gray-400
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="self-start text-xs text-blue-500 hover:text-blue-700"
        disabled={disabled}
      >
        {expanded ? '▲ Hide examples' : '▼ Show example prompts'}
      </button>

      {expanded && (
        <div className="flex flex-col gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { onChange(ex); setExpanded(false) }}
              disabled={disabled}
              className="text-left text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100
                         rounded px-2 py-1 transition-colors"
            >
              "{ex}"
            </button>
          ))}
        </div>
      )}

      {value.trim() && (
        <p className="text-xs text-gray-400">
          Geometry and structure are always preserved — your prompt controls lighting, materials, and mood.
        </p>
      )}
    </div>
  )
}
