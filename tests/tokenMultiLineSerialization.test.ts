import { describe, it, expect } from 'vitest';
import { TokenType, TokenMultiLine } from '../src/types.ts'
import { serializeTokenMultiLine, deserializeTokenMultiLine } from '../src/yaml-serialize.ts'

const sampleTokens: TokenMultiLine = [
  [
    {
      type: TokenType.Builtin,
      x: 0,
      tokenIdx: 0,
      text: 'echo'
    },
    {
      type: TokenType.Space,
      x: 4,
      tokenIdx: 1,
      text: ' '
    },
    {
      type: TokenType.Number,
      x: 5,
      tokenIdx: 2,
      text: '42'
    }
  ]
];

describe('TokenMultiLine YAML Serialization/Deserialization', () => {
  it('should serialize TokenMultiLine to YAML correctly', () => {
    const yaml = serializeTokenMultiLine(sampleTokens);
    const expectedYaml = `- - type: Builtin
    x: 0
    tokenIdx: 0
    text: echo
  - type: Space
    x: 4
    tokenIdx: 1
    text: ' '
  - type: Number
    x: 5
    tokenIdx: 2
    text: '42'`;
    expect(yaml.trim()).toBe(expectedYaml.trim());
  });

  it('should deserialize YAML back to original TokenMultiLine', () => {
    const yaml = serializeTokenMultiLine(sampleTokens);
    const deserialized = deserializeTokenMultiLine(yaml);
    expect(deserialized).toEqual(sampleTokens);
  });

  it('should roundtrip serialize/deserialize without loss', () => {
    const yaml = serializeTokenMultiLine(sampleTokens);
    const roundtripped = deserializeTokenMultiLine(yaml);
    expect(roundtripped).toStrictEqual(sampleTokens);
  });

  it('should throw error on invalid YAML structure', () => {
    const invalidYaml = 'invalid: yaml';
    expect(() => deserializeTokenMultiLine(invalidYaml)).toThrow('Invalid YAML: expected array of token lines');
  });

  it('should throw error on non-array line in YAML', () => {
    const invalidYaml = `- not an array
- - type: Builtin
    x: 0
    tokenIdx: 0
    text: echo`;
    expect(() => deserializeTokenMultiLine(invalidYaml)).toThrow('Invalid YAML: each line must be an array of tokens');
  });
});
