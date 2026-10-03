// /sync: pull and push the git repo(s) your pi config is symlinked from, then reload pi.
//
// For people who keep ~/.pi/agent files (AGENTS.md, settings.json, extensions/, ...)
// in a dotfiles repo and symlink them in (home-manager, stow, chezmoi symlink mode,
// plain `ln -s`). /sync finds every git repo those symlinks point into, then for each:
//   git pull --rebase --autostash   (stops without reloading on failure)
//   git push                        (only if there are local commits)
// warns about uncommitted files, and finally reloads pi so the changes take effect.
//
// Agents can't reload pi (ctx.reload is command-only), so the intended loop is:
// agent edits + commits + pushes, you type /sync on each machine.
//
// Override discovery with PI_SYNC_REPOS (colon-separated repo paths).

import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const agentDir = () => process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

// Symlinked entries of the agent dir, plus ~/.agents/skills (also read by pi).
export function symlinkTargets(): string[] {
	const candidates: string[] = [];
	const dir = agentDir();
	try {
		for (const name of readdirSync(dir)) candidates.push(join(dir, name));
	} catch {}
	candidates.push(join(homedir(), ".agents", "skills"));

	const targets: string[] = [];
	for (const path of candidates) {
		try {
			if (!lstatSync(path).isSymbolicLink()) continue;
			const real = realpathSync(path);
			targets.push(lstatSync(real).isDirectory() ? real : dirname(real));
		} catch {}
	}
	return targets;
}

export default function (pi: ExtensionAPI) {
	const git = (repo: string, ...args: string[]) => pi.exec("git", ["-C", repo, ...args], { timeout: 60_000 });

	async function findRepos(): Promise<string[]> {
		const fromEnv = process.env.PI_SYNC_REPOS?.split(":").filter(Boolean);
		if (fromEnv?.length) return fromEnv;
		const repos = new Set<string>();
		for (const dir of symlinkTargets()) {
			const top = await git(dir, "rev-parse", "--show-toplevel");
			if (top.code === 0) repos.add(top.stdout.trim());
		}
		return [...repos];
	}

	pi.registerCommand("sync", {
		description: "Pull/push the git repo(s) your pi config is symlinked from, then reload",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const repos = await findRepos();
			if (repos.length === 0) {
				ctx.ui.notify(
					`sync: no git repo found behind symlinks in ${agentDir()}. Set PI_SYNC_REPOS to point at one.`,
					"error",
				);
				return;
			}

			const report: string[] = [];
			let warn = false;
			for (const repo of repos) {
				const pull = await git(repo, "pull", "--rebase", "--autostash", "--quiet");
				if (pull.code !== 0) {
					ctx.ui.notify(`sync: git pull failed in ${repo}; not reloading.\n${(pull.stderr || pull.stdout).trim()}`, "error");
					return;
				}

				const ahead = await git(repo, "rev-list", "--count", "@{u}..HEAD");
				if (ahead.code === 0 && Number(ahead.stdout.trim()) > 0) {
					const push = await git(repo, "push", "--quiet");
					if (push.code !== 0) {
						warn = true;
						report.push(`${repo}: push failed: ${push.stderr.trim()}`);
					}
				}

				const head = (await git(repo, "log", "--oneline", "-1")).stdout.trim();
				const dirty = (await git(repo, "status", "--short")).stdout.trimEnd();
				if (dirty) warn = true;
				report.push(dirty ? `${repo} at ${head}. Uncommitted (not synced):\n${dirty}` : `${repo} at ${head}, clean.`);
			}

			ctx.ui.notify(`sync: ${report.join("\n")}\nReloading.`, warn ? "warning" : "info");
			await ctx.reload();
		},
	});
}
