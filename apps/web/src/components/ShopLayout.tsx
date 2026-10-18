import { Outlet } from 'react-router-dom'
import BackToTop from './BackToTop'
import CartModal from './CartModal'
import Footer from './Footer'
import Header from './Header'
import ToastHost from './ToastHost'

export default function ShopLayout() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <Header />
      <main className="flex-1 p-5">
        <Outlet />
      </main>
      <CartModal />
      <ToastHost />
      <BackToTop />
      <Footer />
    </div>
  )
}
