/// <reference types="vite/client" />

declare module '*.csv?raw' {
  const content: string
  export default content
}
declare module '*.csv?url' {
  const url: string
  export default url
}
