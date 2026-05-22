import { useEffect } from 'react'

const DEFAULT_TITLE = 'Home Assessment Explorer | Pro-Housing Pittsburgh'

export function usePageTitle(pageTitle?: string) {
  useEffect(() => {
    const prev = document.title
    document.title = pageTitle
      ? `${pageTitle} · Home Assessment Explorer | Pro-Housing Pittsburgh`
      : DEFAULT_TITLE
    return () => {
      document.title = prev
    }
  }, [pageTitle])
}
