const path = require("node:path");
const { rspack } = require("@rspack/core");
const pkg = require("./package.json");
const { getNormalizedRemoteName } = require("every-plugin/normalize");
const everyPluginPkg = require("every-plugin/package.json");

function getPluginInfo() {
  return {
    name: pkg.name,
    version: pkg.version,
    normalizedName: getNormalizedRemoteName(pkg.name),
    dependencies: pkg.dependencies || {},
    peerDependencies: pkg.peerDependencies || {},
  };
}

const pluginInfo = getPluginInfo();

module.exports = {
  entry: "./src/index",
  mode: process.env.NODE_ENV === "development" ? "development" : "production",
  target: "web",
  devtool: "source-map",
  output: {
    uniqueName: "discourse_source",
    publicPath: "auto",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    hot: true,
    port: 3015,
    devMiddleware: {
      writeToDisk: true,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "builtin:swc-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new rspack.container.ModuleFederationPlugin({
      name: "discourse_source",
      filename: "remoteEntry.js",
      library: { type: "var", name: "discourse_source" },
      exposes: {
        ".": "./src/index.ts",
      },
      shared: {
        "every-plugin": {
          version: everyPluginPkg.version,
          singleton: true,
          requiredVersion: everyPluginPkg.version,
          strictVersion: false,
          eager: false,
        },
        effect: {
          version: everyPluginPkg.dependencies.effect,
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies.effect,
          strictVersion: false,
          eager: false,
        },
        zod: {
          version: everyPluginPkg.dependencies.zod,
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies.zod,
          strictVersion: false,
          eager: false,
        },
        "@orpc/contract": {
          version: everyPluginPkg.dependencies["@orpc/contract"],
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies["@orpc/contract"],
          strictVersion: false,
          eager: false,
        },
        "@orpc/server": {
          version: everyPluginPkg.dependencies["@orpc/server"],
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies["@orpc/server"],
          strictVersion: false,
          eager: false,
        },
      },
    }),
  ],
};
