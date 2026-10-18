import { useState, type FormEvent } from 'react'
import { FormCard, FormField, SubmitButton, TextAreaField } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { site } from '../siteContent'
import { useStore } from '../store/StoreContext'

export default function ContactPage() {
  usePageTitle(site.contact.title)
  const { notify } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) {
      alert(site.contact.allRequired)
      return
    }
    // 目前是純前端網站,所以只顯示通知;之後接上後端時再把資料送出去
    notify(site.contact.success)
    setName('')
    setEmail('')
    setMessage('')
  }

  return (
    <>
      <h2>{site.contact.title}</h2>
      <p>{site.contact.intro}</p>
      <FormCard onSubmit={handleSubmit}>
        <FormField label={site.contact.name} id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormField label={site.contact.email} id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextAreaField label={site.contact.message} id="message" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />
        <SubmitButton>{site.contact.submit}</SubmitButton>
      </FormCard>
    </>
  )
}
