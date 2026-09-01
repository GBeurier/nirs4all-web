/// <reference types="vite/client" />

declare const __N4A_WEB_RUNTIME_PROFILE__: 'strict-wasm' | 'transitional'

declare module '*.csv?raw' {
  const content: string
  export default content
}
declare module '*.csv?url' {
  const url: string
  export default url
}
