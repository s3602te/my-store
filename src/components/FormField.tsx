import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldClass = 'box-border w-full rounded border border-[#ddd] p-3'

export function FormField({
  label,
  id,
  ...props
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block font-bold">{label}</label>
      <input id={id} name={id} className={fieldClass} {...props} />
    </div>
  )
}

export function TextAreaField({
  label,
  id,
  ...props
}: { label: string; id: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block font-bold">{label}</label>
      <textarea id={id} name={id} className={fieldClass} {...props} />
    </div>
  )
}

/** 表單卡片外框(原本的 .contact-form) */
export function FormCard({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className="mx-auto my-5 max-w-[600px] rounded-lg bg-white p-5 shadow-[0_2px_5px_rgba(0,0,0,0.1)]" {...props}>
      {children}
    </form>
  )
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="block w-full cursor-pointer rounded-full bg-chiikawa-blue p-[15px] text-[1.1rem] text-white transition-colors duration-300 hover:bg-chiikawa-blue-dark"
    >
      {children}
    </button>
  )
}
