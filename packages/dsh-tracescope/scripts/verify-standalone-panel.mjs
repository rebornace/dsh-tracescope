import { startPanelServer } from '../dist/panel-server.js'

const h = await startPanelServer()
console.log('url', h.url)

const healthRes = await fetch(new URL('tracescope/v1/health', h.url))
const health = await healthRes.json()
console.log('health', healthRes.status, JSON.stringify(health))

const htmlRes = await fetch(h.url)
const html = await htmlRes.text()
console.log('htmlHasStandalone', html.includes('standalone.js'))
console.log('htmlHasRoot', html.includes('id="root"'))

const jsRes = await fetch(new URL('standalone.js', h.url))
const jsText = await jsRes.text()
console.log('standalone', jsRes.status, jsText.length)

const commitsRes = await fetch(new URL('tracescope/v1/commits', h.url), {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'accept-language': 'zh' },
  body: JSON.stringify({
    repoPath: process.cwd().replace(/\\packages\\dsh-tracescope$/, '').replace(/\/packages\/dsh-tracescope$/, '') || process.cwd(),
    limit: 3,
    fetch: false,
  }),
})
const commitsBody = await commitsRes.text()
console.log('commits', commitsRes.status, commitsBody.slice(0, 200))

// Keep server up only for this process exit — shared singleton; exit ends verify.
process.exit(healthRes.status === 200 && html.includes('standalone.js') && jsRes.status === 200 ? 0 : 1)
