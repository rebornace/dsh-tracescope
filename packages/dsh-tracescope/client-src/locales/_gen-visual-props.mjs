import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const board = fs.readFileSync(path.join(__dirname, '../visual/DesignCompareBoard.tsx'), 'utf8')
const start = board.indexOf('function propertyCovered')
const chunk = board.slice(0, start)
const prev = chunk.lastIndexOf('marginTop')
// fallback: read visual-props from DesignCompareBoard history — use fixed list from visual-prompt keys
const keys = [
  'width','height','marginTop','marginBottom','marginLeft','marginRight','paddingTop','paddingBottom','paddingLeft','paddingRight',
  'backgroundColor','color','fontSize','cornerRadius','cornerRadii','borderWidth','borderColor','borderTopWidth','borderRightWidth',
  'borderBottomWidth','borderLeftWidth','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','fontWeight',
  'opacity','elevation','shadow','innerShadow','insetShadow','shadows','blur','blendMode','rotation','scaleX','scaleY','skewX','skewY',
  'zIndex','fills','strokeAlign','textAlign','textDecoration','textTransform','overflow','clipPath','aspectRatio','maxLines','textOverflow',
  'minWidth','maxWidth','minHeight','maxHeight','textAdvanceWidth','textBlockHeight','flexDirection','alignItems','justifyContent',
  'fontStyle','textAlignVertical','borderStyle','strokeDashArray','strokeCap','strokeJoin','paragraphSpacing','sizingHorizontal',
  'sizingVertical','backdropBlur','position','rowGap','columnGap','flexWrap','alignContent','order','gridTemplate','alignSelf',
  'flexGrow','flexShrink','transformOrigin','visibility','display','whiteSpace','wordBreak','wordSpacing','textIndent','perspective',
  'rotateX','rotateY','textShadow','direction','writingMode','filter','outline','imageFit','imagePosition','gradient','text',
  'controlCount','fontFamily','lineHeight','letterSpacing',
]

const zhLabels = {
  width:'宽度', height:'高度', marginTop:'上间距', marginBottom:'下间距', marginLeft:'左间距', marginRight:'右间距',
  paddingTop:'上内边距', paddingBottom:'下内边距', paddingLeft:'左内边距', paddingRight:'右内边距',
  backgroundColor:'背景色', color:'文字颜色', fontSize:'字号', cornerRadius:'圆角', cornerRadii:'四角圆角',
  borderWidth:'边框粗细', borderColor:'边框颜色', borderTopWidth:'上边框宽', borderRightWidth:'右边框宽',
  borderBottomWidth:'下边框宽', borderLeftWidth:'左边框宽', borderTopColor:'上边框色', borderRightColor:'右边框色',
  borderBottomColor:'下边框色', borderLeftColor:'左边框色', fontWeight:'字重', opacity:'透明度', elevation:'阴影/海拔',
  shadow:'外阴影', innerShadow:'内阴影', insetShadow:'内阴影参数', shadows:'阴影叠层', blur:'模糊', blendMode:'混合模式',
  rotation:'旋转', scaleX:'缩放X', scaleY:'缩放Y', skewX:'倾斜X', skewY:'倾斜Y', zIndex:'层叠顺序', fills:'填充叠层',
  strokeAlign:'描边对齐', textAlign:'对齐', textDecoration:'文字装饰', textTransform:'文字大小写', overflow:'溢出裁剪',
  clipPath:'裁剪路径', aspectRatio:'宽高比', maxLines:'最大行数', textOverflow:'文本溢出', minWidth:'最小宽度',
  maxWidth:'最大宽度', minHeight:'最小高度', maxHeight:'最大高度', textAdvanceWidth:'文本固有宽', textBlockHeight:'文本块高',
  flexDirection:'主轴方向', alignItems:'交叉轴对齐', justifyContent:'主轴分布', fontStyle:'字体样式', textAlignVertical:'垂直对齐',
  borderStyle:'描边样式', strokeDashArray:'虚线间隔', strokeCap:'线帽', strokeJoin:'线连接', paragraphSpacing:'段间距',
  sizingHorizontal:'横向尺寸模式', sizingVertical:'纵向尺寸模式', backdropBlur:'背景模糊', position:'定位', rowGap:'行间距',
  columnGap:'列间距', flexWrap:'换行', alignContent:'多行对齐', order:'排列顺序', gridTemplate:'网格轨道', alignSelf:'自身对齐',
  flexGrow:'弹性放大', flexShrink:'弹性缩小', transformOrigin:'变换原点', visibility:'可见性', display:'显示',
  whiteSpace:'空白处理', wordBreak:'断词', wordSpacing:'词间距', textIndent:'首行缩进', perspective:'透视', rotateX:'X轴旋转',
  rotateY:'Y轴旋转', textShadow:'文字阴影', direction:'书写方向', writingMode:'书写模式', filter:'滤镜', outline:'轮廓',
  imageFit:'图片适配', imagePosition:'图片锚点', gradient:'渐变', text:'文案', controlCount:'控件规模',
  fontFamily:'字体', lineHeight:'行高', letterSpacing:'字间距',
}

