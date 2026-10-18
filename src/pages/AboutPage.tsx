import { usePageTitle } from '../hooks/usePageTitle'

export default function AboutPage() {
  usePageTitle('關於我們')

  return (
    <>
      <h2>關於我們</h2>
      <p>歡迎來到「我的線上商店」！我們致力於提供最優質的商品與最貼心的服務。</p>
      <p>
        我們的故事始於2024年，由一群對電子商務充滿熱情的開發者創立。我們的目標是打造一個不僅美觀，而且功能強大、使用者體驗一流的購物平台。
      </p>
      <p>感謝您的支持，希望您在這裡能找到心儀的商品！</p>
    </>
  )
}
