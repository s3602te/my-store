import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormCard, FormField, SubmitButton } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'
import { useStore } from '../store/StoreContext'

export default function RegisterPage() {
  usePageTitle(site.register.pageTitle)
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
      alert(site.register.passwordMismatch)
      return
    }
    if (password.length < 6) {
      alert(site.register.passwordTooShort)
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      alert(site.register.invalidEmail)
      return
    }
    if (!registerUser(trimmedEmail, password)) {
      alert(site.register.emailExists)
      return
    }

    notify(site.register.success)
    setTimeout(() => navigate('/login'), 2000)
  }

  return (
    <>
      <h2>{site.register.title}</h2>
      <FormCard onSubmit={handleSubmit}>
        <FormField label={site.register.email} id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label={site.register.password} id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormField label={site.register.confirmPassword} id="confirm-password" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <SubmitButton>{site.register.submit}</SubmitButton>
      </FormCard>
      <p className="mt-5 text-center">
        {site.register.hasAccount}{' '}
        <Link to="/login" className="text-link">{site.register.loginLink}</Link>
      </p>
    </>
  )
}
