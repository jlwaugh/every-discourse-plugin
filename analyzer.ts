import {
  SimplePlugin,
  createConfigSchema,
  createStateSchema,
} from "every-plugin";
import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import { Effect } from "effect";
import {
  ProposalSchema,
  AnalysisSchema,
  type Proposal,
  type Analysis,
} from "./types";

const ConfigSchema = createConfigSchema(
  z.object({
    analysisMode: z.enum(["basic", "detailed"]).default("basic"),
  }),
  z.object({})
);

const StateSchema = createStateSchema(
  z.object({
    lastAnalysis: z.string().optional(),
  })
).nullable();

const contract = {
  analyzeProposal: oc
    .input(z.object({ proposal: ProposalSchema }))
    .output(z.object({ analysis: AnalysisSchema })),
};

export class GovernanceAnalyzer extends SimplePlugin<
  typeof contract,
  typeof ConfigSchema,
  typeof StateSchema
> {
  readonly id = "analyzer";
  readonly type = "transformer";
  readonly contract = contract;
  readonly configSchema = ConfigSchema;
  override readonly stateSchema = StateSchema;

  private config: any = null;

  override initialize(config?: any) {
    this.config = config;
    return Effect.void;
  }

  private analyzeProposal(proposal: Proposal): Analysis {
    // Use raw contract field names
    const stage =
      proposal.status === "Created" // Note: "Created" not "created"
        ? "draft"
        : proposal.status === "Voting"
        ? "active"
        : proposal.status === "Finished"
        ? "completed"
        : proposal.status;

    const engagement = {
      level:
        proposal.total_votes?.total_votes === 0 // Use total_votes object, not currentVotes string
          ? "zero"
          : "low",
    };

    const summary = `Proposal "${
      proposal.title || "Untitled"
    }" is in ${stage} stage with ${engagement.level} engagement`;

    return {
      proposalId: proposal.id,
      stage,
      engagement,
      summary,
    };
  }

  createRouter() {
    const os = implement(this.contract);

    return os.router({
      analyzeProposal: os.analyzeProposal.handler(async ({ input }) => {
        console.log(
          `Analyzing proposal: ${input.proposal.title || "Untitled"}`
        );

        const analysis = this.analyzeProposal(input.proposal);

        console.log(`Analysis complete - Stage: ${analysis.stage}`);

        return { analysis };
      }),
    });
  }
}

export default GovernanceAnalyzer;
