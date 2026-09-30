/**
 * Platform adapter registry — the single horizontal extension point.
 */
import type { PlatformAdapter } from './adapters/adapter-types.js'
import { androidXmlAdapter } from './adapters/android-xml.js'
import { androidComposeAdapter } from './adapters/android-compose.js'
import { androidViewJavaAdapter, androidViewKotlinAdapter } from './adapters/android-view.js'
import { iosXibAdapter } from './adapters/ios-xib.js'
import { iosSwiftuiAdapter } from './adapters/ios-swiftui.js'
import { iosUikitObjcAdapter, iosUikitSwiftAdapter } from './adapters/ios-uikit.js'
import { flutterAdapter } from './adapters/flutter.js'
import { reactNativeAdapter } from './adapters/react-native.js'
import { harmonyArkuiAdapter } from './adapters/harmony-arkui.js'
import { webHtmlAdapter } from './adapters/web-html.js'
import { webVueAdapter } from './adapters/web-vue.js'
import { webReactAdapter } from './adapters/web-react.js'
import { webSvelteAdapter } from './adapters/web-svelte.js'
import { webAngularAdapter } from './adapters/web-angular.js'
import {
  miniprogramWxmlAdapter,
  miniprogramAxmlAdapter,
  miniprogramTtmlAdapter,
  miniprogramSwanAdapter,
} from './adapters/miniprogram.js'
import { uniAppAdapter } from './adapters/uni-app.js'
import { taroAdapter } from './adapters/taro.js'
import { mauiXamlAdapter } from './adapters/maui-xaml.js'

const REGISTRY: PlatformAdapter[] = [
  androidXmlAdapter,
  iosXibAdapter,
  webHtmlAdapter,
  webVueAdapter,
  webReactAdapter,
  webSvelteAdapter,
  webAngularAdapter,
  uniAppAdapter,
  taroAdapter,
  miniprogramWxmlAdapter,
  miniprogramAxmlAdapter,
  miniprogramTtmlAdapter,
  miniprogramSwanAdapter,
  mauiXamlAdapter,
  androidComposeAdapter,
  iosSwiftuiAdapter,
  androidViewJavaAdapter,
  androidViewKotlinAdapter,
  iosUikitObjcAdapter,
  iosUikitSwiftAdapter,
  flutterAdapter,
  reactNativeAdapter,
  harmonyArkuiAdapter,
]

export function platformAdapters(): PlatformAdapter[] {
  return REGISTRY
}

export function getPlatformAdapter(id: string): PlatformAdapter | undefined {
  return REGISTRY.find((a) => a.id === id)
}

export { type PlatformAdapter }
