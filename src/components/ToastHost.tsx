import { useStore } from '../store/StoreContext'

export default function ToastHost() {
  const { toasts } = useStore()

  return (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          role="status"
          style={{ marginBottom: index * 60 }}
          className="fixed bottom-5 left-1/2 z-[1000] -translate-x-1/2 animate-toast rounded-[5px] bg-chiikawa-green px-[25px] py-[15px] text-white opacity-0 shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
        >
          {toast.message}
        </div>
      ))}
    </>
  )
}
