// The living-room TV's panel: this week's house league table.
import type { Roommate } from "../hooks/useHouseholdData";
import { computeLeague, starOfTheWeek, type LeagueChore } from "../lib/league";
import { initial, nameColour } from "../lib/nameColour";

interface HouseLeagueProps {
  roommates: Roommate[];
  chores: LeagueChore[];
}

export default function HouseLeague({ roommates, chores }: HouseLeagueProps) {
  const league = computeLeague(roommates, chores);
  const star = starOfTheWeek(league);
  const unassigned = chores.filter((chore) => chore.assigneeId === null && !chore.isComplete).length;

  return (
    <section className="house-panel" aria-labelledby="league-panel-title">
      <p className="eyebrow"><span>♛</span> RESETS EVERY MONDAY</p>
      <h2 id="league-panel-title">House league<span className="heading-period">.</span></h2>
      <p className="decor-intro">
        {star
          ? `${star.person.name} is star of the week so far.`
          : league.length === 0
            ? "Add housemates to start the league."
            : "Nobody’s pulled ahead yet. Tick off a chore to take the lead."}
      </p>

      {league.length > 0 && (
        <ol className="league-table">
          {league.map((row) => {
            const percent = row.assigned ? Math.round((row.done / row.assigned) * 100) : 0;
            return (
              <li key={row.person.id} className={`league-row${row === star ? " league-star" : ""}`}>
                <span className="league-rank">{row === star ? "★" : row.rank}</span>
                <span className="avatar" style={{ background: nameColour(row.person.name), color: "#fff" }} aria-hidden="true">
                  {initial(row.person.name)}
                </span>
                <span className="league-name">
                  {row.person.name}
                  <small>
                    {row.assigned === 0
                      ? "No chores this week"
                      : `${row.done} of ${row.assigned} done${row.overdue ? ` · ${row.overdue} overdue` : ""}`}
                  </small>
                </span>
                <span className="league-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
                <span className="league-score">{row.done}</span>
              </li>
            );
          })}
        </ol>
      )}

      {unassigned > 0 && (
        <p className="league-note">
          {unassigned} chore{unassigned === 1 ? " is" : "s are"} up for grabs. Claim one on the whiteboard to score.
        </p>
      )}
    </section>
  );
}
