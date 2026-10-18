import { Link } from 'react-router-dom'
import { DEFAULT_IMAGE, formatPrice } from '../lib/constants'
import { useStore } from '../store/StoreContext'
import type { Product } from '../types'

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useStore()

  return (
    <div className="rounded-[15px] border border-[#ddd] bg-white p-[15px] text-center shadow-[0_4px_8px_rgba(0,0,0,0.05)] transition duration-300 hover:-translate-y-[5px] hover:shadow-[0_8px_16px_rgba(0,0,0,0.1)]">
      <img
        src={product.imageUrl || DEFAULT_IMAGE}
        alt={product.name}
        className="mx-auto mb-[15px] h-auto max-w-full rounded-[10px] border-b border-[#ddd] pb-[15px]"
      />
      <h3 className="my-2 text-[1.2rem]">{product.name}</h3>
      <p className="mb-[15px] text-[1.1rem] font-bold text-chiikawa-red">{formatPrice(product.price)}</p>
      <div className="flex justify-center gap-[10px]">
        <Link
          to={`/product/${product.id}`}
          className="flex-1 rounded-full bg-chiikawa-blue px-[15px] py-[10px] text-[0.9rem] font-bold text-white no-underline transition-colors duration-300 hover:bg-chiikawa-blue-dark"
        >
          商品詳情
        </Link>
        <button
          type="button"
          onClick={() => addToCart(product)}
          className="flex-1 cursor-pointer rounded-full bg-chiikawa-green px-[15px] py-[10px] text-[0.9rem] font-bold text-white transition-colors duration-300 hover:bg-chiikawa-green-dark"
        >
          加入購物車
        </button>
      </div>
    </div>
  )
}
