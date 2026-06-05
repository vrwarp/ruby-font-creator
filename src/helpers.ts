import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BuildConfig, CliArguments } from './types.js'

export const helpers = {
  setFontName(config: any, cliArguments: CliArguments): any {
    const newConfig = { ...config }
    if (cliArguments.fontName) {
      newConfig.fontName = cliArguments.fontName
    }
    return newConfig
  },

  setDataSource(config: any, cliArguments: CliArguments): any {
    const newConfig = { ...config }
    if (cliArguments.data) {
      newConfig.dataSource = path.resolve(cliArguments.data)
    }
    return newConfig
  },

  async setBuildConfig(cliArguments: CliArguments): Promise<BuildConfig> {
    let configPath = path.resolve('./src/config/default.ts')
    if (cliArguments.config) {
      configPath = path.resolve(cliArguments.config)
    }
    const module = await import(pathToFileURL(configPath).href)
    return module.default
  },

  async prepare(config: any): Promise<void> {
    if (!fs.existsSync(config.workingDir)) {
      fs.mkdirSync(config.workingDir, { recursive: true })
    }
  },

  async writeFont(content: any, destination: string): Promise<void> {
    fs.writeFileSync(destination, content)
  },

  async generateFontFiles(
    content: Record<string, any>,
    config: any,
  ): Promise<void> {
    for (const format of config.formats) {
      const directoryPath = path.resolve(`./build`)
      const filePath = `${directoryPath}/${config.fontName}.${format}`
      await this.writeFont(content[format], filePath)
      console.log(`wrote: ${filePath}`)
    }
  },
}

export default helpers
