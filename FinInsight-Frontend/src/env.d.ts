interface Window {
  __FININSIGHT_API_BASE_URL__?: string
}

declare namespace NodeJS {
  interface ProcessEnv {
    FININSIGHT_API_BASE_URL?: string
  }
}

declare const process: {
  env: NodeJS.ProcessEnv
}
