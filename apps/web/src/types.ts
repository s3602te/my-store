export interface Product {
  id: string
  name: string
  price: number
  imageUrl: string
  description?: string
}

export interface User {
  email: string
  password: string
}

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  orderId: string
  date: string
  items: CartItem[]
  total: number
}

/** 以會員 email 為 key 的購買紀錄 */
export type PurchaseHistory = Record<string, Order[]>
