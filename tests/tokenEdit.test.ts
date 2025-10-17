import { describe, it, expect, beforeAll } from 'vitest'
import {
  insertTextIntoTokenLine,
  deleteRangeFromTokenLine,
  splitTokenLineAt,
  normalizeTokenLineInPlace,
  tokenText,
  tokenizeLine,
  registerToken,
  type TokenLine,
  type InputToken,
} from '../src/index.ts'

beforeAll(() => {
  registerToken({
    type: 'Builtin',
    priority: 10,
    secable: true,
    validator: value => value === 'echo',
  })
  registerToken({
    type: 'Number',
    priority: 8,
    secable: true,
    validator: value => /^[0-9]+$/.test(value),
  })
  registerToken({
    type: 'Space',
    priority: 0,
    secable: false,
    validator: value => /^[ ]+$/.test(value),
  })
  registerToken({
    type: 'Keyword',
    priority: 9,
    secable: true,
    validator: value => value === 'if',
  })
  registerToken({
    type: 'PromptChar',
    priority: 0,
    secable: false,
    validator: value => value === '>',
  })
  registerToken({
    type: 'Sigil',
    priority: 9,
    validator: value => value === '$',
  })
  registerToken({
    type: 'SigillessName',
    priority: 9,
    validator: value => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value),
  })
})

function createSampleLine(): TokenLine {
  return [
    { type: 'Builtin', tokenIdx: 0, text: 'echo', x: 0 },
    { type: 'Space', tokenIdx: 1, text: ' ', x: 4 },
    { type: 'Number', tokenIdx: 2, text: '42', x: 5 },
  ]
}

describe('tokenEdit utilities', () => {
  it('inserts characters inside tokens without changing types', () => {
    const line = createSampleLine()
    insertTextIntoTokenLine(line, 4, '!')

    expect(line).toHaveLength(3)
    expect(line[0]).toMatchObject({ type: 'NakedString', text: 'echo!' })
    expect(line[0]).toMatchObject({ tokenIdx: 0, x: 0 })
    expect(line[1]).toMatchObject({ type: 'Space', text: ' ', tokenIdx: 1, x: 5 })
    expect(line[2]).toMatchObject({ type: 'Number', text: '42', tokenIdx: 2, x: 6 })
  })

  it('splits tokens when inserting spaces and keeps original types', () => {
    const line = createSampleLine()
    insertTextIntoTokenLine(line, 2, ' ')

    expect(line.map(t => ({ type: t.type, text: t.text }))).toEqual([
      { type: 'SigillessName', text: 'ec' },
      { type: 'Space', text: ' ' },
      { type: 'SigillessName', text: 'ho' },
      { type: 'Space', text: ' ' },
      { type: 'Number', text: '42' },
    ])
    expect(line.map(t => t.tokenIdx)).toEqual([0, 1, 2, 3, 4])
    expect(line.map(t => t.x)).toEqual([0, 2, 3, 5, 6])
  })

  it('merges tokens back after deleting inserted spaces', () => {
    const line = createSampleLine()
    insertTextIntoTokenLine(line, 2, ' ')
    deleteRangeFromTokenLine(line, 2, 3)

    expect(line.map(t => ({ type: t.type, text: t.text }))).toEqual([
      { type: 'Builtin', text: 'echo' },
      { type: 'Space', text: ' ' },
      { type: 'Number', text: '42' },
    ])
    expect(line.map(t => t.tokenIdx)).toEqual([0, 1, 2])
    expect(line.map(t => t.x)).toEqual([0, 4, 5])
  })

  it('splits token lines and updates offsets', () => {
    const line = createSampleLine()
    const tail = splitTokenLineAt(line, 5)

    expect(line.map(t => ({ type: t.type, text: t.text, tokenIdx: t.tokenIdx, x: t.x }))).toEqual([
      { type: 'Builtin', text: 'echo', tokenIdx: 0, x: 0 },
      { type: 'Space', text: ' ', tokenIdx: 1, x: 4 },
    ])
    expect(tail.map(t => ({ type: t.type, text: t.text, tokenIdx: t.tokenIdx, x: t.x }))).toEqual([
      { type: 'Number', text: '42', tokenIdx: 0, x: 0 },
    ])
  })

  it('updates subtokens while keeping parent aggregates inferred', () => {
    const line: TokenLine = [
      {
        type: 'Var',
        tokenIdx: 0,
        x: 0,
        subTokens: [
          { type: 'Sigil', tokenIdx: 0, text: '$', x: 0 },
          { type: 'SigillessName', tokenIdx: 1, text: 'foo', x: 1 },
        ],
      } as InputToken,
    ]

    insertTextIntoTokenLine(line, 4, 'b')

    const parent = line[0]
    if (!parent) throw new Error("expected parent token");
    expect(parent.tokenIdx).toBe(0)
    expect(parent.x).toBe(0)
    expect(parent.subTokens).toBeDefined()
    const sigil = parent.subTokens?.[0]
    const name = parent.subTokens?.[1]
    expect(sigil).toMatchObject({ type: 'Sigil', text: '$', tokenIdx: 0, x: 0 })
    expect(name).toMatchObject({ type: 'SigillessName', text: 'foob', tokenIdx: 1, x: 1 })
    expect(tokenText(parent)).toBe('$foob')

    deleteRangeFromTokenLine(line, 1, 2)
    expect(parent.subTokens?.[1]).toMatchObject({ type: 'SigillessName', text: 'oob', tokenIdx: 1, x: 1 })
    expect(tokenText(parent)).toBe('$oob')
  })

  it('keeps single spaces inside naked strings at the end', () => {
    const line = tokenizeLine('foo')
    insertTextIntoTokenLine(line, 3, ' ')
    expect(line).toHaveLength(1)
    expect(line[0]).toMatchObject({ type: 'NakedString', text: 'foo ' })
  })

  it('keeps embedded spaces inside naked strings', () => {
    const line = tokenizeLine('echo')
    insertTextIntoTokenLine(line, 2, ' ')
    expect(line).toHaveLength(1)
    expect(line[0]).toMatchObject({ type: 'NakedString', text: 'ec ho' })
  })

  it('extends existing space tokens when adding a fast double space near typed tokens', () => {
    const line = createSampleLine()
    insertTextIntoTokenLine(line, 5, ' ')

    const space = line[1]
    if (!space) throw new Error('expected space token after insertion')
    expect(space).toMatchObject({ type: 'Space', text: '  ', tokenIdx: 1, x: 4 })

    const existing = typeof space.text === 'string' ? space.text : ''
    space.text = existing + ' '
    normalizeTokenLineInPlace(line)

    expect(line[1]).toMatchObject({ type: 'Space', text: '   ', tokenIdx: 1, x: 4 })
    expect(line[2]).toMatchObject({ type: 'Number', text: '42', tokenIdx: 2, x: 7 })
  })

  it('ignores space insertion on non-secable tokens', () => {
    const line: TokenLine = [
      { type: 'PromptChar', tokenIdx: 0, text: '>', x: 0 },
    ]
    insertTextIntoTokenLine(line, 1, ' ')
    expect(line).toHaveLength(1)
    expect(line[0]).toMatchObject({ type: 'PromptChar', text: '>' })
  })
})
