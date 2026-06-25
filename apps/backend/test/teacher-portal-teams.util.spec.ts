import { describe, expect, it } from "vitest";
import { validateTeamMemberRanks } from "../src/teams/teams-rank.util";

describe("validateTeamMemberRanks", () => {
  it("accepts consecutive ranks for any member count", () => {
    expect(() =>
      validateTeamMemberRanks([
        { studentProfileId: "a", leaderRank: 1 },
        { studentProfileId: "b", leaderRank: 2 },
        { studentProfileId: "c", leaderRank: 3 }
      ])
    ).not.toThrow();
  });

  it("rejects empty teams", () => {
    expect(() => validateTeamMemberRanks([])).toThrow("at least one member");
  });

  it("rejects duplicate ranks", () => {
    expect(() =>
      validateTeamMemberRanks([
        { studentProfileId: "a", leaderRank: 1 },
        { studentProfileId: "b", leaderRank: 1 }
      ])
    ).toThrow("unique leader rank");
  });

  it("rejects non-consecutive ranks", () => {
    expect(() =>
      validateTeamMemberRanks([
        { studentProfileId: "a", leaderRank: 1 },
        { studentProfileId: "b", leaderRank: 3 }
      ])
    ).toThrow("consecutive");
  });
});
