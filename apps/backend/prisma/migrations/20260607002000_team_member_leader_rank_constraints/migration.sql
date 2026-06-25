-- Backfill missing leader ranks (append after existing ranks per team).
WITH null_members AS (
  SELECT
    id,
    "teamId",
    ROW_NUMBER() OVER (PARTITION BY "teamId" ORDER BY "joinedAt" ASC, id ASC) AS rn
  FROM "StudentTeamMember"
  WHERE "leaderRank" IS NULL
),
team_max AS (
  SELECT "teamId", COALESCE(MAX("leaderRank"), 0) AS max_rank
  FROM "StudentTeamMember"
  GROUP BY "teamId"
)
UPDATE "StudentTeamMember" AS member
SET "leaderRank" = team_max.max_rank + null_members.rn
FROM null_members
JOIN team_max ON team_max."teamId" = null_members."teamId"
WHERE member.id = null_members.id;

ALTER TABLE "StudentTeamMember" ALTER COLUMN "leaderRank" SET NOT NULL;

CREATE UNIQUE INDEX "StudentTeamMember_teamId_leaderRank_key" ON "StudentTeamMember"("teamId", "leaderRank");
