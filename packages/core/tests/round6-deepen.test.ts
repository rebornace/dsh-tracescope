import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { normalizeMauiXaml } from '../src/design/adapters/maui-xaml.js'
import { parseCssLength } from '../src/design/adapters/web-css.js'
import { miniprogramToDesignDoc } from '../src/design/adapters/miniprogram-shared.js'

describe('constraint chain weights', () => {
  it('splits remaining width by horizontal weights', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const doc = normalizeAndroidLayout(
      `<androidx.constraintlayout.widget.ConstraintLayout
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="300dp"
        android:layout_height="100dp">
        <View
          android:id="@+id/a"
          android:layout_width="0dp"
          android:layout_height="40dp"
          app:layout_constraintHorizontal_weight="1"
          app:layout_constraintStart_toStartOf="parent"
          app:layout_constraintEnd_toStartOf="@+id/b"
          app:layout_constraintTop_toTopOf="parent"
          app:layout_constraintHorizontal_chainStyle="spread" />
        <View
          android:id="@+id/b"
          android:layout_width="0dp"
          android:layout_height="40dp"
          app:layout_constraintHorizontal_weight="2"
          app:layout_constraintStart_toEndOf="@+id/a"
          app:layout_constraintEnd_toEndOf="parent"
          app:layout_constraintTop_toTopOf="parent" />
      </androidx.constraintlayout.widget.ConstraintLayout>`,
      resources,
    )
    const a = doc.root.children.find((n) => n.id === 'a')!
    const b = doc.root.children.find((n) => n.id === 'b')!
    expect(a.box.width).toBe(100)
    expect(b.box.width).toBe(200)
  })
})

describe('maui visual state normal setters', () => {
  it('applies Normal BackgroundColor / TextColor', () => {
    const doc = normalizeMauiXaml(
      `<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
  <Button Text="欢迎">
    <VisualStateManager.VisualStateGroups>
      <VisualStateGroup>
        <VisualState x:Name="Normal">
          <VisualState.Setters>
            <Setter Property="BackgroundColor" Value="#112233" />
            <Setter Property="TextColor" Value="#abcdef" />
            <Setter Property="FontSize" Value="18" />
          </VisualState.Setters>
        </VisualState>
        <VisualState x:Name="Pressed">
          <VisualState.Setters>
            <Setter Property="BackgroundColor" Value="#000000" />
          </VisualState.Setters>
        </VisualState>
      </VisualStateGroup>
    </VisualStateManager.VisualStateGroups>
  </Button>
</ContentPage>`,
      'Home',
    )
    const btn =
      doc.root.kind === 'text'
        ? doc.root
        : doc.root.children.find((c) => c.text === '欢迎') ?? doc.root.children[0]
    expect(btn?.style.backgroundColor).toBe('#112233')
    expect(btn?.style.color).toBe('#abcdef')
    expect(btn?.style.fontSize).toBe(18)
  })
})

describe('miniprogram rpx lengths', () => {
  it('converts rpx to logical px at 750→375 scale', () => {
    expect(parseCssLength('32rpx')).toBe(16)
    expect(parseCssLength('32upx')).toBe(16)
    const doc = miniprogramToDesignDoc(
      `<view class="title">欢迎</view>`,
      `.title { font-size: 32rpx; padding: 16rpx; color: #112233 }`,
      'Home',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎')
    expect(node?.style.fontSize).toBe(16)
    expect(node?.style.paddingTop).toBe(8)
  })
})
