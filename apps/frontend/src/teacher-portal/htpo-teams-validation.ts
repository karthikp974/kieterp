import type { HtpoTeamMemberDraft } from "./htpo-teams-types";

export function teamMemberRanksAreValid(members: Pick<HtpoTeamMemberDraft, "leaderRank">[]): boolean {
  if (members.length < 1) return false;
  const ranks = members.map((member) => member.leaderRank);
  if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1)) return false;
  if (new Set(ranks).size !== ranks.length) return false;
  const sorted = [...ranks].sort((a, b) => a - b);
  return sorted.every((rank, index) => rank === index + 1);
}

export function isCreateTeamFormReady(name: string, sectionId: string, members: HtpoTeamMemberDraft[]): boolean {
  return name.trim().length >= 2 && Boolean(sectionId) && teamMemberRanksAreValid(members);
}
