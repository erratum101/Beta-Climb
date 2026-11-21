import { useEffect, useRef, useState } from 'react'

function VideoCover({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    function release() {
      video.onloadeddata = null
      video.onerror = null
      if (video.hasAttribute('src')) {
        video.removeAttribute('src')
        video.load()
      }
    }

    video.onerror = () => {
      setFailed(true)
      release()
    }
    video.onloadeddata = () => {
      const context = canvas.getContext('2d')
      if (!context || !video.videoWidth || !video.videoHeight) {
        setFailed(true)
        release()
        return
      }
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      release()
    }

    // Older attempts have only a video. Decode it once, when the card enters view.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      video.src = src
    })
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      release()
    }
  }, [src])

  return failed
    ? <span className="climb-cover-message">Кадр недоступен</span>
    : <canvas className="climb-cover" ref={canvasRef} aria-hidden="true" />
}

export function ClimbCover({ thumbnailUrl, mediaUrl }: { thumbnailUrl?: string; mediaUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (thumbnailUrl && thumbnailUrl !== failedUrl) {
    return <img className="climb-cover" src={thumbnailUrl} alt="" loading="lazy" onError={() => setFailedUrl(thumbnailUrl)} />
  }
  if (mediaUrl) return <VideoCover key={mediaUrl} src={mediaUrl} />
  return <span className="climb-cover-message">Кадр недоступен</span>
}
