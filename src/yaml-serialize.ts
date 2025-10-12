import * as YAML from 'js-yaml';
import type { Token, TokenMultiLine, OprToken, PreAstType, OprType } from './index.ts';

function mapToken(plain: any): Token {
  let t: Token = {
    type: plain.type as PreAstType,
    x: plain.x,
    tokenIdx: plain.tokenIdx,
    text: plain.text,
  }
  if ('subTokens' in plain) {

    // t = { ...t, (plain.subTokens as any[]).map(mapToken))
  }

  if ('oprType' in plain) {
    return { ...t, oprType: plain.OprType as OprType } as OprToken;
  }

  return t;
}

export function serializeTokenMultiLine(tokens: TokenMultiLine): string {
  return YAML.dump(tokens, { indent: 2 });
}

export function deserializeTokenMultiLine(yaml: string): TokenMultiLine {
  const plain = YAML.load(yaml);
  if (!Array.isArray(plain)) {
    throw new Error('Invalid YAML: expected array of token lines');
  }
  return (plain as any[]).map((line: any) => {
    if (!Array.isArray(line)) {
      throw new Error('Invalid YAML: each line must be an array of tokens');
    }
    return line.map(mapToken);
  });
}
