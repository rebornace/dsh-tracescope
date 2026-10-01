import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { flutterSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import {
  containerQueryMatches,
  filterContainerQueryBlocks,
  preprocessStylesheet,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android scale drawable', () => {
  it('unwraps nested shape fill ignoring scaleWidth', () => {
    const resources = buildAndroidResources(
      `<resources><color name="fill">#112233</color></resources>`,
    )
    const scaled = parseAndroidShapeDrawable(
      `<scale xmlns:android="http://schemas.android.com/apk/res/android"
        android:scaleWidth="80%"
        android:scaleGravity="left|center_vertical">
        <shape android:shape="rectangle">
          <solid android:color="@color/fill"/>
          <corners android:radius="3dp"/>
        </shape>
      </scale>`,
      resources,
    )
    expect(scaled?.backgroundColor).toBe('#112233')
    expect(scaled?.cornerRadius).toBe(3)
    resources.drawables.scaled_bar = scaled!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="100dp"
        android:layout_height="8dp"
        android:background="@drawable/scaled_bar" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(3)
  })
})

describe('flutter BorderRadius variants', () => {
  it('reads circular / all / only and Container decoration', () => {
    const circular = flutterSourceToDesignDoc(
      `Container(
        width: 100,
        height: 40,
        decoration: BoxDecoration(
          color: Color(0xFF112233),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text('欢迎'),
      )`,
      'Home',
    )
    expect(circular.root.children[0]?.style.cornerRadius).toBe(8)
    expect(circular.root.children[0]?.style.backgroundColor?.toLowerCase()).toMatch(/^#112233/)

    const all = flutterSourceToDesignDoc(
      `Text('卡片', style: TextStyle(fontSize: 14));
       // nearby
       ClipRRect(borderRadius: BorderRadius.all(Radius.circular(12)), child: Text('圆角'))`,
      'Home',
    )
    const rounded = all.root.children.find((n) => n.text === '圆角')
    expect(rounded?.style.cornerRadius).toBe(12)

    const only = flutterSourceToDesignDoc(
      `Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: Color(0xFFABCDEF),
          borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
        ),
      )`,
      'Home',
    )
    const box = only.root.children.find((n) => n.name === 'Container')
    expect(box?.style.cornerRadius).toBe(16)
    expect(box?.style.backgroundColor?.toLowerCase()).toMatch(/^#abcdef/)
  })
})

describe('css @container queries', () => {
  it('keeps matching min-width and drops non-matching', () => {
    expect(containerQueryMatches('@container (min-width: 300px)')).toBe(true)
    expect(containerQueryMatches('@container (min-width: 500px)')).toBe(false)
    expect(containerQueryMatches('@container card (max-width: 30rem)')).toBe(true)
    expect(containerQueryMatches('@container (max-width: 20rem)')).toBe(false)

    const filtered = filterContainerQueryBlocks(`
      .box { color: #111111 }
      @container (min-width: 300px) { .box { color: #112233 } }
      @container (min-width: 500px) { .box { color: #eeeeee } }
    `)
    expect(filtered).toContain('#112233')
    expect(filtered).not.toContain('#eeeeee')

    const sheet = preprocessStylesheet(`
      .box { color: #000000 }
      @container (min-width: 20rem) { .box { color: #abcdef } }
      @container (max-width: 200px) { .box { color: #ffffff } }
    `)
    const doc = markupToDesignDoc(`<div class="box">欢迎</div>`, sheet, 'Home')
    expect(doc.root.children[0]?.style.color).toBe('#abcdef')
  })
})
