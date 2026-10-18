import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../../hooks/usePageTitle'
import { DEFAULT_IMAGE } from '../../lib/constants'
import { formatPrice, site } from '../../siteContent'
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
  usePageTitle(site.admin.dashboard.pageTitle)
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
      alert(site.admin.dashboard.pleaseLogin)
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
      alert(site.admin.products.invalidAdd)
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
      alert(site.admin.editProduct.invalid)
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
    if (confirm(site.admin.products.confirmDelete(product.id))) deleteProduct(product.id)
  }

  const handleDeleteUser = (email: string) => {
    if (confirm(site.admin.users.confirmDelete(email))) deleteUser(email)
  }

  const handleLogout = () => {
    adminLogout()
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-admin text-[#333]">
      <header className="flex items-center justify-between bg-[#343a40] px-8 py-4 text-white max-md:flex-col max-md:gap-4">
        <h1 className="m-0 text-2xl">{site.admin.dashboard.title}</h1>
        <div className="flex items-center gap-4">
          <a
            href="#/products"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-[#007bff] px-3 py-2 text-[0.9rem] text-white no-underline"
          >
            {site.admin.dashboard.viewSite}
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="w-auto cursor-pointer rounded bg-[#dc3545] px-4 py-2 font-semibold text-white hover:bg-[#c82333]"
          >
            {site.admin.dashboard.logout}
          </button>
        </div>
      </header>

      <main className="p-8 max-md:p-4">
        <section className={sectionClass}>
          <h2 className="mt-0 mb-6 border-b border-[#eee] pb-4">{site.admin.products.title}</h2>
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-1 items-end gap-[15px] min-[769px]:grid-cols-2 min-[993px]:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div>
              <label htmlFor="product-name" className={labelClass}>{site.admin.products.name}</label>
              <input id="product-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="product-price" className={labelClass}>{site.admin.products.price}</label>
              <input
                id="product-price"
                type="number"
                required
                min={0}
                step={1}
                placeholder={site.admin.products.pricePlaceholder}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="min-[769px]:max-[992px]:col-span-full">
              <label htmlFor="product-image" className={labelClass}>{site.admin.products.image}</label>
              <input
                id="product-image"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={inputClass}
              />
            </div>
            <button type="submit" className={primaryButton}>{site.admin.products.add}</button>
          </form>

          <hr className="my-8" />
          <h3>{site.admin.products.listTitle}</h3>
          <div className="overflow-x-auto">
            {products.length === 0 ? (
              <p>{site.admin.products.empty}</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {site.admin.products.columns.map((title) => (
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
                          <button type="button" onClick={() => openEdit(product)} className={`${smallButton} bg-[#ffc107] hover:bg-[#e0a800]`}>{site.admin.dashboard.edit}</button>
                          <button type="button" onClick={() => handleDeleteProduct(product)} className={`${smallButton} bg-[#dc3545] text-white hover:bg-[#c82333]`}>{site.admin.dashboard.delete}</button>
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
          <h2 className="mt-0 mb-6 border-b border-[#eee] pb-4">{site.admin.users.title}</h2>
          <div className="overflow-x-auto">
            {users.length === 0 ? (
              <p>{site.admin.users.empty}</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {site.admin.users.columns.map((title) => (
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
                          <button type="button" onClick={() => alert(site.admin.users.editNotImplemented)} className={`${smallButton} bg-[#ffc107] hover:bg-[#e0a800]`}>{site.admin.dashboard.edit}</button>
                          <button type="button" onClick={() => handleDeleteUser(user.email)} className={`${smallButton} bg-[#dc3545] text-white hover:bg-[#c82333]`}>{site.admin.dashboard.delete}</button>
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
              aria-label={site.admin.dashboard.close}
              onClick={() => setEditing(null)}
              className="absolute right-5 top-[10px] cursor-pointer text-[28px] font-bold leading-none text-[#aaa] hover:text-black"
            >
              &times;
            </button>
            <h2 className="mt-0">{site.admin.editProduct.title}</h2>
            <form onSubmit={handleEditSubmit}>
              <div className="mb-5">
                <label htmlFor="edit-product-name" className={labelClass}>{site.admin.products.name}</label>
                <input id="edit-product-name" type="text" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
              </div>
              <div className="mb-5">
                <label htmlFor="edit-product-price" className={labelClass}>{site.admin.products.price}</label>
                <input id="edit-product-price" type="number" required min={0} step={1} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} className={inputClass} />
              </div>
              <div className="mb-5">
                <label htmlFor="edit-product-image" className={labelClass}>{site.admin.products.image}</label>
                <input id="edit-product-image" type="url" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" className={primaryButton}>{site.admin.editProduct.save}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
