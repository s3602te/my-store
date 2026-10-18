/**
 * 網站文字設定檔 —— 想改網站上看到的任何文字,只要改這個檔案。
 *
 * - 改店名:只要改下面的 `name`,頁首標題、瀏覽器分頁標題、頁尾版權、關於我們等都會一起更新。
 * - 文字裡想放店名,請用 `${name}`(要用反引號 ` 包起來),不要直接把店名寫死。
 * - 存檔後,本機預覽 (npm run dev) 會立刻更新;線上網站需要 push 後重新部署才會生效。
 */

// ★ 店名:改這裡就好
const name = '我的線上商店'

export const site = {
  name,
  year: 2024,
  currency: 'NT$',

  /** 頁尾 */
  footer: { copyright: '版權所有.' },

  /** 頁首與導覽列 */
  header: {
    adminLink: '後台登入',
    adminLinkTitle: '前往後台管理',
    openMenu: '開啟選單',
    closeMenu: '關閉選單',
  },
  nav: {
    home: '首頁',
    products: '產品',
    about: '關於我們',
    contact: '聯絡我們',
    login: '登入/註冊',
    member: '會員中心',
    cart: '購物車',
  },
  backToTop: '回到頂部',

  /** 商品列表與卡片 */
  home: { title: '熱門商品' },
  productsPage: { pageTitle: '所有產品', title: '所有產品' },
  productList: { empty: '目前店家尚未上架商品喔！' },
  productCard: { detail: '商品詳情', addToCart: '加入購物車' },
  productDetail: {
    pageTitle: '商品詳情',
    addToCart: '加入購物車',
    noDescription: '店家尚未提供詳細描述。',
    notFoundTitle: '找不到商品',
    notFoundText: '您要找的商品可能已經下架或不存在。',
    backToList: '回到商品列表',
  },
  addedToCart: (productName: string) => `${productName} 已加入購物車`,

  /** 關於我們 */
  about: {
    title: '關於我們',
    paragraphs: [
      `歡迎來到「${name}」！我們致力於提供最優質的商品與最貼心的服務。`,
      '我們的故事始於2024年，由一群對電子商務充滿熱情的開發者創立。我們的目標是打造一個不僅美觀，而且功能強大、使用者體驗一流的購物平台。',
      '感謝您的支持，希望您在這裡能找到心儀的商品！',
    ],
  },

  /** 聯絡我們 */
  contact: {
    title: '聯絡我們',
    intro: '有任何問題或建議嗎？歡迎填寫下方的表單與我們聯繫！',
    name: '您的姓名',
    email: '您的電子郵件',
    message: '您的訊息',
    submit: '送出訊息',
    allRequired: '所有欄位都必須填寫！',
    success: '感謝您的訊息，我們會盡快與您聯繫！',
  },

  /** 會員登入 */
  login: {
    pageTitle: '登入/註冊',
    title: '會員登入',
    email: '電子郵件',
    password: '密碼',
    submit: '登入',
    noAccount: '還沒有帳號嗎？',
    registerLink: '立即註冊',
    missingFields: '請輸入電子郵件和密碼。',
    wrongCredentials: '電子郵件或密碼錯誤。',
    success: '登入成功！歡迎回來！',
  },

  /** 會員註冊 */
  register: {
    pageTitle: '註冊',
    title: '會員註冊',
    email: '電子郵件',
    password: '設定密碼',
    confirmPassword: '確認密碼',
    submit: '建立帳號',
    hasAccount: '已經有帳號了嗎？',
    loginLink: '立即登入',
    passwordMismatch: '兩次輸入的密碼不一致！',
    passwordTooShort: '密碼長度至少需要6個字元。',
    invalidEmail: '請輸入有效的電子郵件格式。',
    emailExists: '這個電子郵件已經被註冊了。',
    success: '註冊成功！頁面將跳轉至登入頁...',
  },

  /** 會員中心 */
  member: {
    pageTitle: '會員中心',
    title: '會員中心',
    infoTitle: '會員資訊',
    emailLabel: '電子郵件:',
    logout: '登出',
    loggedOut: '您已成功登出。',
    historyTitle: '購買紀錄',
    noOrders: '您目前沒有任何購買紀錄。',
    orderDate: '訂單日期:',
    orderTotal: '訂單總額:',
  },

  /** 購物車 */
  cart: {
    title: '您的購物車',
    empty: '您的購物車是空的。',
    subtotal: '小計:',
    removeItem: '移除商品',
    total: '總計:',
    checkout: '前往結帳',
    close: '關閉',
    needLogin: '請先登入會員再進行結帳！',
    emptyAlert: '您的購物車是空的！',
    checkoutSuccess: '結帳成功！感謝您的購買！',
  },

  /** 後台 */
  admin: {
    login: {
      pageTitle: '後台登入',
      title: '商店後台登入',
      username: '帳號',
      password: '密碼',
      submit: '登入',
      wrongCredentials: '帳號或密碼錯誤！',
    },
    dashboard: {
      pageTitle: '商店後台',
      title: '商店後台儀表板',
      viewSite: '查看前台',
      logout: '登出',
      pleaseLogin: '請先登入！',
      close: '關閉',
      edit: '修改',
      delete: '刪除',
    },
    products: {
      title: '商品管理',
      name: '商品名稱',
      price: '商品價格',
      pricePlaceholder: '只能輸入數字',
      image: '商品圖片URL',
      add: '新增商品',
      listTitle: '現有商品列表',
      empty: '目前沒有任何商品。請在上方新增商品。',
      columns: ['ID', '名稱', '價格', '圖片預覽', '操作'],
      invalidAdd: '請務必填寫商品名稱與價格，且價格需大於0。',
      confirmDelete: (id: string) => `確定要刪除 ID 為 ${id} 的商品嗎？此操作無法復原。`,
    },
    editProduct: {
      title: '編輯商品',
      save: '儲存變更',
      invalid: '請填寫所有必填欄位，且價格需大於0。',
    },
    users: {
      title: '會員管理',
      empty: '目前沒有已註冊的會員。',
      columns: ['電子郵件 (帳號)', '密碼', '操作'],
      editNotImplemented: '修改會員功能尚未實作。',
      confirmDelete: (email: string) => `確定要刪除會員 ${email} 嗎？此操作無法復原。`,
    },
  },
}

/** 帶幣別符號的價格,例如 NT$ 1,000 */
export const formatPrice = (value: number) => `${site.currency} ${value.toLocaleString()}`
