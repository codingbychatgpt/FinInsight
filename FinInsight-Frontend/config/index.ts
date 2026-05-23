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
    defineConstants: {
      'process.env.TARO_APP_API_BASE_URL': JSON.stringify(
        process.env.TARO_APP_API_BASE_URL || 'http://127.0.0.1:8000'
      )
    },
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
