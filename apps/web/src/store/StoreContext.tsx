import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { arrayCodec, rawCodec, useLocalStorage } from '../hooks/useLocalStorage'
import { site } from '../siteContent'
import type { CartItem, Order, Product, PurchaseHistory, User } from '../types'

// 後台帳密沿用原本寫死的值(純前端的示範用驗證,並非真正的安全機制)
const ADMIN_USERNAME = 'user'
const ADMIN_PASSWORD = '1234'
const ADMIN_SESSION_KEY = 'isAdminLoggedIn'
const TOAST_DURATION = 3000

interface Toast {
  id: number
  message: string
}

interface Store {
  // 商品
  products: Product[]
  addProduct: (data: Omit<Product, 'id'>) => void
  updateProduct: (id: string, data: Partial<Omit<Product, 'id'>>) => void
  deleteProduct: (id: string) => void
  // 會員
  users: User[]
  userEmail: string | null
  isLoggedIn: boolean
  registerUser: (email: string, password: string) => boolean
  login: (email: string, password: string) => boolean
  logout: () => void
  deleteUser: (email: string) => void
  purchaseHistory: PurchaseHistory
  // 購物車
  cart: CartItem[]
  cartCount: number
  cartTotal: number
  cartOpen: boolean
  openCart: () => void
  closeCart: () => void
  addToCart: (product: Pick<Product, 'id' | 'name' | 'price'>) => void
  changeQuantity: (id: string, change: number) => void
  removeFromCart: (id: string) => void
  checkout: () => void
  // 通知
  toasts: Toast[]
  notify: (message: string) => void
  // 後台
  isAdmin: boolean
  adminLogin: (username: string, password: string) => boolean
  adminLogout: () => void
}

const StoreContext = createContext<Store | null>(null)

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore 必須在 StoreProvider 內使用')
  return store
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // localStorage 的 key 與舊版相同,舊資料可直接沿用
  const [products, setProducts] = useLocalStorage<Product[]>('products', [], arrayCodec)
  const [users, setUsers] = useLocalStorage<User[]>('users', [], arrayCodec)
  const [cart, setCart] = useLocalStorage<CartItem[]>('shoppingCart', [], arrayCodec)
  const [purchaseHistory, setPurchaseHistory] = useLocalStorage<PurchaseHistory>('purchaseHistory', {})
  const [loggedInFlag, setLoggedInFlag] = useLocalStorage<boolean>('isLoggedIn', false)
  const [userEmail, setUserEmail] = useLocalStorage<string | null>('userEmail', null, rawCodec)

  const [cartOpen, setCartOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
    } catch {
      return false
    }
  })

  const isLoggedIn = loggedInFlag && !!userEmail

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list, { id, message }])
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), TOAST_DURATION)
  }, [])

  const value = useMemo<Store>(() => {
    const cartItems = cart.filter((item) => item && item.id)
    const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

    return {
      products,
      addProduct: (data) =>
        setProducts((list) => [...list, { id: `product-${Date.now()}`, ...data }]),
      updateProduct: (id, data) =>
        setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...data } : p))),
      deleteProduct: (id) => setProducts((list) => list.filter((p) => p.id !== id)),

      users,
      userEmail,
      isLoggedIn,
      registerUser: (email, password) => {
        if (users.some((u) => u.email === email)) return false
        setUsers([...users, { email, password }])
        return true
      },
      login: (email, password) => {
        const user = users.find((u) => u.email === email && u.password === password)
        if (!user) return false
        setLoggedInFlag(true)
        setUserEmail(email)
        return true
      },
      logout: () => {
        setLoggedInFlag(false)
        setUserEmail(null)
      },
      deleteUser: (email) => setUsers((list) => list.filter((u) => u.email !== email)),
      purchaseHistory,

      cart: cartItems,
      cartCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal,
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart: (product) => {
        setCart((list) =>
          list.some((item) => item.id === product.id)
            ? list.map((item) =>
                item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
              )
            : [...list, { id: product.id, name: product.name, price: product.price, quantity: 1 }],
        )
        notify(site.addedToCart(product.name))
      },
      changeQuantity: (id, change) =>
        setCart((list) =>
          list
            .map((item) => (item.id === id ? { ...item, quantity: item.quantity + change } : item))
            .filter((item) => item.quantity > 0),
        ),
      removeFromCart: (id) => setCart((list) => list.filter((item) => item.id !== id)),
      checkout: () => {
        if (!userEmail) return
        const order: Order = {
          orderId: `order-${Date.now()}`,
          date: new Date().toLocaleString('zh-TW'),
          items: [...cartItems],
          total: cartTotal,
        }
        setPurchaseHistory((history) => ({
          ...history,
          [userEmail]: [order, ...(history[userEmail] ?? [])],
        }))
        setCart([])
      },

      toasts,
      notify,

      isAdmin,
      adminLogin: (username, password) => {
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return false
        try {
          sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
        } catch {
          // 無法使用 sessionStorage 時,登入狀態只保留在記憶體
        }
        setIsAdmin(true)
        return true
      },
      adminLogout: () => {
        try {
          sessionStorage.removeItem(ADMIN_SESSION_KEY)
        } catch {
          // 同上
        }
        setIsAdmin(false)
      },
    }
  }, [
    products, users, userEmail, isLoggedIn, purchaseHistory, cart, cartOpen, toasts, isAdmin,
    notify, setProducts, setUsers, setCart, setPurchaseHistory, setLoggedInFlag, setUserEmail,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
