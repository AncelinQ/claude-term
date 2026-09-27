import type { CtApi } from '../shared/ipc'
declare global {
  interface Window { ct: CtApi }
}
export {}
