import { Link, useParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { DEFAULT_IMAGE, formatPrice } from '../lib/constants'
import { useStore } from '../store/StoreContext'

export default function ProductDetailPage() {
  const { id } = useParams()
  const { products, addToCart } = useStore()
  const product = products.find((p) => p.id === id)

  usePageTitle(product ? product.name : '商品詳情')

  if (!product) {
    return (
      <>
        <h2>找不到商品</h2>
        <p>您要找的商品可能已經下架或不存在。</p>
        <Link to="/products" className="text-link">回到商品列表</Link>
      </>
    )
  }

  return (
    <div className="mx-auto my-8 grid max-w-[1000px] grid-cols-2 gap-10 rounded-[15px] bg-white p-[30px] shadow-[0_4px_8px_rgba(0,0,0,0.05)] max-md:grid-cols-1">
      <div>
        <img
          src={product.imageUrl || DEFAULT_IMAGE}
          alt={product.name}
          className="w-full rounded-[10px]"
        />
      </div>
      <div>
        <h1 className="mt-0 text-[2.5rem]">{product.name}</h1>
        <p className="my-5 text-[2rem] text-chiikawa-red">{formatPrice(product.price)}</p>
        <p className="mb-[30px] whitespace-pre-line leading-[1.8]">
          {product.description || '店家尚未提供詳細描述。'}
        </p>
        <button
          type="button"
          onClick={() => addToCart(product)}
          className="cursor-pointer rounded-full bg-chiikawa-green px-[30px] py-[15px] text-[1.2rem] text-white transition-colors duration-300 hover:bg-chiikawa-green-dark"
        >
          加入購物車
        </button>
      </div>
    </div>
  )
}
