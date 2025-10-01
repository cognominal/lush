
//  Handling history. Also a good way to serialized TokenLine, that's why we do it now
//
// TBD : rewrite using YAML
//
// 
//
//  obsolete : history will be saved in the folllowing format 
//  lines ;== line+
//  line :== [ tokentype:token ' ']+ \n

// TBD: we probably assume token not containing newline, which will be not true
import { readFileSync } from 'node:fs';
import * as t from './types.ts'

let es = process.env.XDG_STATE_HOME
let default_state_dir = process.env.HOME + '/.local/state'
let xdg_state_home = es !== undefined ? es : default_state_dir


function history_line_as_string(entry: t.TokenLine): string {
  let s = entry.reduce(
    (acc, tok) => acc + tok.type + ':' + JSON.stringify(tok.text ?? '') + ' ', ''
  );
  return s + '\n';
}

function history_as_string(h: t.TokenMultiLine) {
  let s = h.reduce(
    (acc: string, tokLn) => acc + history_line_as_string(tokLn), ''
  )
  return s + "\n"
}

// read a token on the current line
function readtok(s: string, idx: number): [t.Token, number] {
  let i = s.indexOf(s, idx)
  let ss = s.substring(i + 1)


}

function read_history(path: string): t.TokenMultiLine {
  const s = readFileSync(path, 'utf8')
  const ss = s.split('\n\n')
  ss.reduce((tokens, s => ))
}


