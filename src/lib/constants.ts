export const SITE_NAME = '我的線上商店'

/** 商品沒有填圖片時的預設圖(內嵌 SVG,不依賴外部服務) */
export const DEFAULT_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250">' +
      '<rect width="100%" height="100%" fill="#f7c5cc"/>' +
      '<text x="50%" y="50%" fill="#5c5c5c" font-family="sans-serif" font-size="24" ' +
      'text-anchor="middle" dominant-baseline="middle">No Image</text></svg>',
  )

export const formatPrice = (value: number) => `NT$ ${value.toLocaleString()}`
