import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatPrice, site } from '../siteContent'
import { useStore } from '../store/StoreContext'

const cardClass = 'mb-[25px] rounded-[15px] bg-white p-[25px] shadow-[0_4px_8px_rgba(0,0,0,0.05)]'

export default function MemberCenterPage() {
  usePageTitle(site.member.pageTitle)
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
    notify(site.member.loggedOut)
    navigate('/')
  }

  return (
    <>
      <h2>{site.member.title}</h2>
      <div className={`${cardClass} flex items-center justify-between`}>
        <h3>{site.member.infoTitle}</h3>
        <p>
          <strong>{site.member.emailLabel}</strong> <span>{userEmail}</span>
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer rounded-full bg-chiikawa-red px-5 py-[10px] font-bold text-white transition-colors duration-300 hover:bg-chiikawa-red-dark"
        >
          {site.member.logout}
        </button>
      </div>

      <div className={cardClass}>
        <h3>{site.member.historyTitle}</h3>
        {orders.length === 0 ? (
          <p>{site.member.noOrders}</p>
        ) : (
          orders.map((order) => (
            <div key={order.orderId} className="mb-[15px] overflow-hidden rounded-[10px] border border-[#eee]">
              <div className="flex justify-between border-b border-[#eee] bg-[#f8f8f8] px-[15px] py-[10px] text-[0.9rem] text-[#777]">
                <span>
                  {site.member.orderDate} {order.date}
                </span>
                <span>
                  {site.member.orderTotal} {formatPrice(order.total)}
                </span>
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
