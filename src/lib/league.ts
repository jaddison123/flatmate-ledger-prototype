// The house league: housemates ranked by chores done this week. Shown on the living-room TV
// and in its panel. Only this week's state exists (chores reset each Monday), so the league
// does too.
import type { Roommate } from "../../shared/household.mjs";

/** The bits of a chore the league needs (App's chores-with-status fit this). */
export interface LeagueChore {
  assigneeId: string | null;
  isComplete: boolean;
  isOverdue: boolean;
}

export interface LeagueRow {
  person: Roommate;
  /** 1-based; housemates with identical scores share a rank. */
  rank: number;
  done: number;
  assigned: number;
  overdue: number;
}

function sameScore(a: LeagueRow, b: LeagueRow): boolean {
  return a.done === b.done && a.assigned === b.assigned && a.overdue === b.overdue;
}

/**
 * Ranks by chores done, then by share of their own chores done (a clean sheet beats leaving
 * some undone), then by fewest overdue. Names break ties only for display order.
 */
export function computeLeague(roommates: Roommate[], chores: LeagueChore[]): LeagueRow[] {
  const rows: LeagueRow[] = roommates.map((person) => {
    const mine = chores.filter((chore) => chore.assigneeId === person.id);
    return {
      person,
      rank: 0,
      done: mine.filter((chore) => chore.isComplete).length,
      assigned: mine.length,
      overdue: mine.filter((chore) => chore.isOverdue).length,
    };
  });
  const share = (row: LeagueRow) => (row.assigned ? row.done / row.assigned : 0);
  rows.sort((a, b) =>
    b.done - a.done || share(b) - share(a) || a.overdue - b.overdue || a.person.name.localeCompare(b.person.name),
  );
  rows.forEach((row, index) => {
    row.rank = index > 0 && sameScore(row, rows[index - 1]) ? rows[index - 1].rank : index + 1;
  });
  return rows;
}

/** The star of the week: the single leader, once they've done at least one chore. */
export function starOfTheWeek(league: LeagueRow[]): LeagueRow | null {
  const [first, second] = league;
  if (!first || first.done === 0) return null;
  return second && second.rank === first.rank ? null : first;
}
