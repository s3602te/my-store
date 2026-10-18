import ProductGrid from '../components/ProductGrid'
import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'
import { useStore } from '../store/StoreContext'

export default function ProductsPage() {
  usePageTitle(site.productsPage.pageTitle)
  const { products } = useStore()

  return (
    <>
      <h2>{site.productsPage.title}</h2>
      <ProductGrid products={products} />
    </>
  )
}
