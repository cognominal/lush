---@meta

---@alias Highlighter fun(s:string):string

---@enum PreAstType
local PreAstType = {
  CommandName = "CommandName",
  Builtin = "Builtin",
  Function = "Function",
  NakedString = "NakedString",
  Var = "var",
  Number = "Number",
  Space = "Space",
  NakedString = "NakedString",
  HTMLtag = "HTMLtag",
  TailwindClass = "TailwindClass",
  HTMLClass = "HTMLClass",
  ValidPath = "ValidPath",
  InvalidPath = "InvalidPath",
  PromptChar = "MEPromptChars",
  Sigil = "Sigil",
  Twigil = "Twigil",
  SigillessName = "SigillessName",
}

---@class Token
---@field type PreAstType
---@field tokenIdx integer
---@field text? string
---@field subTokens? Token[]

---@enum OprType
local OprType = {
  Binary = 0,
  UnaryPrefix = 1,
  unaryPostfix = 2,
  circumfix = 3,
  PostCircumfix = 4,
}

---@class OprToken: Token
---@field oprType OprType

---@alias TokenLine Token[]
---@alias TokenMultiLine TokenLine[]

local types = {
  PreAstType = PreAstType,
  OprType = OprType,
}

return types
