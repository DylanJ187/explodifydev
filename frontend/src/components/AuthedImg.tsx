// frontend/src/components/AuthedImg.tsx
// Thin wrapper around <img> that resolves a Bearer-token-protected backend
// path (e.g. /gallery/:id/thumbnail) into a blob URL before painting. Mirrors
// the native <img> API — swap in anywhere an <img src="/..."> points at a
// protected endpoint and it'll just work.
import type { ImgHTMLAttributes } from 'react'
import { useAuthedBlobUrl } from '../api/useAuthedBlobUrl'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined
}

export function AuthedImg({ src, alt = '', ...rest }: Props) {
  const resolved = useAuthedBlobUrl(src ?? null)
  if (!resolved) return null
  return <img src={resolved} alt={alt} {...rest} />
}
