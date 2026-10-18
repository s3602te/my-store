import { useState, type FormEvent } from 'react'
import { FormCard, FormField, SubmitButton, TextAreaField } from '../components/FormField'
import { usePageTitle } from '../hooks/usePageTitle'
import { useStore } from '../store/StoreContext'

export default function ContactPage() {
  usePageTitle('聯絡我們')
  const { notify } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) {
      alert('所有欄位都必須填寫！')
      return
    }
    // 目前是純前端網站,所以只顯示通知;之後接上後端時再把資料送出去
    notify('感謝您的訊息，我們會盡快與您聯繫！')
    setName('')
    setEmail('')
    setMessage('')
  }

  return (
    <>
      <h2>聯絡我們</h2>
      <p>有任何問題或建議嗎？歡迎填寫下方的表單與我們聯繫！</p>
      <FormCard onSubmit={handleSubmit}>
        <FormField label="您的姓名" id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormField label="您的電子郵件" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextAreaField label="您的訊息" id="message" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />
        <SubmitButton>送出訊息</SubmitButton>
      </FormCard>
    </>
  )
}
