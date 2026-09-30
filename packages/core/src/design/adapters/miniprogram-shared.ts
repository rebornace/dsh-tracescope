/**
 * Shared miniprogram markup helpers (WeChat / Alipay / Douyin / Baidu).
 */
import type { PageFingerprint } from './adapter-types.js'
import { tokenizeName } from '../page-fingerprint.js'
import {
  collectMarkupTexts,
  countMarkupControls,
  markupToDesignDoc,
} from './web-markup.js'
import type { DesignDoc } from '../types.js'

/** Map common miniprogram tags to HTML-ish tags for the shared markup converter. */
export function miniprogramToHtmlish(markup: string): string {
  return markup
    .replace(/<\/?view\b/gi, (m) => m.replace(/view/i, 'div'))
    .replace(/<\/?text\b/gi, (m) => m.replace(/text/i, 'span'))
    .replace(/<\/?image\b/gi, (m) => m.replace(/image/i, 'img'))
    .replace(/<\/?navigator\b/gi, (m) => m.replace(/navigator/i, 'a'))
    .replace(/<\/?view-container\b/gi, (m) => m.replace(/view-container/i, 'div'))
}

export function miniprogramFingerprint(
  markup: string,
  css: string,
  fileBase: string,
  ext: string,
): PageFingerprint {
  const htmlish = miniprogramToHtmlish(markup)
  return {
    texts: collectMarkupTexts(htmlish + '\n' + css),
    nameTokens: tokenizeName(fileBase.replace(new RegExp(`\\.${ext}$`, 'i'), '')),
    controlCount: countMarkupControls(htmlish),
  }
}

export function miniprogramToDesignDoc(
  markup: string,
  css: string,
  rootName: string,
): DesignDoc {
  return markupToDesignDoc(miniprogramToHtmlish(markup), css, rootName)
}

export const MP_UI_HINT = /<(view|text|button|image|navigator|scroll-view|swiper)\b/i
