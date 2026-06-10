declare module 'svg2ttf' {
  interface Svg2TtfResult {
    buffer: Uint8Array
  }
  function svg2ttf(svgFontString: string, options?: object): Svg2TtfResult
  export default svg2ttf
}
