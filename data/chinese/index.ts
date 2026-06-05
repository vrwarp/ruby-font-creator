import path from 'node:path'
import dataminer from './src/dataminer.js'

const dir = import.meta.dirname

function start() {
  const filepath = path.resolve(dir, './src/codepoint-ruby.tsv')
  const data = dataminer.convertToJson(filepath, {
    headers: ['codepoint', 'ruby'],
    separator: '\t',
  })
  const destPath = path.resolve(dir, '../../src/data.json')
  dataminer.save(destPath, data)
  console.log(`Successfully generated data.json with ${data.length} entries.`)
}

start()
