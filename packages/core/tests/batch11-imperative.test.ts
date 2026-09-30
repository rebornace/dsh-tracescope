import { describe, expect, it } from 'vitest'
import { compareVisualDocs } from '../src/design/compare.js'
import {
  androidViewSourceToDesignDoc,
  uikitSourceToDesignDoc,
} from '../src/design/adapters/imperative-design-doc.js'
import type { DesignDoc } from '../src/design/types.js'

const design: DesignDoc = {
  scale: 1,
  source: 'manual',
  root: {
    id: 'root',
    name: 'home',
    kind: 'frame',
    box: {},
    style: {},
    children: [
      {
        id: 't1',
        name: 'title',
        kind: 'text',
        text: '欢迎首页',
        box: { width: 200, height: 40 },
        style: {
          color: '#112233',
          fontSize: 20,
          fontWeight: 700,
          backgroundColor: '#ff6600',
          paddingTop: 12,
          paddingLeft: 12,
          paddingRight: 12,
          paddingBottom: 12,
          cornerRadius: 8,
        },
        children: [],
      },
    ],
  },
}

describe('batch11 imperative L1 merge', () => {
  it('merges Android View styles onto the setText receiver', () => {
    const doc = androidViewSourceToDesignDoc(
      `
public class HomeActivity extends AppCompatActivity {
  void setup(TextView title) {
    title.setText("欢迎首页");
    title.setTextColor(Color.parseColor("#112233"));
    title.setTextSize(20f);
    title.setTypeface(null, Typeface.BOLD);
    title.setBackgroundColor(Color.parseColor("#ff6600"));
    title.setPadding(12, 12, 12, 12);
    title.setLayoutParams(new ViewGroup.LayoutParams(200, 40));
  }
}
`,
      'HomeActivity',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.color).toMatch(/^#112233/)
    expect(node!.style.backgroundColor).toMatch(/^#ff6600/)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
    expect(compareVisualDocs(design, doc).comparedPairs).toBeGreaterThan(0)
  })

  it('merges UIKit ObjC styles onto the label receiver', () => {
    const doc = uikitSourceToDesignDoc(
      `
@implementation HomeViewController
- (void)setup {
  [titleLabel setText:@"欢迎首页"];
  titleLabel.textColor = [UIColor colorWithRed:0.067 green:0.133 blue:0.2 alpha:1];
  titleLabel.font = [UIFont boldSystemFontOfSize:20];
  titleLabel.backgroundColor = [UIColor colorWithRed:1 green:0.4 blue:0 alpha:1];
  titleLabel.layer.cornerRadius = 8;
  titleLabel.frame = CGRectMake(0, 0, 200, 40);
}
@end
`,
      'HomeViewController',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
  })

  it('merges UIKit Swift styles onto the label receiver', () => {
    const doc = uikitSourceToDesignDoc(
      `
class HomeViewController: UIViewController {
  func setup() {
    titleLabel.text = "欢迎首页"
    titleLabel.textColor = UIColor(red: 0.067, green: 0.133, blue: 0.2, alpha: 1)
    titleLabel.font = UIFont.systemFont(ofSize: 20, weight: .bold)
    titleLabel.layer.cornerRadius = 8
    titleLabel.frame = CGRect(x: 0, y: 0, width: 200, height: 40)
  }
}
`,
      'HomeViewController',
    )
    // CGRect(x:...) form — ensure we also parse that variant in window
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.cornerRadius).toBe(8)
  })
})
