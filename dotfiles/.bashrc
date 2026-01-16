# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

# don't put duplicate lines or lines starting with space in the history.
# See bash(1) for more options
HISTCONTROL=ignoreboth

# append to the history file, don't overwrite it
shopt -s histappend

# for setting history length see HISTSIZE and HISTFILESIZE in bash(1)
HISTSIZE=1000
HISTFILESIZE=2000

# check the window size after each command and, if necessary,
# update the values of LINES and COLUMNS.
shopt -s checkwinsize

# If set, the pattern "**" used in a pathname expansion context will
# match all files and zero or more directories and subdirectories.
#shopt -s globstar

# make less more friendly for non-text input files, see lesspipe(1)
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# set variable identifying the chroot you work in (used in the prompt below)
if [ -z "${debian_chroot:-}" ] && [ -r /etc/debian_chroot ]; then
    debian_chroot=$(cat /etc/debian_chroot)
fi

# set a fancy prompt (non-color, unless we know we "want" color)
case "$TERM" in
    xterm-color|*-256color|xterm-kitty) color_prompt=yes;;
esac

# uncomment for a colored prompt, if the terminal has the capability; turned
# off by default to not distract the user: the focus in a terminal window
# should be on the output of commands, not on the prompt
#force_color_prompt=yes

if [ -n "$force_color_prompt" ]; then
    if [ -x /usr/bin/tput ] && tput setaf 1 >&/dev/null; then
	# We have color support; assume it's compliant with Ecma-48
	# (ISO/IEC-6429). (Lack of such support is extremely rare, and such
	# a case would tend to support setf rather than setaf.)
	color_prompt=yes
    else
	color_prompt=
    fi
fi

if [ "$color_prompt" = yes ]; then
    PS1='\n${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\n\$ '
else
    PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '
fi
unset color_prompt force_color_prompt

# If this is an xterm set the title to user@host:dir
case "$TERM" in
xterm*|rxvt*)
    PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
    ;;
*)
    ;;
esac

# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    #alias dir='dir --color=auto'
    #alias vdir='vdir --color=auto'

    alias grep='grep --color=auto'
    alias fgrep='fgrep --color=auto'
    alias egrep='egrep --color=auto'
fi

# colored GCC warnings and errors
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'

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

bind -x '"\C-f": tmux-sessionizer'
bind -x '"\C-o": code -r .'
bind -x '"\C-g": ghfz'

tnl() {
	ssh -R 80:localhost:$1 nokey@localhost.run
}

# Add an "alert" alias for long running commands.  Use like so:
#   sleep 10; alert
alias alert='notify-send --urgency=low -i "$([ $? = 0 ] && echo terminal || echo error)" "$(history|tail -n1|sed -e '\''s/^\s*[0-9]\+\s*//;s/[;&|]\s*alert$//'\'')"'

# Alias definitions.
# You may want to put all your additions into a separate file like
# ~/.bash_aliases, instead of adding them here directly.
# See /usr/share/doc/bash-doc/examples in the bash-doc package.

if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

# enable programmable completion features (you don't need to enable
# this, if it's already enabled in /etc/bash.bashrc and /etc/profile
# sources /etc/bash.bashrc).
if ! shopt -oq posix; then
  if [ -f /usr/share/bash-completion/bash_completion ]; then
    . /usr/share/bash-completion/bash_completion
  elif [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
  fi
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export PATH="$PATH:~/.local/nvim-linux-x86_64/bin:$HOME/setup:$HOME/.local/scripts"

[ -f ~/.fzf.bash ] && source ~/.fzf.bash

export LANG=en_IN.UTF-8

. "$HOME/.local/bin/env"
