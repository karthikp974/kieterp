import { BadRequestException } from "@nestjs/common";

export type TeamMemberRankInput = {
  studentProfileId: string;
  leaderRank: number;
};

export function validateTeamMemberRanks(members: TeamMemberRankInput[]) {
  if (members.length < 1) {
    throw new BadRequestException("Teams must have at least one member.");
  }

  const memberIds = members.map((member) => member.studentProfileId);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new BadRequestException("Duplicate team members found.");
  }

  const ranks = members.map((member) => member.leaderRank);
  if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1)) {
    throw new BadRequestException("Every member must have a valid leader rank.");
  }
  if (new Set(ranks).size !== ranks.length) {
    throw new BadRequestException("Each member must have a unique leader rank.");
  }

  const sorted = [...ranks].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== index + 1) {
      throw new BadRequestException("Leader ranks must be consecutive from L1 through the member count.");
    }
  }
}

export function teamMemberRanksAreValid(members: { leaderRank: number }[]): boolean {
  try {
    validateTeamMemberRanks(
      members.map((member, index) => ({
        studentProfileId: `member-${index}`,
        leaderRank: member.leaderRank
      }))
    );
    return true;
  } catch {
    return false;
  }
}
