import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SITE_NAME } from '../lib/constants'
import { useStore } from '../store/StoreContext'

const navItemClass =
  'cursor-pointer px-5 py-[14px] text-center font-bold text-white no-underline transition-transform duration-200 hover:scale-110 ' +
  'max-md:w-full max-md:border-b max-md:border-white/50 max-md:px-0 max-md:py-[10px] max-md:last:border-b-0'

const barClass =
  'block h-[3px] w-full bg-white transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]'

export default function Header() {
  const { isLoggedIn, cartCount, openCart } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  // 換頁後自動收合手機選單
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <>
      <header className="relative border-b-[5px] border-dashed border-white bg-chiikawa-blue py-6 text-center text-[1.2rem] text-white">
        <Link
          to="/admin"
          title="前往後台管理"
          className="absolute left-[15px] top-[15px] rounded-full bg-white/25 px-3 py-1.5 text-[0.8rem] font-normal text-white no-underline transition-colors duration-300 hover:bg-white/40"
        >
          後台登入
        </Link>
        <h1>{SITE_NAME}</h1>

        {/* 手機版漢堡選單:三條線平滑變成 X */}
        <button
          type="button"
          aria-label={menuOpen ? '關閉選單' : '開啟選單'}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
          className="absolute right-5 top-1/2 z-[101] hidden -translate-y-1/2 cursor-pointer p-0 max-md:block"
        >
          <span className="flex w-[25px] flex-col gap-[5px] py-[5px]">
            <span className={`${barClass} ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`${barClass} ${menuOpen ? 'scale-x-0 opacity-0' : ''}`} />
            <span className={`${barClass} ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </span>
        </button>
      </header>

      {/* 用 grid-template-rows 0fr → 1fr 做高度動畫,選單高度不用寫死 */}
      <nav
        id="main-nav"
        className={`grid bg-chiikawa-pink transition-[grid-template-rows,visibility] duration-[400ms] ease-in-out md:grid-rows-[1fr] ${
          menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] max-md:invisible'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex justify-center py-[5px] max-md:flex-col max-md:items-center">
            <Link to="/" className={navItemClass}>首頁</Link>
            <Link to="/products" className={navItemClass}>產品</Link>
            <Link to="/about" className={navItemClass}>關於我們</Link>
            <Link to="/contact" className={navItemClass}>聯絡我們</Link>
            {isLoggedIn ? (
              <Link to="/member" className={navItemClass}>會員中心</Link>
            ) : (
              <Link to="/login" className={navItemClass}>登入/註冊</Link>
            )}
            <button type="button" onClick={openCart} className={navItemClass}>
              購物車 ({cartCount})
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
