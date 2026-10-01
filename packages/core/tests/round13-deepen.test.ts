import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import {
  extractFlexGapHint,
  parseCssDeclarations,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android transition drawable', () => {
  it('takes the first (from) item fill', () => {
    const resources = buildAndroidResources(
      `<resources>
        <color name="on">#112233</color>
        <color name="off">#eeeeee</color>
      </resources>`,
    )
    const tr = parseAndroidShapeDrawable(
      `<transition xmlns:android="http://schemas.android.com/apk/res/android">
        <item>
          <shape><solid android:color="@color/on"/><corners android:radius="6dp"/></shape>
        </item>
        <item>
          <shape><solid android:color="@color/off"/></shape>
        </item>
      </transition>`,
      resources,
    )
    expect(tr?.backgroundColor).toBe('#112233')
    expect(tr?.cornerRadius).toBe(6)
    resources.drawables.toggle = tr!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="40dp"
        android:layout_height="24dp"
        android:background="@drawable/toggle" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
  })
})

describe('swiftui EdgeInsets padding', () => {
  it('maps EdgeInsets top/leading/bottom/trailing', () => {
    const doc = swiftuiSourceToDesignDoc(
      `Text("欢迎").padding(EdgeInsets(top: 8, leading: 12, bottom: 4, trailing: 16)).font(.body)`,
      'Home',
    )
    expect(doc.root.children[0]?.style.paddingTop).toBe(8)
    expect(doc.root.children[0]?.style.paddingLeft).toBe(12)
    expect(doc.root.children[0]?.style.paddingBottom).toBe(4)
    expect(doc.root.children[0]?.style.paddingRight).toBe(16)
  })
})

describe('css gap / flex layout', () => {
  it('parses gap and stacks flex column siblings', () => {
    expect(parseCssDeclarations('gap: 12px').style.gap).toBe(12)
    expect(extractFlexGapHint('.row { display: flex; gap: 8px; flex-direction: column }')).toEqual({
      gap: 8,
      direction: 'column',
      alignItems: 'stretch',
      justifyContent: 'start',
    })
    const doc = markupToDesignDoc(
      `<div class="a">一</div><div class="b">二</div>`,
      `.list { display: flex; flex-direction: column; gap: 10px }
       .a { height: 40px; width: 100px; color: #112233 }
       .b { height: 30px; width: 100px; color: #112233 }`,
      'Home',
    )
    const a = doc.root.children.find((n) => n.text === '一')
    const b = doc.root.children.find((n) => n.text === '二')
    expect(a?.box.y).toBe(0)
    expect(b?.box.y).toBe(50)
    expect(a?.style.gap).toBeUndefined()
  })
})
