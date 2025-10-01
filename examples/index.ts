import { Effect } from "every-plugin/effect";
import { _testHelpers } from "../src/index";

const { handleGetTopic, handleMonitor, handleSearch } = _testHelpers;

const context = {
  baseUrl: "https://gov.near.org",
  timeout: 10000,
  batchSize: 20,
  apiKey: undefined,
  apiUsername: undefined,
};

const runFetch = async () => {
  console.log("Fetching latest topic from gov.near.org...\n");

  const monitorResult = await Effect.runPromise(
    handleMonitor(context, {}, null)
  );

  if (monitorResult.items.length === 0) {
    console.log("No topics found!");
    return;
  }

  const topicId = monitorResult.items[0].id;
  console.log(`Fetching topic #${topicId}...\n`);

  const result = await Effect.runPromise(handleGetTopic(context, topicId));

  console.log(`Topic: ${result.topic?.title}`);
  console.log(`Posts: ${result.posts.length}`);
  console.log(`Created: ${result.topic?.created_at}`);
  console.log(`Likes: ${result.topic?.like_count}`);
};

const runMonitor = async () => {
  console.log("Starting monitor on gov.near.org...\n");

  let state: any = null;
  let count = 0;

  while (count < 3) {
    console.log(`--- Iteration ${count + 1} ---`);

    const result = await Effect.runPromise(handleMonitor(context, {}, state));

    console.log(`Phase: ${result.nextState?.phase}`);
    console.log(`Topics found: ${result.items.length}`);

    if (result.items.length > 0) {
      console.log(`\nLatest topics:`);
      result.items.slice(0, 3).forEach((topic, i) => {
        console.log(`  ${i + 1}. ${topic.title}`);
      });
    }

    state = result.nextState;
    count++;

    if (!state) {
      console.log("\nMonitor complete - no more data");
      break;
    }

    console.log();
  }
};

const runSearch = async () => {
  console.log("Searching for 'governance' on gov.near.org...\n");

  const result = await Effect.runPromise(
    handleSearch(
      context,
      {
        query: "governance",
        filters: {},
      },
      null
    )
  );

  console.log(`Found ${result.topics.length} topics`);
  console.log(`Found ${result.posts.length} posts\n`);

  if (result.topics.length > 0) {
    console.log("First 5 results:");
    result.topics.slice(0, 5).forEach((topic, i) => {
      console.log(`  ${i + 1}. ${topic.title} (${topic.posts_count} posts)`);
    });
  }
};

const mode = process.env.MODE || "fetch";

const program =
  mode === "monitor"
    ? runMonitor()
    : mode === "search"
    ? runSearch()
    : runFetch();

program.catch(console.error);
