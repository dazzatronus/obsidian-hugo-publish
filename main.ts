import {
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	Notice,
	Modal,
	App,
} from "obsidian";
import simpleGit, { SimpleGit } from "simple-git";
import matter from "gray-matter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface PublishSettings {
	hugoRepoGitUrl: string;
	hugoRepoBranch: string;
}

const DEFAULT_SETTINGS: PublishSettings = {
	hugoRepoGitUrl: "",
	hugoRepoBranch: "master",
};

// Utility to escape strings for RegExp
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class ConfirmModal extends Modal {
	titleInput: HTMLInputElement;
	slugInput: HTMLInputElement;
	onConfirm: (data: { title: string; slug: string }) => void;

	constructor(
		app: App,
		initial: { title: string; slug: string },
		onConfirm: (data: { title: string; slug: string }) => void
	) {
		super(app);
		this.titleEl.setText("Publish to Hugo");
		this.onConfirm = onConfirm;

		const styleInput = (el: HTMLInputElement) => {
			Object.assign(el.style, {
				padding: "0.5em",
				margin: "0.25em 0 0.75em 0",
				width: "100%",
				boxSizing: "border-box",
				border: "1px solid var(--interactive-border)",
				borderRadius: "var(--radius-small)",
			});
		};

		this.contentEl.createEl("label", { text: "Title:" });
		this.titleInput = this.contentEl.createEl("input", {
			type: "text",
			value: initial.title,
		});
		styleInput(this.titleInput);
		this.contentEl.createEl("br");

		this.contentEl.createEl("label", { text: "Slug:" });
		this.slugInput = this.contentEl.createEl("input", {
			type: "text",
			value: initial.slug,
		});
		styleInput(this.slugInput);
		this.contentEl.createEl("br");

		const btn = this.contentEl.createEl("button", { text: "Publish" });
		btn.style.marginTop = "0.5em";
		btn.onclick = () => {
			this.onConfirm({
				title: this.titleInput.value.trim(),
				slug: this.slugInput.value.trim(),
			});
			this.close();
		};
	}
}

