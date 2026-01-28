bindkey -e

PATH="$PATH:$HOME/.local/scripts"
PATH="$PATH:$HOME/.local/bin"
PATH="$PATH:$HOME/setup"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

HISTSIZE=10000
SAVEHIST=10000
HISTFILE=~/.zsh_history

setopt appendhistory
setopt sharehistory
setopt histignorealldups

autoload -Uz compinit
compinit

setopt autocd
setopt correct
setopt interactivecomments

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

alias ..='cd ../'
alias ...='cd ../../../'
alias ....='cd ../../../../'
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF -l'
alias c='clear'
alias reload='source ~/.bashrc'
alias x='exit'
alias t='tree'
alias bat='batcat'
alias n="nvim -c 'lua require(\"telescope.builtin\").find_files()'"
alias editnvim='cd ~/.config/nvim && n'
alias mapesc='setxkbmap -option "caps:escape_shifted_capslock"'
alias cdf='cd "$(find . -type d | fzf)"'
alias cdfh='cd "$(find ~ -type d \( -path "*/.*" -o -name "node_modules" -o -name "software" \) -prune -o -type d -print | fzf)"'
alias codef='code "$(find . type d | fzf)"'
alias codefh='code "$(find ~ -type d \( -path "*/.*" -o -name "node_modules" -o -name "software" \) -prune -o -type d -print | fzf)"'
alias fzfp='fzf --preview="cat {}"'
alias catf='cat "$(fzfp)"'
alias batf='batcat "$(fzfp)"'
alias codef='find . -type d | code $(fzf)'
alias files='nautilus "$(find . -type d | fzf)"'
alias filesh='nautilus "$(find ~ -type d \( -path "*/.*" -o -name "node_modules" -o -name "software" \) -prune -o -type d -print | fzf)"'
alias vimf='vim $(fzfp)'
alias tscw='tsc --outDir build --target es2015 --noEmitOnError --watch '
alias empty='cat ~/Documents/invisiblechar.txt | xclip -selection clipboard'
alias g='git status'
alias gl='git log --oneline'

tmux-sessionizer-widget() {
  BUFFER="$(tmux-sessionizer)"
  CURSOR=${#BUFFER}
}
zle -N tmux-sessionizer-widget

alias open-vscode='code -r .'

tmux-open-vscode-widget() {
    BUFFER="$(open-vscode)"
    CURSOR=${#BUFFER}
}
zle -N tmux-open-vscode-widget

bindkey '^[[1;5D' backward-word
bindkey '^[[1;5C' forward-word
bindkey '^H' backward-kill-word
bindkey '^F' tmux-sessionizer-widget
bindkey '^O' tmux-open-vscode-widget

WORDCHARS=''

eval "$(starship init zsh)"
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

bindkey '^@' autosuggest-accept

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

PATH="$PATH:$HOME/.local/nvim-linux-x86_64/bin:$HOME/setup:$HOME/.local/scripts"

# Set up fzf key bindings and fuzzy completion
source <(fzf --zsh)
