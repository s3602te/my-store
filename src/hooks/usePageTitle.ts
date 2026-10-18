import { useEffect } from 'react'
import { site } from '../siteContent'

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} - ${site.name}` : site.name
  }, [title])
}
