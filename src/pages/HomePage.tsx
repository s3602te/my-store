import ProductGrid from '../components/ProductGrid'
import { usePageTitle } from '../hooks/usePageTitle'
import { useStore } from '../store/StoreContext'

export default function HomePage() {
  usePageTitle()
  const { products } = useStore()

  return (
    <>
      <h2>熱門商品</h2>
      <ProductGrid products={products} />
    </>
  )
}
