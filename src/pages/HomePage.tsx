import ProductGrid from '../components/ProductGrid'
import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'
import { useStore } from '../store/StoreContext'

export default function HomePage() {
  usePageTitle()
  const { products } = useStore()

  return (
    <>
      <h2>{site.home.title}</h2>
      <ProductGrid products={products} />
    </>
  )
}
