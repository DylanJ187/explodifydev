// frontend/src/components/VideoPreview.tsx
import { getVideoUrl } from '../api/client'

interface Props {
  jobId: string
}

export function VideoPreview({ jobId }: Props) {
  const url = getVideoUrl(jobId)

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      <video
        src={url}
        controls
        autoPlay
        loop
        className="w-full rounded-2xl shadow-lg bg-black"
      />
      <a
        href={url}
        download="explodify_animation.mp4"
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
      >
        Download MP4
      </a>
    </div>
  )
}
