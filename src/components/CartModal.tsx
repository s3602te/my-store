import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPrice } from '../lib/constants'
import { useStore } from '../store/StoreContext'

export default function CartModal() {
  const {
    cart, cartTotal, cartOpen, closeCart, changeQuantity, removeFromCart,
    checkout, isLoggedIn, notify,
  } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!cartOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cartOpen, closeCart])

  if (!cartOpen) return null

  const handleCheckout = () => {
    if (!isLoggedIn) {
      alert('請先登入會員再進行結帳！')
      closeCart()
      navigate('/login')
      return
    }
    if (cart.length === 0) {
      alert('您的購物車是空的！')
      return
    }
    checkout()
    notify('結帳成功！感謝您的購買！')
    closeCart()
  }

  return (
    <div
      className="fixed inset-0 z-[100] overflow-auto bg-black/50"
      onClick={(event) => event.target === event.currentTarget && closeCart()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="購物車"
        className="relative mx-auto my-[10%] w-[90%] max-w-[600px] animate-modal-in rounded-[20px] border border-[#888] bg-[#fefefe] p-5 shadow-[0_5px_15px_rgba(0,0,0,0.3)] max-md:my-[5vh] max-md:w-[95%] max-md:p-[15px]"
      >
        <button
          type="button"
          aria-label="關閉"
          onClick={closeCart}
          className="absolute right-[25px] top-[10px] cursor-pointer text-[35px] font-bold leading-none text-[#aaa] hover:text-black"
        >
          &times;
        </button>
        <h2>您的購物車</h2>

        <div>
          {cart.length === 0 ? (
            <p>您的購物車是空的。</p>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-[#eee] px-[5px] py-3 max-md:flex-col max-md:items-start max-md:gap-[10px]"
              >
                <div className="flex grow flex-col items-start gap-[15px]">
                  <span className="font-bold">{item.name}</span>
                  <span className="text-[0.9rem] text-[#888]">
                    小計: {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
                <div className="flex items-center gap-[10px] max-md:w-full max-md:justify-end">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, -1)}
                    className="h-7 w-7 cursor-pointer rounded-full bg-chiikawa-blue text-[18px] font-bold text-white transition-colors duration-300 hover:bg-chiikawa-blue-dark"
                  >
                    -
                  </button>
                  <span className="min-w-5 text-center font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, 1)}
                    className="h-7 w-7 cursor-pointer rounded-full bg-chiikawa-blue text-[18px] font-bold text-white transition-colors duration-300 hover:bg-chiikawa-blue-dark"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    title="移除商品"
                    onClick={() => removeFromCart(item.id)}
                    className="h-6 w-6 cursor-pointer rounded-full bg-chiikawa-red text-[16px] leading-6 text-white transition-colors duration-300 hover:bg-chiikawa-red-dark"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <hr />
        <h3>總計: {formatPrice(cartTotal)}</h3>
        <button
          type="button"
          onClick={handleCheckout}
          className="mt-[15px] w-full cursor-pointer rounded-[5px] bg-chiikawa-red px-5 py-3 text-[1.1rem] text-white transition-colors duration-300 hover:bg-chiikawa-red-dark"
        >
          前往結帳
        </button>
      </div>
    </div>
  )
}
