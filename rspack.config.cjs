const {
  ModuleFederationPlugin,
} = require("@module-federation/enhanced/rspack");
const path = require("path");

module.exports = {
  entry: "./src/index.ts",
  mode: "production",
  target: "node",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.js",
    libraryTarget: "commonjs2",
    libraryExport: "default",
    clean: true,
    publicPath: "auto",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: {
                syntax: "typescript",
              },
              target: "es2022",
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: "discourse_source",
      filename: "remoteEntry.js",
      exposes: {
        ".": "./src/index.ts",
      },
      shared: {
        "every-plugin": {
          singleton: true,
          requiredVersion: "^0.1.0",
        },
        effect: {
          singleton: true,
          requiredVersion: "^3.18.1",
        },
        zod: {
          singleton: true,
          requiredVersion: "^4.1.5",
        },
        "@orpc/contract": {
          singleton: true,
          requiredVersion: "^1.8.6",
        },
        "@orpc/server": {
          singleton: true,
          requiredVersion: "^1.8.6",
        },
      },
    }),
  ],
};
