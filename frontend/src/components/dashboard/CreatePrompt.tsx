import { useState, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

const SUGGESTIONS = [
  'Polished product shot, soft studio light',
  'Cinematic reveal, slow orbit, moody shadows',
  'Technical diagram, top-down, blueprint lines',
  'Hero ad, dramatic lens flare',
]

export function CreatePrompt() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    navigate('/studio', { state: { initialPrompt: trimmed } })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(value)
    }
  }

  return (
    <div className="create-prompt">
      <div className="create-prompt__frame">
        <span className="create-prompt__edge create-prompt__edge--tl" aria-hidden />
        <span className="create-prompt__edge create-prompt__edge--br" aria-hidden />

        <textarea
          ref={textareaRef}
          className="create-prompt__input"
          placeholder="Describe the ad you want — style, mood, lighting. Press Enter to start."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          autoFocus
        />

        <div className="create-prompt__actions">
          <span className="create-prompt__hint">
            <kbd className="create-prompt__kbd">Enter</kbd> to create ·
            <kbd className="create-prompt__kbd">Shift</kbd>+<kbd className="create-prompt__kbd">Enter</kbd> for new line
          </span>
          <button
            type="button"
            className="create-prompt__submit"
            onClick={() => submit(value)}
            disabled={!value.trim()}
          >
            <span>Create</span>
            <span className="create-prompt__arrow" aria-hidden>→</span>
          </button>
        </div>
      </div>

      <div className="create-prompt__suggestions">
        <span className="create-prompt__suggestions-label">TRY</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="create-prompt__suggestion"
            onClick={() => {
              setValue(s)
              textareaRef.current?.focus()
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

export default CreatePrompt
