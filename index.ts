import { createTestPluginRuntime } from "every-plugin/testing";
import { PluginRuntime } from "every-plugin/runtime";
import { Effect } from "effect";
import NearPlugin from "./near-plugin";
import GovernanceAnalyzer from "./analyzer";
import type { Proposal, Analysis } from "./types";

type ProposalResult = { proposal: Proposal | null };
type AnalysisResult = { analysis: Analysis };
type PipelineResult =
  | { success: true; proposal: Proposal; analysis: Analysis }
  | { success: false };

const runtime = createTestPluginRuntime(
  {
    registry: {
      "near-governance": {
        remoteUrl: "mock://near-governance",
        type: "source",
        version: "1.0.0",
      },
      analyzer: {
        remoteUrl: "mock://analyzer",
        type: "transformer",
        version: "1.0.0",
      },
    },
    secrets: {
      NEAR_RPC_URL: "https://rpc.testnet.near.org",
    },
  },
  {
    "near-governance": NearPlugin,
    analyzer: GovernanceAnalyzer,
  }
);

const getProposal = (proposalId: number) =>
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;

    const plugin = yield* pluginRuntime.usePlugin("near-governance", {
      secrets: { rpcUrl: "{{NEAR_RPC_URL}}" },
      variables: { timeout: 5000, contractId: "example.ballotbox.testnet" },
    });

    return yield* pluginRuntime.executePlugin(plugin, {
      procedure: "getProposal",
      input: { id: proposalId },
      state: null,
    });
  });

const analyzeProposal = (proposal: any) =>
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;

    const plugin = yield* pluginRuntime.usePlugin("analyzer", {
      variables: { analysisMode: "basic" },
    });

    return yield* pluginRuntime.executePlugin(plugin, {
      procedure: "analyzeProposal",
      input: { proposal },
      state: null,
    });
  });

const twoStepPipeline = (proposalId: number) =>
  Effect.gen(function* () {
    console.log(`Starting analysis for proposal ${proposalId}`);

    const proposalResult = (yield* getProposal(proposalId)) as ProposalResult;

    if (!proposalResult.proposal) {
      return { success: false } as const;
    }

    const analysisResult = (yield* analyzeProposal(
      proposalResult.proposal
    )) as AnalysisResult;

    return {
      success: true,
      proposal: proposalResult.proposal,
      analysis: analysisResult.analysis,
    } as const;
  });

// Main function
const main = Effect.gen(function* () {
  const result: any = yield* twoStepPipeline(1);

  if (result.success) {
    console.log("\nResults:");
    console.log(`Proposal: ${result.proposal.title || "Untitled"}`);
    console.log(`Status: ${result.proposal.status}`);
    console.log(`Proposer: ${result.proposal.proposer_id}`);
    console.log(
      `Created: ${new Date(
        parseInt(result.proposal.creation_time_ns) / 1_000_000
      ).toLocaleDateString()}`
    );
    console.log(`Total Votes: ${result.proposal.total_votes.total_votes}`);
    console.log(`Voting Options: ${result.proposal.voting_options.join(", ")}`);
    console.log(`Analysis Stage: ${result.analysis.stage}`);
    console.log(`Engagement: ${result.analysis.engagement.level}`);
    console.log(`Summary: ${result.analysis.summary}`);
  } else {
    console.log("Failed");
  }

  return result;
});

// Run it
runtime
  .runPromise(main)
  .then(() => {
    console.log("Pipeline completed successfully");
    return runtime.dispose();
  })
  .catch((error) => {
    console.error("Pipeline failed:", error);
    return runtime.dispose();
  });
