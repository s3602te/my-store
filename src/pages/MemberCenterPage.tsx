import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatPrice } from '../lib/constants'
import { useStore } from '../store/StoreContext'

const cardClass = 'mb-[25px] rounded-[15px] bg-white p-[25px] shadow-[0_4px_8px_rgba(0,0,0,0.05)]'

export default function MemberCenterPage() {
  usePageTitle('會員中心')
  const { isLoggedIn, userEmail, purchaseHistory, logout, notify } = useStore()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  // 主動登出時要回首頁,不能被「未登入就導向登入頁」的保護攔走
  if (leaving) return null
  if (!isLoggedIn || !userEmail) return <Navigate to="/login" replace />

  const orders = purchaseHistory[userEmail] ?? []

  const handleLogout = () => {
    setLeaving(true)
    logout()
    notify('您已成功登出。')
    navigate('/')
  }

  return (
    <>
      <h2>會員中心</h2>
      <div className={`${cardClass} flex items-center justify-between`}>
        <h3>會員資訊</h3>
        <p>
          <strong>電子郵件:</strong> <span>{userEmail}</span>
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer rounded-full bg-chiikawa-red px-5 py-[10px] font-bold text-white transition-colors duration-300 hover:bg-chiikawa-red-dark"
        >
          登出
        </button>
      </div>

      <div className={cardClass}>
        <h3>購買紀錄</h3>
        {orders.length === 0 ? (
          <p>您目前沒有任何購買紀錄。</p>
        ) : (
          orders.map((order) => (
            <div key={order.orderId} className="mb-[15px] overflow-hidden rounded-[10px] border border-[#eee]">
              <div className="flex justify-between border-b border-[#eee] bg-[#f8f8f8] px-[15px] py-[10px] text-[0.9rem] text-[#777]">
                <span>訂單日期: {order.date}</span>
                <span>訂單總額: {formatPrice(order.total)}</span>
              </div>
              <ul className="m-0 list-none p-[15px]">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.name} x {item.quantity}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  )
}
