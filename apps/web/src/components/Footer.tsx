import { site } from '../siteContent'

export default function Footer() {
  return (
    <footer className="w-full bg-[#333] p-5 text-center text-white">
      <p>
        &copy; {site.year} {site.name}. {site.footer.copyright}
      </p>
    </footer>
  )
}
