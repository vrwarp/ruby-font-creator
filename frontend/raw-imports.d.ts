// Vite `?raw` imports resolve to the file contents as a string.
declare module '*?raw' {
  const content: string
  export default content
}

// Vite `?url` imports resolve to the served URL of the asset.
declare module '*?url' {
  const url: string
  export default url
}
