/** Both admin accounting and daily reports assign all eligible hand ledger
 * entries to the table's final timestamp. EXISTS avoids multiplying amounts
 * when a legacy game has duplicate final snapshots. Bind [from, to]. */
export const completedTableWindow = `EXISTS (
  SELECT 1 FROM match_records m
  WHERE m.game_id=p.game_id AND m.at>=? AND m.at<? AND m.code<>'练习桌'
    AND m.rowid=(SELECT latest.rowid FROM match_records latest
      WHERE latest.game_id=m.game_id ORDER BY latest.at DESC,latest.id DESC,latest.rowid DESC LIMIT 1)
)`;
