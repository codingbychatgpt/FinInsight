import { defineConfig } from '@tarojs/cli'

export default defineConfig(async () => {
  return {
    projectName: 'FinInsight-Frontend',
    date: '2026-05-21',
    designWidth: 750,
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-framework-react',
      '@tarojs/plugin-platform-h5'
    ],
    framework: 'react',
    compiler: 'webpack5',
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: {
        pxtransform: {
          enable: false
        }
      },
      devServer: {
        port: 10086,
        host: '127.0.0.1'
      }
    }
  }
})
