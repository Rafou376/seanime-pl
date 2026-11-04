import * as esbuild from "esbuild";

export type VirtualModule = { contents: string; resolveDir?: string };

export function virtualModulesPlugin(modules: Record<string, VirtualModule>): esbuild.Plugin {
    return {
        name: "virtual-modules",
        setup(build) {
            build.onResolve({ filter: /^virtual:/ }, (args) =>
                args.path in modules ? { path: args.path, namespace: "virtual" } : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => ({
                contents: modules[args.path]!.contents,
                loader: "ts",
                resolveDir: modules[args.path]!.resolveDir,
            }));
        },
    };
}
