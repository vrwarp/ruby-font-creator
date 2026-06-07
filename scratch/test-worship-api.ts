async function run() {
  const glyphs = [
    { glyph: '强', ruby: 'qiáng' },
    { glyph: '窗', ruby: 'chuāng' },
  ]

  // Test 1: smart strategy (length >= 5, should apply squeeze)
  const res1 = await fetch('http://localhost:3001/api/render-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      glyphs,
      layout: {
        placement: 'top',
        verticalOffset: 4,
        opticalSqueeze: 65,
        fontWeight: 800,
        letterTracking: -0.04,
        strategy: 'smart',
        pinyinSize: 13,
        hanziSize: 48,
      },
    }),
  })
  const json1: any = await res1.json()

  // Test 2: proportional strategy (should apply proportional squeeze)
  const res2 = await fetch('http://localhost:3001/api/render-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      glyphs,
      layout: {
        placement: 'top',
        verticalOffset: 4,
        opticalSqueeze: 65,
        fontWeight: 800,
        letterTracking: -0.04,
        strategy: 'proportional',
        pinyinSize: 13,
        hanziSize: 48,
      },
    }),
  })
  const json2: any = await res2.json()

  console.log('Smart strategy - qiáng pinyin-0-0 d:')
  console.log(
    json1[0].svg.match(/id="pinyin-0-0" d="([^"]+)"/)?.[1].substring(0, 80),
  )

  console.log('Proportional strategy - qiáng pinyin-0-0 d:')
  console.log(
    json2[0].svg.match(/id="pinyin-0-0" d="([^"]+)"/)?.[1].substring(0, 80),
  )
}

run().catch(console.error)
