# pi-sync

`/sync` for [Pi](https://pi.dev): pull and push the git repo your pi config is symlinked from, then reload Pi.

For people who keep `~/.pi/agent` files (`AGENTS.md`, `settings.json`, `extensions/`, `skills/` and so on) in a dotfiles repo and symlink them in with home-manager, stow or `ln -s`, and use more than one machine.

## What `/sync` does

1. Finds every git repo behind the symlinks in `~/.pi/agent` (or `$PI_CODING_AGENT_DIR`) and `~/.agents/skills`.
2. For each repo, runs `git pull --rebase --autostash`. If that fails, it stops and does not reload.
3. Pushes any local commits.
4. Warns about uncommitted files, which won't reach your other machines.
5. Reloads Pi so new extensions, skills, instructions and settings take effect.

The summary is shown just before the reload, so it may be cleared from the screen once the reload finishes.

Set `PI_SYNC_REPOS=/path/one:/path/two` to skip discovery.

## Why a command

Agents can't reload Pi (`ctx.reload()` is only available to commands). The intended loop is: the agent edits, commits and pushes; you run `/sync` on each machine.

## Install

```
pi install git:github.com/aliceisjustplaying/pi-sync
```
