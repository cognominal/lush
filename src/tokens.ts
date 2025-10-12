import chalk from "chalk";
import * as YAML from 'js-yaml';
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Logic to handle token registration and typing
 *  In src/editor.ts 
 *   typing 2 spaces in rapid succession cycle the type of the previous token and higlight it accordingly.
 *
 * 
 * 
 *    
 */




export enum OprType {
  Binary,
  UnaryPrefix,
  UnaryPostfix,
  Circumfix,
  PostCircumfix,
  Meta,
}


export interface PreAstType {
  priority: number // type of higher priority are chosen before lower
  type: string   // type of the token
  validator?: (s: string) => boolean // true if string `s` can be token `type`
  hilite?: (s: string) => string
}

interface Opr {
  type: OprType,
  s: string
  s1?: string // for multitoken operators
}

export type PreAstTypename = string
//  + for example can be both prefix or infix so the `[Opr]`
export type OprMapType = Map<string, Opr | [Opr]>
// 2 separate maptyprd for the same keytype cuz hiliting is 
// more a user thing and tokens a language thing
export type TokenMapType = Map<PreAstTypename, PreAstType>
export type HiliteMapType = Map<PreAstTypename, PreAstType>
export type HiliterType = (s: string) => string
// export type hiliteMapType = Map<PreAstType, HiliterType>

export const oprMap: OprMapType = new Map()
export const tokenMap: TokenMapType = new Map()
// export const hiliteMap: HiliteMapType = new Map()

export function registerOpr(s: string, type: OprType, s1?: string) {
  oprMap.set(s, s1 ? { type, s } : { type, s, s1 })
}

export function registerToken(t: PreAstType): void {
  tokenMap.set(t.type, t)
}


export function typeInit(): void {
  const langPath = fileURLToPath(new URL('../lang.yml', import.meta.url))
  const yaml = readFileSync(langPath, 'utf-8')
  const data = YAML.load(yaml)
  const tokenTypes = Array.isArray((data as any)?.tokenstypes) ? (data as any).tokenstypes as unknown[] : []

  for (const entry of tokenTypes) {
    if (!entry || typeof entry !== 'object') continue
    const typeName = (entry as any).type
    if (typeof typeName !== 'string' || !typeName) continue
    const priority = typeof (entry as any).priority === 'number' ? (entry as any).priority : 0
    const existing: PreAstType = tokenMap.get(typeName) ?? { type: typeName, priority }
    existing.priority = priority
    if (typeof (entry as any).validator === 'function') {
      existing.validator = (entry as any).validator
    }
    tokenMap.set(typeName, existing)
  }

  const hiliteEntries = (data as any)?.hilite
  if (!hiliteEntries || typeof hiliteEntries !== 'object') return

  for (const [typeName, hiliteSpec] of Object.entries(hiliteEntries as Record<string, unknown>)) {
    if (typeof hiliteSpec !== 'string' || !typeName) continue
    const steps = hiliteSpec.split('.').map((step) => step.trim()).filter(Boolean)
    if (!steps.length) continue

    let current: any = chalk
    for (const step of steps) {
      if (current == null) break
      current = current[step]
    }

    if (typeof current !== 'function') continue
    const hiliteFn = (s: string) => current(s)
    const token = tokenMap.get(typeName) ?? { type: typeName, priority: 0 }
    token.hilite = hiliteFn
    tokenMap.set(typeName, token)
  }
}

export function getHighlighter(t: PreAstType): (s: string) => string {
  return tokenMap.get(t.type)?.hilite ?? String;
}
