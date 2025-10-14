const HISTORY_WIDTH = 4

export function prompt(historyNumber = 0): string {
  const safeNumber = Number.isFinite(historyNumber) ? Math.max(0, Math.floor(historyNumber)) : 0
  const counter = String(safeNumber).padStart(HISTORY_WIDTH, "0")
  return `${counter} ${process.cwd()}> `
}
