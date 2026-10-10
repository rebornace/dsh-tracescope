import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Regenerate visual-namespaced-zh.js / visual-namespaced-en.js (see prior generator body).
import './_gen-visual-ui-body.mjs'
