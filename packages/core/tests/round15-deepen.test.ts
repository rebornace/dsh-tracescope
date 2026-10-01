import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { flutterSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { extractFlexGapHint } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android ripple drawable', () => {
  it('uses content fill and mask cornerRadius, skips mask black', () => {
    const resources = buildAndroidResources(
      `<resources><color name="card">#112233</color><color name="ripple">#33ffffff</color></resources>`,
    )
    const ripple = parseAndroidShapeDrawable(
      `<ripple xmlns:android="http://schemas.android.com/apk/res/android"
        android:color="@color/ripple">
        <item android:id="@android:id/mask">
          <shape android:shape="rectangle">
            <solid android:color="#000000"/>
            <corners android:radius="8dp"/>
          </shape>
        </item>
        <item>
          <shape android:shape="rectangle">
            <solid android:color="@color/card"/>
          </shape>
        </item>
      </ripple>`,
      resources,
    )
    expect(ripple?.backgroundColor).toBe('#112233')
    expect(ripple?.cornerRadius).toBe(8)
    resources.drawables.btn = ripple!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="80dp"
        android:layout_height="40dp"
        android:background="@drawable/btn" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(8)
  })
})

describe('flutter EdgeInsets.fromLTRB', () => {
  it('maps LTRB / STEb / only', () => {
    const ltrb = flutterSourceToDesignDoc(
      `Padding(
        padding: EdgeInsets.fromLTRB(8, 4, 12, 6),
        child: Text('欢迎'),
      )`,
      'Home',
    )
    expect(ltrb.root.children[0]?.style.paddingLeft).toBe(8)
    expect(ltrb.root.children[0]?.style.paddingTop).toBe(4)
    expect(ltrb.root.children[0]?.style.paddingRight).toBe(12)
    expect(ltrb.root.children[0]?.style.paddingBottom).toBe(6)

    const only = flutterSourceToDesignDoc(
      `Container(
        width: 100,
        height: 40,
        padding: EdgeInsets.only(left: 10, top: 2),
        child: Text('卡片'),
      )`,
      'Home',
    )
    expect(only.root.children[0]?.style.paddingLeft).toBe(10)
    expect(only.root.children[0]?.style.paddingTop).toBe(2)
  })
})

describe('css justify-content', () => {
  it('centers the packed column inside the default container height', () => {
    expect(
      extractFlexGapHint(
        '.col { display: flex; flex-direction: column; gap: 10px; justify-content: center }',
      ),
    ).toEqual({
      gap: 10,
      direction: 'column',
      alignItems: 'stretch',
      justifyContent: 'center',
    })

    const doc = markupToDesignDoc(
      `<div class="a">一</div><div class="b">二</div>`,
      `.list { display: flex; flex-direction: column; gap: 10px; justify-content: center }
       .a { height: 40px; width: 100px; color: #112233 }
       .b { height: 30px; width: 100px; color: #112233 }`,
      'Home',
    )
    // packed = 40+10+30 = 80; container 640; offset = (640-80)/2 = 280
    const a = doc.root.children.find((n) => n.text === '一')
    const b = doc.root.children.find((n) => n.text === '二')
    expect(a?.box.y).toBe(280)
    expect(b?.box.y).toBe(330)
  })
})
