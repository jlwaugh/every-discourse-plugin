import { z } from "zod";

export const ProposalSchema = z.object({
  id: z.number(),
  creation_time_ns: z.string(),
  proposer_id: z.string(),
  reviewer_id: z.string().nullable(),
  voting_start_time_ns: z.string().nullable(),
  voting_duration_ns: z.string(),
  rejected: z.boolean(),
  votes: z.array(
    z.object({
      total_venear: z.string(),
      total_votes: z.number(),
    })
  ),
  total_votes: z.object({
    total_venear: z.string(),
    total_votes: z.number(),
  }),
  status: z.enum(["Created", "Rejected", "Approved", "Voting", "Finished"]),
  title: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  voting_options: z.array(z.string()),
});

export const AnalysisSchema = z.object({
  proposalId: z.number(),
  stage: z.string(),
  engagement: z.object({
    level: z.string(),
  }),
  summary: z.string(),
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
