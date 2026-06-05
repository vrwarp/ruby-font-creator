declare module 'text-to-svg' {
  interface FontNames {
    fontFamily: {
      en: string
      [key: string]: string
    }
    [key: string]: any
  }
  interface Font {
    names: FontNames
    [key: string]: any
  }
  class TextToSVG {
    static loadSync(fontFilepath?: string): TextToSVG
    font: Font
    getPath(text: string, options?: any): string
    getMetrics(text: string, options?: any): any
  }
  export default TextToSVG
}
