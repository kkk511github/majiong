/** Admin/CSV, daily scores and weekly counts share one completed-table window.
 * Build the game-id set using match_records_time first, then probe the ledger
 * via point_records_table_member instead of scanning every historical point.
 * The anti-join is deliberately NOT date-limited: a later snapshot outside
 * this window must supersede an older one inside it. The unique id breaks at
 * ties, matching ORDER BY at DESC,id DESC without a per-point sort.
 * Bind [from, to]; caller's ledger alias is p. */
export const completedTableWindow = `p.game_id IN (
  SELECT m.game_id FROM match_records m
  WHERE m.at>=? AND m.at<? AND m.code<>'练习桌'
    AND NOT EXISTS (SELECT 1 FROM match_records latest
      WHERE latest.game_id=m.game_id AND (latest.at,latest.id)>(m.at,m.id))
)`;
