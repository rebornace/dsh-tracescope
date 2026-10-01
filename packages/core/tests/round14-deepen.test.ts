import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { extractFlexGapHint } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android animation-list drawable', () => {
  it('takes the first frame fill', () => {
    const resources = buildAndroidResources(
      `<resources><color name="frame0">#112233</color><color name="frame1">#abcdef</color></resources>`,
    )
    const anim = parseAndroidShapeDrawable(
      `<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">
        <item android:duration="200">
          <shape><solid android:color="@color/frame0"/><corners android:radius="2dp"/></shape>
        </item>
        <item android:duration="200">
          <shape><solid android:color="@color/frame1"/></shape>
        </item>
      </animation-list>`,
      resources,
    )
    expect(anim?.backgroundColor).toBe('#112233')
    expect(anim?.cornerRadius).toBe(2)
    resources.drawables.pulse = anim!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:background="@drawable/pulse" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
  })
})

describe('compose PaddingValues', () => {
  it('parses all / horizontal-vertical / start-top-end-bottom', () => {
    const all = composeSourceToDesignDoc(
      `Text("欢迎", modifier = Modifier.padding(PaddingValues(16.dp)))`,
      'Home',
    )
    expect(all.root.children[0]?.style.paddingTop).toBe(16)
    expect(all.root.children[0]?.style.paddingLeft).toBe(16)

    const hv = composeSourceToDesignDoc(
      `Text("标题", modifier = Modifier.padding(PaddingValues(horizontal = 12.dp, vertical = 8.dp)))`,
      'Home',
    )
    expect(hv.root.children[0]?.style.paddingLeft).toBe(12)
    expect(hv.root.children[0]?.style.paddingTop).toBe(8)

    const sides = composeSourceToDesignDoc(
      `Text("卡片", modifier = Modifier.padding(PaddingValues(start = 4.dp, top = 6.dp, end = 8.dp, bottom = 10.dp)))`,
      'Home',
    )
    expect(sides.root.children[0]?.style.paddingLeft).toBe(4)
    expect(sides.root.children[0]?.style.paddingTop).toBe(6)
    expect(sides.root.children[0]?.style.paddingRight).toBe(8)
    expect(sides.root.children[0]?.style.paddingBottom).toBe(10)
  })
})

describe('css align-items / place-items', () => {
  it('centers cross-axis when align-items is center', () => {
    expect(
      extractFlexGapHint(
        '.col { display: flex; flex-direction: column; gap: 8px; align-items: center }',
      ),
    ).toEqual({ gap: 8, direction: 'column', alignItems: 'center', justifyContent: 'start' })

    const doc = markupToDesignDoc(
      `<div class="wide">宽</div><div class="narrow">窄</div>`,
      `.list { display: flex; flex-direction: column; gap: 10px; place-items: center }
       .wide { height: 40px; width: 100px; color: #112233 }
       .narrow { height: 30px; width: 40px; color: #112233 }`,
      'Home',
    )
    const wide = doc.root.children.find((n) => n.text === '宽')
    const narrow = doc.root.children.find((n) => n.text === '窄')
    expect(wide?.box.y).toBe(0)
    expect(wide?.box.x).toBe(0)
    expect(narrow?.box.y).toBe(50)
    expect(narrow?.box.x).toBe(30)
  })
})