const enLabels = {
  width:'Width', height:'Height', marginTop:'Top margin', marginBottom:'Bottom margin', marginLeft:'Left margin', marginRight:'Right margin',
  paddingTop:'Padding top', paddingBottom:'Padding bottom', paddingLeft:'Padding left', paddingRight:'Padding right',
  backgroundColor:'Background color', color:'Text color', fontSize:'Font size', cornerRadius:'Corner radius', cornerRadii:'Corner radii',
  borderWidth:'Border width', borderColor:'Border color', borderTopWidth:'Border top width', borderRightWidth:'Border right width',
  borderBottomWidth:'Border bottom width', borderLeftWidth:'Border left width', borderTopColor:'Border top color',
  borderRightColor:'Border right color', borderBottomColor:'Border bottom color', borderLeftColor:'Border left color',
  fontWeight:'Font weight', opacity:'Opacity', elevation:'Elevation / shadow', shadow:'Outer shadow', innerShadow:'Inner shadow',
  insetShadow:'Inset shadow params', shadows:'Shadow stack', blur:'Blur', blendMode:'Blend mode', rotation:'Rotation',
  scaleX:'Scale X', scaleY:'Scale Y', skewX:'Skew X', skewY:'Skew Y', zIndex:'Z-index', fills:'Fill stack', strokeAlign:'Stroke align',
  textAlign:'Text align', textDecoration:'Text decoration', textTransform:'Text transform', overflow:'Overflow clip', clipPath:'Clip path',
  aspectRatio:'Aspect ratio', maxLines:'Max lines', textOverflow:'Text overflow', minWidth:'Min width', maxWidth:'Max width',
  minHeight:'Min height', maxHeight:'Max height', textAdvanceWidth:'Text advance width', textBlockHeight:'Text block height',
  flexDirection:'Flex direction', alignItems:'Align items', justifyContent:'Justify content', fontStyle:'Font style',
  textAlignVertical:'Vertical align', borderStyle:'Border style', strokeDashArray:'Dash array', strokeCap:'Stroke cap',
  strokeJoin:'Stroke join', paragraphSpacing:'Paragraph spacing', sizingHorizontal:'Horizontal sizing', sizingVertical:'Vertical sizing',
  backdropBlur:'Backdrop blur', position:'Position', rowGap:'Row gap', columnGap:'Column gap', flexWrap:'Flex wrap',
  alignContent:'Align content', order:'Order', gridTemplate:'Grid tracks', alignSelf:'Align self', flexGrow:'Flex grow',
  flexShrink:'Flex shrink', transformOrigin:'Transform origin', visibility:'Visibility', display:'Display', whiteSpace:'White space',
  wordBreak:'Word break', wordSpacing:'Word spacing', textIndent:'Text indent', perspective:'Perspective', rotateX:'Rotate X',
  rotateY:'Rotate Y', textShadow:'Text shadow', direction:'Direction', writingMode:'Writing mode', filter:'Filter', outline:'Outline',
  imageFit:'Image fit', imagePosition:'Image anchor', gradient:'Gradient', text:'Copy / text', controlCount:'Control count',
  fontFamily:'Font family', lineHeight:'Line height', letterSpacing:'Letter spacing',
}

function writeModule(file, obj) {
  const lines = Object.entries(obj).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`)
  fs.writeFileSync(
    file,
    `/** @type {Record<string, string>} */\nexport default {\n${lines.join('\n')}\n}\n`,
    'utf8',
  )
}

const objZh = Object.fromEntries(keys.map((k) => [`diff.prop.${k}`, zhLabels[k] || k]))
const objEn = Object.fromEntries(keys.map((k) => [`diff.prop.${k}`, enLabels[k] || k]))
writeModule(path.join(__dirname, 'visual-namespaced-props-zh.js'), objZh)
writeModule(path.join(__dirname, 'visual-namespaced-props-en.js'), objEn)
console.log('props', keys.length)
