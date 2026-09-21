import { describe, expect, it } from 'vitest'
import { buildIndexFromFileMap, rippleFrom } from '../src/deps.js'

function fileMap(obj: Record<string, string>) {
  return new Map(Object.entries(obj))
}

function importersOf(index: ReturnType<typeof buildIndexFromFileMap>, target: string): string[] {
  return [...(index.reverseDeps.get(target) ?? [])].sort()
}

describe('multi-language reverse dependency index', () => {
  it('indexes Java imports and Android type mentions', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'app/src/main/java/com/ex/pay/PayViewModel.java':
          'package com.ex.pay; class PayViewModel {}',
        'app/src/main/java/com/ex/pay/PayActivity.java': `
          package com.ex.pay;
          import com.ex.order.OrderRepo;
          class PayActivity { PayViewModel vm; }
        `,
        'app/src/main/java/com/ex/order/OrderRepo.java':
          'package com.ex.order; public class OrderRepo {}',
      }),
    )
    expect(importersOf(index, 'app/src/main/java/com/ex/pay/PayViewModel.java')).toEqual([
      'app/src/main/java/com/ex/pay/PayActivity.java',
    ])
    expect(importersOf(index, 'app/src/main/java/com/ex/order/OrderRepo.java')).toEqual([
      'app/src/main/java/com/ex/pay/PayActivity.java',
    ])
  })

  it('indexes Swift types and Objective-C interop', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'ios/App/Payment/PayViewController.swift': `
          import UIKit
          class PayViewController: UIViewController {
            let vm: PayViewModel
          }
        `,
        'ios/App/Payment/PayViewModel.swift': 'class PayViewModel {}',
        'ios/App/Legacy/OldCart.h': '@interface OldCart : NSObject @end',
        'ios/App/Legacy/CartBridge.swift': `
          class CartBridge {
            let old: OldCart
          }
        `,
      }),
    )
    expect(importersOf(index, 'ios/App/Payment/PayViewModel.swift')).toEqual([
      'ios/App/Payment/PayViewController.swift',
    ])
    expect(importersOf(index, 'ios/App/Legacy/OldCart.h')).toEqual([
      'ios/App/Legacy/CartBridge.swift',
    ])
  })

  it('indexes Dart package, relative imports and part', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'lib/src/cart/cart_repo.dart': 'class CartRepo {}',
        'lib/src/cart/cart_service.dart': `
          import 'package:shop/src/cart/cart_repo.dart';
          import '../util/format.dart';
          part 'cart_extra.dart';
          class CartService {}
        `,
        'lib/src/util/format.dart': 'String money(num v) => "";',
        'lib/src/cart/cart_extra.dart': "part of 'cart_service.dart';",
      }),
    )
    expect(importersOf(index, 'lib/src/cart/cart_repo.dart')).toEqual([
      'lib/src/cart/cart_service.dart',
    ])
    expect(importersOf(index, 'lib/src/util/format.dart')).toEqual([
      'lib/src/cart/cart_service.dart',
    ])
    expect(importersOf(index, 'lib/src/cart/cart_extra.dart')).toEqual([
      'lib/src/cart/cart_service.dart',
    ])
  })

  it('indexes TS/JS import, require and @/ aliases', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'src/utils/format.ts': 'export const f = () => 1',
        'src/api/order.js': 'module.exports = {}',
        'src/components/Pay.tsx': `
          import { f } from '@/utils/format'
          const order = require('../api/order')
          const lazy = import('./dialog/PayDialog')
          export { Button } from "./ui/Button";
        `,
        'src/components/dialog/PayDialog.tsx': 'export default function PayDialog() {}',
        'src/components/ui/Button.jsx': 'export const Button = () => null',
      }),
    )
    expect(importersOf(index, 'src/utils/format.ts')).toEqual([
      'src/components/Pay.tsx',
    ])
    expect(importersOf(index, 'src/api/order.js')).toEqual(['src/components/Pay.tsx'])
    expect(importersOf(index, 'src/components/dialog/PayDialog.tsx')).toEqual([
      'src/components/Pay.tsx',
    ])
    expect(importersOf(index, 'src/components/ui/Button.jsx')).toEqual([
      'src/components/Pay.tsx',
    ])
  })

  it('indexes Vue SFC script imports and template components', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'src/components/PayButton.vue': '<template><button>pay</button></template>',
        'src/use/order.ts': 'export function useOrder() {}',
        'src/views/PayView.vue': `
          <template>
            <PayButton />
            <pay-button />
          </template>
          <script setup>
          import PayButton from '@/components/PayButton.vue'
          import { useOrder } from '@/use/order'
          </script>
        `,
      }),
    )
    expect(importersOf(index, 'src/components/PayButton.vue')).toEqual([
      'src/views/PayView.vue',
    ])
    expect(importersOf(index, 'src/use/order.ts')).toEqual(['src/views/PayView.vue'])
  })

  it('links stylesheets to components via @import/url and class names', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'src/styles/variables.scss': '$brand: red;',
        'src/icons/logo.svg': '<svg/>',
        'src/styles/pay.scss': `
          @use './variables' as v;
          .pay-btn-primary { background: url('../icons/logo.svg'); }
          #pay-root {}
        `,
        'src/views/PayView.vue': `
          <template><div id="pay-root" class="pay-btn-primary">pay</div></template>
        `,
      }),
    )
    expect(importersOf(index, 'src/styles/variables.scss')).toEqual([
      'src/styles/pay.scss',
    ])
    expect(importersOf(index, 'src/icons/logo.svg')).toEqual(['src/styles/pay.scss'])
    expect(importersOf(index, 'src/styles/pay.scss')).toEqual(['src/views/PayView.vue'])
  })

  it('indexes HTML link/script references', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'web/index.html': `
          <link href="./styles/app.css" rel="stylesheet">
          <script src="./js/app.js"></script>
        `,
        'web/styles/app.css': '.x{}',
        'web/js/app.js': 'console.log(1)',
      }),
    )
    expect(importersOf(index, 'web/styles/app.css')).toEqual(['web/index.html'])
    expect(importersOf(index, 'web/js/app.js')).toEqual(['web/index.html'])
  })

  it('produces two-layer ripple for web modules', () => {
    const index = buildIndexFromFileMap(
      fileMap({
        'src/utils/format.ts': 'export const f = 1',
        'src/api/order.ts': `import { f } from '../utils/format'`,
        'src/views/PayView.tsx': `import { order } from '../api/order'`,
        'src/router.ts': `import PayView from './views/PayView'`,
      }),
    )
    const ripple = rippleFrom(['src/utils/format.ts'], index.reverseDeps, 2)
    expect([...ripple.keys()]).toEqual([
      'src/api/order.ts',
      'src/views/PayView.tsx',
    ])
  })
})
