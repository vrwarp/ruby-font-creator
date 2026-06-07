import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'

// We will read index.html and main.ts, but wait! main.ts is TypeScript, jsdom runs JS.
// We can fetch the rendered page from the running dev server at http://localhost:3001/ !
// This is even easier! We can use JSDOM.fromURL to load the page from the dev server!

async function run() {
  console.log('Loading page from dev server...')
  const dom = await JSDOM.fromURL('http://localhost:3001/', {
    resources: 'usable',
    runScripts: 'dangerously',
  })

  // Wait a bit for the async fetch to finish and update DOM
  await new Promise((resolve) => setTimeout(resolve, 5000))

  const content = dom.window.document.getElementById('worship-slide-content')
  if (content) {
    console.log('Rendered worship-slide-content HTML:')
    console.log(content.innerHTML.substring(0, 2000)) // print first 2000 chars
  } else {
    console.log('worship-slide-content element not found!')
  }

  dom.window.close()
}

run().catch(console.error)
