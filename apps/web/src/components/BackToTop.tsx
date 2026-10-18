import { useEffect, useState } from 'react'
import { site } from '../siteContent'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 100)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      title={site.backToTop}
      aria-label={site.backToTop}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed bottom-5 right-5 z-50 h-11 w-11 cursor-pointer rounded-full bg-chiikawa-blue text-white shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-all duration-300 hover:bg-chiikawa-blue-dark ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      ▲
    </button>
  )
}
