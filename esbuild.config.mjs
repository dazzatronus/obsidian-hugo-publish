import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/* … */`;
const prod = process.argv[2] === "production";

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["main.ts"],
	bundle: true,
	platform: "node", // ← tell esbuild we’re targeting Node/Electron
	target: ["node16"], // ← match Obsidian’s Electron runtime
	format: "cjs",
	external: [
		"obsidian",
		"electron",
		...builtins, // mark all Node core modules external
	],
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
