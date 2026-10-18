import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../../hooks/usePageTitle'
import { site } from '../../siteContent'
import { useStore } from '../../store/StoreContext'

export default function AdminLoginPage() {
  usePageTitle(site.admin.login.pageTitle)
  const { isAdmin, adminLogin } = useStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  if (isAdmin) return <Navigate to="/admin/dashboard" replace />

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (adminLogin(username, password)) navigate('/admin/dashboard')
    else alert(site.admin.login.wrongCredentials)
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-admin text-[#333]">
      <div className="mx-auto my-[100px] w-full max-w-[360px] rounded-lg bg-white p-10 text-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:my-10">
        <h2 className="mb-6">{site.admin.login.title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-5 text-left">
            <label htmlFor="username" className="mb-2 block font-semibold">{site.admin.login.username}</label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="box-border w-full rounded border border-[#ccc] p-[10px]"
            />
          </div>
          <div className="mb-5 text-left">
            <label htmlFor="password" className="mb-2 block font-semibold">{site.admin.login.password}</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="box-border w-full rounded border border-[#ccc] p-[10px]"
            />
          </div>
          <button
            type="submit"
            className="w-full cursor-pointer rounded bg-[#007bff] p-3 text-base font-semibold text-white hover:bg-[#0056b3]"
          >
            {site.admin.login.submit}
          </button>
        </form>
      </div>
    </div>
  )
}
