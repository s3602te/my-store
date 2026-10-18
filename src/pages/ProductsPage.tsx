import ProductGrid from '../components/ProductGrid'
import { usePageTitle } from '../hooks/usePageTitle'
import { useStore } from '../store/StoreContext'

export default function ProductsPage() {
  usePageTitle('所有產品')
  const { products } = useStore()

  return (
    <>
      <h2>所有產品</h2>
      <ProductGrid products={products} />
    </>
  )
}
