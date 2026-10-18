import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormCard, FormField, SubmitButton } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { useStore } from '../store/StoreContext'

export default function LoginPage() {
  usePageTitle('登入/註冊')
  const { login, notify } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      alert('請輸入電子郵件和密碼。')
      return
    }
    if (!login(trimmedEmail, trimmedPassword)) {
      alert('電子郵件或密碼錯誤。')
      return
    }
    notify('登入成功！歡迎回來！')
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <>
      <h2>會員登入</h2>
      <FormCard onSubmit={handleSubmit}>
        <FormField label="電子郵件" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label="密碼" id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton>登入</SubmitButton>
      </FormCard>
      <p className="mt-5 text-center">
        還沒有帳號嗎？ <Link to="/register" className="text-link">立即註冊</Link>
      </p>
    </>
  )
}
