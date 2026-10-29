import { useState } from 'react'
import { Music2 } from 'lucide-react'

interface Props {
  src?: string | null
  alt?: string
  size?: number
  className?: string
}

export function CoverArt({ src, alt = '', size = 44, className = '' }: Props): React.JSX.Element {
  const [broken, setBroken] = useState(false)

  return (
    <div
      className={`cover rounded-xl ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={!alt}
    >
      <Music2
        size={Math.max(14, Math.round(size * 0.38))}
        strokeWidth={1.7}
        className="cover-fallback"
      />
      {src && !broken && (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      )}
    </div>
  )
}
