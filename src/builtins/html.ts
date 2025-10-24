import chalk from "chalk";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLOR_MAP: Record<number, string> = {
  31: "#cc0000",
  32: "#00aa00",
};

export function chalkHtml(input: string): string {
  let result = "";
  const colorStack: string[] = [];
  let italicOpen = false;

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) {
      break;
    }
    if (ch === "\u001b" && input[i + 1] === "[") {
      const end = input.indexOf("m", i);
      if (end === -1) {
        break;
      }
      const sequence = input.slice(i + 2, end);
      const codes = sequence
        .split(";")
        .map(code => Number.parseInt(code, 10))
        .filter(Number.isFinite);
      for (const code of codes) {
        if (code === 0) {
          if (italicOpen) {
            result += "</i>";
            italicOpen = false;
          }
          while (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          continue;
        }
        if (code === 3) {
          if (!italicOpen) {
            result += "<i>";
            italicOpen = true;
          }
          continue;
        }
        if (code === 23) {
          if (italicOpen) {
            result += "</i>";
            italicOpen = false;
          }
          continue;
        }
        if (code === 39) {
          if (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          continue;
        }
        const color = COLOR_MAP[code];
        if (color) {
          if (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          colorStack.push(color);
          result += `<span style="color:${color}">`;
        }
      }
      i = end + 1;
      continue;
    }
    if (ch === "\n") {
      result += "<br>\n";
    } else if (ch !== "\r") {
      result += escapeHtml(ch);
    }
    i++;
  }

  if (italicOpen) {
    result += "</i>";
  }
  while (colorStack.length) {
    result += "</span>";
    colorStack.pop();
  }
  return result;
}
