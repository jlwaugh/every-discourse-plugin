import {
  SimplePlugin,
  createConfigSchema,
  createStateSchema,
} from "every-plugin";
import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import { Effect } from "effect";
import { ProposalSchema, type Proposal } from "./types";

const ConfigSchema = createConfigSchema(
  z.object({
    timeout: z.number().default(30000),
    contractId: z.string().default("example.ballotbox.testnet"),
  }),
  z.object({
    rpcUrl: z.string(),
  })
);

const StateSchema = createStateSchema(
  z.object({
    lastFetch: z.string().optional(),
  })
).nullable();

const contract = {
  getProposal: oc
    .input(z.object({ id: z.number() }))
    .output(z.object({ proposal: ProposalSchema.nullable() })),
};

export class NearPlugin extends SimplePlugin<
  typeof contract,
  typeof ConfigSchema,
  typeof StateSchema
> {
  readonly id = "near-governance";
  readonly type = "source";
  readonly contract = contract;
  readonly configSchema = ConfigSchema;
  override readonly stateSchema = StateSchema;

  private config: any = null;

  override initialize(config?: any) {
    this.config = config;
    return Effect.void;
  }

  private async callNearRPC(method: string, params: any) {
    if (!this.config?.secrets?.rpcUrl) {
      throw new Error("RPC URL not configured");
    }

    try {
      const response = await fetch(this.config.secrets.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC call failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`RPC call failed for ${method}:`, error);
      throw new Error(`NEAR RPC error: ${errorMessage}`);
    }
  }

  private async getProposal(proposalId: number): Promise<any> {
    try {
      console.log(
        `Fetching proposal ${proposalId} from ${
          this.config?.variables?.contractId || "example.ballotbox.testnet"
        }`
      );

      const result = await this.callNearRPC("query", {
        request_type: "call_function",
        finality: "final",
        account_id:
          this.config?.variables?.contractId || "example.ballotbox.testnet",
        method_name: "get_proposal",
        args_base64: Buffer.from(
          JSON.stringify({ proposal_id: proposalId })
        ).toString("base64"),
      });

      if (!result.result || result.result.length === 0) {
        console.log("No result returned from contract");
        return null;
      }

      const decodedResult = JSON.parse(Buffer.from(result.result).toString());
      console.log("Raw contract response:", decodedResult);

      return ProposalSchema.parse(decodedResult);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch proposal ${proposalId}:`, errorMessage);
      return null;
    }
  }

  createRouter() {
    const os = implement(this.contract);

    return os.router({
      getProposal: os.getProposal.handler(async ({ input }) => {
        try {
          const proposal = await this.getProposal(input.id);
          return { proposal };
        } catch (error) {
          console.error(`Error fetching proposal ${input.id}:`, error);
          return { proposal: null };
        }
      }),
    });
  }
}

export default NearPlugin;
