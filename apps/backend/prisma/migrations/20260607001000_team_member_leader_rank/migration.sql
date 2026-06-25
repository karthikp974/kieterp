ALTER TABLE "StudentTeamMember" ADD COLUMN "leaderRank" INTEGER;

CREATE INDEX "StudentTeamMember_teamId_leaderRank_idx" ON "StudentTeamMember"("teamId", "leaderRank");
