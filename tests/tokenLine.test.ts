import { describe, it, expect } from 'vitest'
import { tokenizeLine, handleDoubleSpace, collectArgumentTexts } from '../src/tokenLine.ts'

describe('tokenLine utilities', () => {
  it('splits text into runs preserving offsets', () => {
    const tokens = tokenizeLine('echo  foo')
    expect(tokens).toEqual([
      { type: 'AnyString', tokenIdx: 0, text: 'echo', x: 0 },
      { type: 'Space', tokenIdx: 1, text: '  ', x: 4 },
      { type: 'AnyString', tokenIdx: 2, text: 'foo', x: 6 },
    ])
  })

  it('handles empty input', () => {
    expect(tokenizeLine('')).toEqual([])
  })

  it('creates missing space and rewinds cursor on double-space', () => {
    const result = handleDoubleSpace('echo', 4)
    expect(result).toEqual({ text: 'echo ', cursor: 4 })
  })

  it('rewinds to existing space block without duplicating', () => {
    const result = handleDoubleSpace('echo  foo', 5)
    expect(result).toEqual({ text: 'echo  foo', cursor: 4 })
  })

  it('collects argument strings, skipping space tokens', () => {
    const lines = [tokenizeLine('ls  -la')]
    expect(collectArgumentTexts(lines)).toEqual(['ls', '-la'])
  })

  it('keeps composite token text intact', () => {
    const lines = [[{ type: 'NakedString', tokenIdx: 0, text: 'foo bar', x: 0 }]]
    expect(collectArgumentTexts(lines)).toEqual(['foo bar'])
  })
})
