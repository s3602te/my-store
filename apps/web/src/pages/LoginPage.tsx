import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormCard, FormField, SubmitButton } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'
import { useStore } from '../store/StoreContext'

export default function LoginPage() {
  usePageTitle(site.login.pageTitle)
  const { login, notify } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      alert(site.login.missingFields)
      return
    }
    if (!login(trimmedEmail, trimmedPassword)) {
      alert(site.login.wrongCredentials)
      return
    }
    notify(site.login.success)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <>
      <h2>{site.login.title}</h2>
      <FormCard onSubmit={handleSubmit}>
        <FormField label={site.login.email} id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label={site.login.password} id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton>{site.login.submit}</SubmitButton>
      </FormCard>
      <p className="mt-5 text-center">
        {site.login.noAccount}{' '}
        <Link to="/register" className="text-link">{site.login.registerLink}</Link>
      </p>
    </>
  )
}
