import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../../hooks/usePageTitle'
import { DEFAULT_IMAGE, formatPrice } from '../../lib/constants'
import { useStore } from '../../store/StoreContext'
import type { Product } from '../../types'

const inputClass = 'box-border w-full rounded border border-[#ccc] p-[10px]'
const labelClass = 'mb-2 block font-semibold'
const primaryButton =
  'w-full cursor-pointer rounded bg-[#007bff] p-3 text-base font-semibold text-white hover:bg-[#0056b3]'
const smallButton = 'w-auto cursor-pointer rounded px-[10px] py-[5px] text-sm'
const sectionClass = 'mb-8 rounded-lg bg-white p-8 shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
const cellClass = 'border-b border-[#ddd] p-3 text-left align-middle'

interface EditForm {
  id: string
  name: string
  price: string
  imageUrl: string
}

export default function AdminDashboardPage() {
  usePageTitle('商店後台')
  const { isAdmin, adminLogout, products, users, addProduct, updateProduct, deleteProduct, deleteUser } =
    useStore()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [editing, setEditing] = useState<EditForm | null>(null)

  const warned = useRef(false)
  useEffect(() => {
    if (!isAdmin && !warned.current) {
      warned.current = true
      alert('請先登入！')
    }
  }, [isAdmin])

  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing])

  if (!isAdmin) return <Navigate to="/admin" replace />

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    const value = parseFloat(price)
    if (name.trim() && value > 0) {
      addProduct({ name: name.trim(), price: value, imageUrl: imageUrl.trim() })
      setName('')
      setPrice('')
      setImageUrl('')
    } else {
      alert('請務必填寫商品名稱與價格，且價格需大於0。')
    }
  }

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const value = parseFloat(editing.price)
    if (editing.name.trim() && value > 0) {
      updateProduct(editing.id, {
        name: editing.name.trim(),
        price: value,
        imageUrl: editing.imageUrl.trim(),
      })
      setEditing(null)
    } else {
      alert('請填寫所有必填欄位，且價格需大於0。')
    }
  }

  const openEdit = (product: Product) =>
    setEditing({
      id: product.id,
      name: product.name,
      price: String(product.price),
      imageUrl: product.imageUrl,
    })

  const handleDeleteProduct = (product: Product) => {
    if (confirm(`確定要刪除 ID 為 ${product.id} 的商品嗎？此操作無法復原。`)) deleteProduct(product.id)
  }

  const handleDeleteUser = (email: string) => {
    if (confirm(`確定要刪除會員 ${email} 嗎？此操作無法復原。`)) deleteUser(email)
  }

  const handleLogout = () => {
    adminLogout()
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-admin text-[#333]">
      <header className="flex items-center justify-between bg-[#343a40] px-8 py-4 text-white max-md:flex-col max-md:gap-4">
        <h1 className="m-0 text-2xl">商店後台儀表板</h1>
        <div className="flex items-center gap-4">
          <a
            href="#/products"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-[#007bff] px-3 py-2 text-[0.9rem] text-white no-underline"
          >
            查看前台
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="w-auto cursor-pointer rounded bg-[#dc3545] px-4 py-2 font-semibold text-white hover:bg-[#c82333]"
          >
            登出
          </button>
        </div>
      </header>

      <main className="p-8 max-md:p-4">
        <section className={sectionClass}>
          <h2 className="mt-0 mb-6 border-b border-[#eee] pb-4">商品管理</h2>
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-1 items-end gap-[15px] min-[769px]:grid-cols-2 min-[993px]:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div>
              <label htmlFor="product-name" className={labelClass}>商品名稱</label>
              <input id="product-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="product-price" className={labelClass}>商品價格</label>
              <input
                id="product-price"
                type="number"
                required
                min={0}
                step={1}
                placeholder="只能輸入數字"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="min-[769px]:max-[992px]:col-span-full">
              <label htmlFor="product-image" className={labelClass}>商品圖片URL</label>
              <input
                id="product-image"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={inputClass}
              />
            </div>
            <button type="submit" className={primaryButton}>新增商品</button>
          </form>

          <hr className="my-8" />
          <h3>現有商品列表</h3>
          <div className="overflow-x-auto">
            {products.length === 0 ? (
              <p>目前沒有任何商品。請在上方新增商品。</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {['ID', '名稱', '價格', '圖片預覽', '操作'].map((title) => (
                      <th key={title} className={`${cellClass} bg-[#f8f9fa]`}>{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className={cellClass}>{product.id}</td>
                      <td className={cellClass}>{product.name}</td>
                      <td className={cellClass}>{formatPrice(product.price)}</td>
                      <td className={cellClass}>
                        <img src={product.imageUrl || DEFAULT_IMAGE} alt={product.name} width={50} />
                      </td>
                      <td className={cellClass}>
                        <div className="flex gap-[10px]">
                          <button type="button" onClick={() => openEdit(product)} className={`${smallButton} bg-[#ffc107] hover:bg-[#e0a800]`}>修改</button>
                          <button type="button" onClick={() => handleDeleteProduct(product)} className={`${smallButton} bg-[#dc3545] text-white hover:bg-[#c82333]`}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mt-0 mb-6 border-b border-[#eee] pb-4">會員管理</h2>
          <div className="overflow-x-auto">
            {users.length === 0 ? (
              <p>目前沒有已註冊的會員。</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {['電子郵件 (帳號)', '密碼', '操作'].map((title) => (
                      <th key={title} className={`${cellClass} bg-[#f8f9fa]`}>{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.email}>
                      <td className={cellClass}>{user.email}</td>
                      <td className={cellClass}>{user.password}</td>
                      <td className={cellClass}>
                        <div className="flex gap-[10px]">
                          <button type="button" onClick={() => alert('修改會員功能尚未實作。')} className={`${smallButton} bg-[#ffc107] hover:bg-[#e0a800]`}>修改</button>
                          <button type="button" onClick={() => handleDeleteUser(user.email)} className={`${smallButton} bg-[#dc3545] text-white hover:bg-[#c82333]`}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {editing && (
        <div
          className="fixed inset-0 z-[1000] overflow-auto bg-black/60"
          onClick={(event) => event.target === event.currentTarget && setEditing(null)}
        >
          <div className="relative mx-auto my-[10%] w-[90%] max-w-[500px] rounded-lg bg-white p-[30px] shadow-[0_5px_15px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              aria-label="關閉"
              onClick={() => setEditing(null)}
              className="absolute right-5 top-[10px] cursor-pointer text-[28px] font-bold leading-none text-[#aaa] hover:text-black"
            >
              &times;
            </button>
            <h2 className="mt-0">編輯商品</h2>
            <form onSubmit={handleEditSubmit}>
              <div className="mb-5">
                <label htmlFor="edit-product-name" className={labelClass}>商品名稱</label>
                <input id="edit-product-name" type="text" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
              </div>
              <div className="mb-5">
                <label htmlFor="edit-product-price" className={labelClass}>商品價格</label>
                <input id="edit-product-price" type="number" required min={0} step={1} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} className={inputClass} />
              </div>
              <div className="mb-5">
                <label htmlFor="edit-product-image" className={labelClass}>商品圖片URL</label>
                <input id="edit-product-image" type="url" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" className={primaryButton}>儲存變更</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
