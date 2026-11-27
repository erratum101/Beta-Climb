import { useEffect, useRef, useState } from 'react'

const frameCache = new Map<string, string>()
const decodeQueue: Array<() => void> = []
let decoding = 0

function pumpDecodes() {
  while (decoding < 2 && decodeQueue.length > 0) {
    decoding += 1
    decodeQueue.shift()?.()
  }
}

function enqueueDecode(start: () => void, cancelled: () => boolean) {
  decodeQueue.push(() => {
    if (cancelled()) {
      decoding = Math.max(0, decoding - 1)
      pumpDecodes()
      return
    }
    start()
  })
  pumpDecodes()
}

function finishDecode() {
  decoding = Math.max(0, decoding - 1)
  pumpDecodes()
}

function VideoCover({ src, onFrame }: { src: string; onFrame: (url: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cached = frameCache.get(src)
    if (cached) {
      onFrameRef.current(cached)
      return
    }

    let dropped = false
    let slotOpen = false
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('playsinline', '')
    // A detached video often never decodes on a phone, so the card stays empty.
    video.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;opacity:0;pointer-events:none'
    document.body.appendChild(video)

    function closeSlot() {
      if (!slotOpen) return
      slotOpen = false
      finishDecode()
    }

    function releaseVideo() {
      video.onloadeddata = null
      video.onerror = null
      if (!video.isConnected) return
      video.removeAttribute('src')
      video.load()
      video.remove()
    }

    function paint() {
      if (dropped) return
      closeSlot()
      const context = canvas.getContext('2d')
      if (!context || video.videoWidth < 2 || video.videoHeight < 2) {
        setFailed(true)
        releaseVideo()
        return
      }
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      // Stop the file here. The card only needs the opening frame.
      releaseVideo()
      canvas.toBlob((blob) => {
        if (!blob || dropped) return
        const url = URL.createObjectURL(blob)
        const previous = frameCache.get(src)
        if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
        frameCache.set(src, url)
        onFrameRef.current(url)
      }, 'image/jpeg', 0.82)
    }

    video.onerror = () => {
      closeSlot()
      releaseVideo()
      if (!dropped) setFailed(true)
    }
    video.onloadeddata = () => paint()

    enqueueDecode(() => {
      slotOpen = true
      if (dropped) {
        closeSlot()
        return
      }
      // The fragment stays on the opening frame, so the card does not wait for a second seek.
      video.src = src.includes('#') ? src : `${src}#t=0.001`
    }, () => dropped)

    return () => {
      dropped = true
      closeSlot()
      releaseVideo()
    }
  }, [src])

  return failed
    ? <span className="climb-cover-message">Кадр недоступен</span>
    : <canvas className="climb-cover" ref={canvasRef} aria-hidden="true" />
}

export function ClimbCover({ thumbnailUrl, mediaUrl }: { thumbnailUrl?: string; mediaUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const [captured, setCaptured] = useState(() => mediaUrl ? frameCache.get(mediaUrl) : undefined)
  const poster = thumbnailUrl && thumbnailUrl !== failedUrl ? thumbnailUrl : captured

  if (poster) {
    return (
      <img
        className="climb-cover"
        src={poster}
        alt=""
        decoding="async"
        onError={() => {
          if (thumbnailUrl && poster === thumbnailUrl) setFailedUrl(thumbnailUrl)
        }}
      />
    )
  }
  if (mediaUrl) {
    return <VideoCover src={mediaUrl} onFrame={(url) => setCaptured(url)} />
  }
  return <span className="climb-cover-message">Кадр недоступен</span>
}
