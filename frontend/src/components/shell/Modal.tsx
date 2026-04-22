// frontend/src/components/shell/Modal.tsx
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const lastFocus = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, [tabindex]:not([tabindex="-1"])',
      )
      first?.focus()
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lastFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="ex-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        className={`ex-modal-panel ex-modal-panel--${size}`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="ex-modal-header">
            <h2 className="ex-modal-title">{title}</h2>
            <button
              type="button"
              className="ex-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="ex-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmModalProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="ex-modal-message">{message}</div>
      <div className="ex-modal-actions">
        <button type="button" className="ex-modal-btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`ex-modal-btn ex-modal-btn--primary ${destructive ? 'ex-modal-btn--danger' : ''}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

interface PromptModalProps {
  open: boolean
  title: string
  label?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptModal({
  open,
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function submit() {
    const v = inputRef.current?.value.trim() ?? ''
    if (!v) return
    onSubmit(v)
  }

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <form
        className="ex-modal-form"
        onSubmit={e => { e.preventDefault(); submit() }}
      >
        {label && <label className="ex-modal-label">{label}</label>}
        <input
          ref={inputRef}
          className="ex-modal-input"
          defaultValue={initialValue}
          placeholder={placeholder}
          autoFocus
        />
        <div className="ex-modal-actions">
          <button type="button" className="ex-modal-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="submit" className="ex-modal-btn ex-modal-btn--primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
