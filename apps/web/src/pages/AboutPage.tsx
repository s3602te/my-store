import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'

export default function AboutPage() {
  usePageTitle(site.about.title)

  return (
    <>
      <h2>{site.about.title}</h2>
      {site.about.paragraphs.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </>
  )
}
