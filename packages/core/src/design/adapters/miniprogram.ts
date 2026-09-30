/**
 * Miniprogram adapters (WeChat / Alipay / Douyin / Baidu).
 */
import { createMiniprogramAdapter } from './miniprogram-factory.js'

export const miniprogramWxmlAdapter = createMiniprogramAdapter({
  id: 'miniprogram-wxml',
  kindLabel: '小程序 WXML',
  markupExt: 'wxml',
  styleExt: 'wxss',
})

export const miniprogramAxmlAdapter = createMiniprogramAdapter({
  id: 'miniprogram-axml',
  kindLabel: '小程序 AXML',
  markupExt: 'axml',
  styleExt: 'acss',
})

export const miniprogramTtmlAdapter = createMiniprogramAdapter({
  id: 'miniprogram-ttml',
  kindLabel: '小程序 TTML',
  markupExt: 'ttml',
  styleExt: 'ttss',
})

export const miniprogramSwanAdapter = createMiniprogramAdapter({
  id: 'miniprogram-swan',
  kindLabel: '小程序 Swan',
  markupExt: 'swan',
  styleExt: 'css',
})
