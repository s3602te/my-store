import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormCard, FormField, SubmitButton } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { useStore } from '../store/StoreContext'

export default function RegisterPage() {
  usePageTitle('註冊')
  const { registerUser, notify } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()

    // 註冊防呆
    if (password !== confirmPassword) {
      alert('兩次輸入的密碼不一致！')
      return
    }
    if (password.length < 6) {
      alert('密碼長度至少需要6個字元。')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      alert('請輸入有效的電子郵件格式。')
      return
    }
    if (!registerUser(trimmedEmail, password)) {
      alert('這個電子郵件已經被註冊了。')
      return
    }

    notify('註冊成功！頁面將跳轉至登入頁...')
    setTimeout(() => navigate('/login'), 2000)
  }

  return (
    <>
      <h2>會員註冊</h2>
      <FormCard onSubmit={handleSubmit}>
        <FormField label="電子郵件" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label="設定密碼" id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormField label="確認密碼" id="confirm-password" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <SubmitButton>建立帳號</SubmitButton>
      </FormCard>
      <p className="mt-5 text-center">
        已經有帳號了嗎？ <Link to="/login" className="text-link">立即登入</Link>
      </p>
    </>
  )
}