export default class PublishHugoPlugin extends Plugin {
	settings: PublishSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PublishSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TFile) => {
				if (file.extension === "md") {
					menu.addItem((item) =>
						item
							.setTitle("Publish to Hugo")
							.setIcon("cloud-upload")
							.onClick(() => this.publishFile(file))
					);
				}
			})
		);
	}

	async publishFile(file: TFile) {
		if (!this.settings.hugoRepoGitUrl) {
			new Notice("Set your Hugo repo URL in plugin Settings first.");
			return;
		}

		const vaultRoot = (this.app.vault.adapter as any).basePath as string;
		const noteFullPath = path.join(vaultRoot, file.path);
		const raw = await fs.promises.readFile(noteFullPath, "utf-8");
		const { data, content: originalContent } = matter(raw);

		const initialTitle = (data.title as string) || file.basename;
		const rawSlug = (data.slug as string) || file.basename;
		const initialSlug = rawSlug
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");

		const modal = new ConfirmModal(
			this.app,
			{ title: initialTitle, slug: initialSlug },
			async ({ title, slug }) => {
				let tempDir: string | undefined;
				try {
					new Notice("Pulling repo");
					tempDir = await fs.promises.mkdtemp(
						path.join(os.tmpdir(), "hugo-")
					);
					const git: SimpleGit = simpleGit(tempDir);

					// Handle private token if set
					let repoUrl = this.settings.hugoRepoGitUrl;
					const token = process.env.HUGO_GITHUB_TOKEN;
					if (token && repoUrl.startsWith("https://")) {
						repoUrl = repoUrl.replace(
							"https://",
							`https://${token}@`
						);
					}
					await git.clone(repoUrl, tempDir, [
						"--branch",
						this.settings.hugoRepoBranch,
						"--depth",
						"1",
					]);

					new Notice("Creating post");
					const dateStr = (
						data.date ? new Date(data.date) : new Date()
					)
						.toISOString()
						.slice(0, 10);
					const bundleDir = path.join(
						tempDir,
						"content",
						"posts",
						`${dateStr}-${slug}`
					);
					await fs.promises.mkdir(bundleDir, { recursive: true });

					// Prepare content rewriting
					let content = originalContent;

					// Find all MD and wiki embeds
					const mdImageRegex =
						/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
					const wikiImageRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
					const imagePaths = new Set<string>();
					let match: RegExpExecArray | null;

					while (
						(match = mdImageRegex.exec(originalContent)) !== null
					) {
						imagePaths.add(match[2]);
					}
					while (
						(match = wikiImageRegex.exec(originalContent)) !== null
					) {
						imagePaths.add(match[1]);
					}

					const noteDir = path.dirname(noteFullPath);

					// Copy & rename images, and rewrite content
					for (const rel of imagePaths) {
						const cleanRel = rel.replace(/^\.?\/+/, "");
						// Dasherize the filename
						const ext = path.extname(cleanRel).toLowerCase();
						const nameNoExt = path
							.basename(cleanRel, ext)
							.trim()
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.replace(/^-+|-+$/g, "");
						const newName = `${nameNoExt}${ext}`;

						// Copy file
						let srcAbs = path.join(noteDir, cleanRel);
						if (!fs.existsSync(srcAbs)) {
							srcAbs = path.join(vaultRoot, cleanRel);
						}
						if (!fs.existsSync(srcAbs)) {
							console.warn(
								`[PublishHugo] Image not found: ${rel}`
							);
						} else {
							const destAbs = path.join(bundleDir, newName);
							await fs.promises.copyFile(srcAbs, destAbs);
							console.log(
								`[PublishHugo] Copied: ${srcAbs} → ${destAbs}`
							);
						}

						// Rewrite markdown links to `![alt](/newName)`
						const altText = rel.split("|")[1] || nameNoExt; // wiki alt or filename
						const wikiPattern = new RegExp(
							`!\\[\\[${escapeRegExp(rel)}(?:\\|[^\\]]*)?\\]\\]`,
							"g"
						);
						content = content.replace(
							wikiPattern,
							`![${altText}](/${newName})`
						);
						const mdPattern = new RegExp(
							`!\\[[^\\]]*\\]\\(${escapeRegExp(
								rel
							)}(?:\\s+"[^"]*")?\\)`,
							"g"
						);
						content = content.replace(
							mdPattern,
							`![${altText}](/${newName})`
						);
					}

					// Write index.md
					const newMd = matter.stringify(content, {
						...data,
						title,
						slug,
						date: new Date(
							data.date ? data.date : Date.now()
						).toISOString(),
					});
					await fs.promises.writeFile(
						path.join(bundleDir, "index.md"),
						newMd,
						"utf-8"
					);

					new Notice("Publishing changes");
					await git.add("./*");
					await git.commit(
						`chore: publish ${dateStr}-${slug} via Obsidian`
					);
					await git.push("origin", this.settings.hugoRepoBranch);

					new Notice("Successfully published to Hugo");
				} catch (error: any) {
					console.error(error);
					new Notice(`Publish failed: ${error.message}`);
				} finally {
					if (tempDir) {
						await fs.promises.rm(tempDir, {
							recursive: true,
							force: true,
						});
					}
				}
			}
		);
		modal.open();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PublishSettingTab extends PluginSettingTab {
	plugin: PublishHugoPlugin;
	constructor(app: App, plugin: PublishHugoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Publish to Hugo Settings" });

		new Setting(containerEl)
			.setName("Hugo Repo Git URL")
			.setDesc("HTTPS URL to your Hugo repo (include token if private).")
			.addText((text) =>
				text
					.setPlaceholder("https://github.com/you/your-hugo-site.git")
					.setValue(this.plugin.settings.hugoRepoGitUrl)
					.onChange(async (value) => {
						this.plugin.settings.hugoRepoGitUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Repo Branch")
			.setDesc('Branch to publish into (default: "master").')
			.addText((text) =>
				text
					.setPlaceholder("master")
					.setValue(this.plugin.settings.hugoRepoBranch)
					.onChange(async (value) => {
						this.plugin.settings.hugoRepoGitUrl =
							this.plugin.settings.hugoRepoGitUrl;
						this.plugin.settings.hugoRepoBranch =
							value.trim() || "master";
						await this.plugin.saveSettings();
					})
			);
	}
}
