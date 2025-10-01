import { init, loadRemote } from "@module-federation/enhanced/runtime";
import { call } from "@orpc/server";
import { Effect } from "effect";

// Initialize Module Federation
init({
  name: "host-app",
  remotes: [
    {
      name: "discourse_source",
      entry: "https://4080b5ff.discourse-plugin.pages.dev/remoteEntry.js",
    },
  ],
});

// Load plugin - it has a default export
const DiscoursePlugin = (await loadRemote("discourse_source")) as {
  default: {
    initialize: (options: any) => Effect.Effect<any, never, never>;
    createRouter: (context: any) => any;
  };
};

// Use plugin - access via .default
const context = await Effect.runPromise(
  DiscoursePlugin.default.initialize({
    variables: {
      baseUrl: "https://gov.near.org",
      timeout: 10000,
      batchSize: 20,
    },
    secrets: {},
  })
);

const router = DiscoursePlugin.default.createRouter(context);
const topic = await call(router.getTopic, { id: 123 });
console.log(`Found topic: ${topic.topic?.title}`);
console.log(`Posts: ${topic.posts.length}`);
