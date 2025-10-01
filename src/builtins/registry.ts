error: ...og/.local/share/nvim/lazy/snacks.nvim/lua/snacks/win.lua:908: BufLeave Autocommands for "*": Vim(append):Lua callback: vim/_editor.lua:0: BufLeave Autocommands for "*"..script nvim_exec2() called at BufLeave Autocommands for "*":0, line 1: Vim(write):E32: No file name
stack traceback:
	[C]: in function 'nvim_exec2'
	vim/_editor.lua: in function 'cmd'
	/Users/cog/.config/nvim/init.lua:29: in function </Users/cog/.config/nvim/init.lua:27>
	[C]: in function 'nvim_win_set_buf'
	...og/.local/share/nvim/lazy/snacks.nvim/lua/snacks/win.lua:908: in function 'set_buf'
	...nvim/lazy/snacks.nvim/lua/snacks/picker/core/preview.lua:220: in function 'set_buf'
	...hare/nvim/lazy/snacks.nvim/lua/snacks/picker/preview.lua:95: in function <...hare/nvim/lazy/snacks.nvim/lua/snacks/picker/preview.lua:77>
	[C]: in function 'pcall'
	...nvim/lazy/snacks.nvim/lua/snacks/picker/core/preview.lua:168: in function 'show'
	.../nvim/lazy/snacks.nvim/lua/snacks/picker/core/picker.lua:490: in function '_show_preview'
	.../nvim/lazy/snacks.nvim/lua/snacks/picker/core/picker.lua:149: in function 'fn'
	...cal/share/nvim/lazy/snacks.nvim/lua/snacks/util/init.lua:326: in function 'run'
	...cal/share/nvim/lazy/snacks.nvim/lua/snacks/util/init.lua:335: in function 'show_preview'
	...re/nvim/lazy/snacks.nvim/lua/snacks/picker/core/list.lua:632: in function <...re/nvim/lazy/snacks.nvim/lua/snacks/picker/core/list.lua:630>

{
  _ = {
    ts = {
      ["export function registerBuiltin(name: string, handler: BuiltinHandler) {"] = { {
          col = 0,
          end_col = 6,
          hl_group = "@keyword.import.typescript",
          priority = 100
        }, {
          col = 7,
          end_col = 15,
          hl_group = "@keyword.function.typescript",
          priority = 100
        }, {
          col = 16,
          end_col = 31,
          hl_group = "@variable.typescript",
          priority = 100
        }, {
          col = 16,
          end_col = 31,
          hl_group = "@function.typescript",
          priority = 100
        }, {
          col = 31,
          end_col = 32,
          hl_group = "@punctuation.bracket.typescript",
          priority = 100
        }, {
          col = 32,
          end_col = 36,
          hl_group = "@variable.typescript",
          priority = 100
        }, {
          col = 32,
          end_col = 36,
          hl_group = "@variable.parameter.typescript",
          priority = 100
        }, {
          col = 36,
          end_col = 37,
          hl_group = "@punctuation.delimiter.typescript",
          priority = 100
        }, {
          col = 36,
          end_col = 37,
          hl_group = "@punctuation.delimiter.typescript",
          priority = 100
        }, {
          col = 38,
          end_col = 44,
          hl_group = "@type.builtin.typescript",
          priority = 100
        }, {
          col = 44,
          end_col = 45,
          hl_group = "@punctuation.delimiter.typescript",
          priority = 100
        }, {
          col = 46,
          end_col = 53,
          hl_group = "@variable.typescript",
          priority = 100
        }, {
          col = 46,
          end_col = 53,
          hl_group = "@variable.parameter.typescript",
          priority = 100
        }, {
          col = 53,
          end_col = 54,
          hl_group = "@punctuation.delimiter.typescript",
          priority = 100
        }, {
          col = 53,
          end_col = 54,
          hl_group = "@punctuation.delimiter.typescript",
          priority = 100
        }, {
          col = 55,
          end_col = 69,
          hl_group = "@type.typescript",
          priority = 100
        }, {
          col = 69,
          end_col = 70,
          hl_group = "@punctuation.bracket.typescript",
          priority = 100
        }, {
          col = 71,
          end_col = 72,
          hl_group = "@punctuation.bracket.typescript",
          priority = 100
        }, {
          col = 72,
          end_col = 72,
          hl_group = "@punctuation.bracket.typescript",
          priority = 100
        } }
    }
  },
  _path = "/Users/cog/mine/rdln-lush/src/builtins/registry.ts",
  buf = 203,
  end_pos = { 18, 31 },
  file = "/Users/cog/mine/rdln-lush/src/builtins/registry.ts",
  idx = 12,
  line = "export function registerBuiltin(name: string, handler: BuiltinHandler) {",
  match_tick = 0,
  pos = { 18, 16 },
  score = 1000,
  text = "/Users/cog/mine/rdln-lush/src/builtins/registry.ts export function registerBuiltin(name: string, handler: BuiltinHandler) {"
}
