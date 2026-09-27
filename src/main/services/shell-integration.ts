import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const OSC_CODE = 7770

/**
 * Shell hooks reporting command start/end through a private OSC sequence (`ESC ] 7770 ; start;<cmd> BEL`
 * and `ESC ] 7770 ; end;<exit> BEL`), plus OSC 7 for the cwd. zsh: a private ZDOTDIR whose rc files
 * source the user's own. bash: a rc file passed with --rcfile.
 */
export class ShellIntegration {
  readonly dir: string

  constructor(base = app.getPath('userData')) {
    this.dir = join(base, 'shell')
    mkdirSync(join(this.dir, 'zsh'), { recursive: true })
    this.write('zsh/.zshenv', `# ClaudeTerm shell integration — load the user's real files\n[ -f "$HOME/.zshenv" ] && source "$HOME/.zshenv"\n`)
    this.write('zsh/.zprofile', `[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"\n`)
    this.write('zsh/.zlogin', `[ -f "$HOME/.zlogin" ] && source "$HOME/.zlogin"\n`)
    this.write('zsh/.zshrc', `[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"
unset ZDOTDIR
autoload -Uz add-zsh-hook
__ct_preexec() { printf '\\e]${OSC_CODE};start;%s\\a' "\${1//[[:cntrl:]]/ }" }
__ct_precmd()  { local c=$?; printf '\\e]${OSC_CODE};end;%s\\a' "$c"; printf '\\e]7;file://%s%s\\a' "$HOST" "$PWD" }
add-zsh-hook preexec __ct_preexec
add-zsh-hook precmd  __ct_precmd
${claudeFunction()}
`)
    this.write('bash.rc', `[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
__ct_preexec() { [ -n "$COMP_LINE" ] && return; [ "$BASH_COMMAND" = "__ct_precmd" ] && return; printf '\\e]${OSC_CODE};start;%s\\a' "$BASH_COMMAND"; }
__ct_precmd()  { local c=$?; printf '\\e]${OSC_CODE};end;%s\\a' "$c"; printf '\\e]7;file://%s%s\\a' "$HOSTNAME" "$PWD"; }
trap '__ct_preexec' DEBUG
PROMPT_COMMAND="__ct_precmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
${claudeFunction()}
`)
  }

  private write(rel: string, body: string) {
    const p = join(this.dir, rel)
    if (!existsSync(p) || readFileSync(p, 'utf8') !== body) writeFileSync(p, body)
  }

  /** Spawn spec and env additions for an integrated interactive shell. */
  shell(userShell: string): { file: string; args: string[]; env: Record<string, string> } {
    const name = userShell.split(/[\\/]/).pop() ?? ''
    if (name === 'bash') return { file: userShell, args: ['--rcfile', join(this.dir, 'bash.rc'), '-i'], env: {} }
    if (name === 'zsh' || name === '') return { file: userShell || '/bin/zsh', args: ['-il'], env: { ZDOTDIR: join(this.dir, 'zsh') } }
    return { file: userShell, args: ['-il'], env: {} }   // fish & co: no hooks yet
  }
}

/** `claude` typed in an integrated shell: adds the linked-projects context when the project has one. */
function claudeFunction() {
  return `claude() {
  local f="$CLAUDETERM_ROOT/.claude/claudeterm-prompt.txt"
  if [ -n "$CLAUDETERM_ROOT" ] && [ -s "$f" ]; then
    command claude --append-system-prompt-file "$f" "$@"
  else
    command claude "$@"
  fi
}`
}
