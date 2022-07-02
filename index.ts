import _ from "lodash";

type Player = "P1" | "P2";
type Outcome = Player | null;

type FinalResult = {
  kind: "final";
  result: Outcome;
  path: number[];
};

type ChoiceResult = {
  kind: "choice";
  chooser: Player;
  choices: Result[];
};

type Result = FinalResult | ChoiceResult;

function eq(a: Result, b: Result): boolean {
  if (a.kind === "final" && b.kind === "final" && a.result === b.result) {
    return true;
  }
  if (
    a.kind === "choice" &&
    b.kind === "choice" &&
    a.chooser === b.chooser &&
    a.choices.length === b.choices.length
  ) {
    const bCopy = [...b.choices];
    for (const aChoice of a.choices) {
      const matched = bCopy.findIndex((c) => eq(aChoice, c));
      if (matched == -1) {
        return false;
      }
      bCopy.splice(matched, 1);
    }
    return true;
  }
  return false;
}

function union<T>(...sets: Set<T>[]): Set<T> {
  const result = new Set<T>();
  for (const s of sets) {
    for (const el of s) {
      result.add(el);
    }
  }
  return result;
}

function allFinals(result: Result): Set<Outcome> {
  if (result.kind === "final") {
    return new Set([result.result]);
  }
  return union(...result.choices.map(allFinals));
}

function resultToString(result: Result, indent: number = 0): string {
  const indentString = "  ".repeat(indent);
  if (result.kind === "final") {
    return indentString + (result.result ?? "D") + " " + result.path.toString();
  }
  return `${indentString}${result.chooser}->(\n${result.choices
    .map((c) => resultToString(c, indent + 2))
    .join("\n")}\n${indentString})`;
}

function compareResult(a: Result, b: Result): number {
  if (a.kind !== b.kind) {
    return a.kind === "final" ? -1 : 1;
  }
  return resultToString(a).localeCompare(resultToString(b));
}

function splitTypes(results: Result[]): [FinalResult[], ChoiceResult[]] {
  const finals = results.filter((r): r is FinalResult => r.kind === "final");
  const nonFinals = results.filter(
    (r): r is ChoiceResult => r.kind === "choice"
  );
  return [finals, nonFinals];
}

type Board = Array<Player | null>;

function winner(board: Board): Player | null {
  for (const [a, b, c] of [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]) {
    if (board[a] === board[b] && board[b] === board[c] && board[c] !== null) {
      return board[a];
    }
  }
  return null;
}

type Dominator = (a: Result, b: Result, p: Player) => boolean;

function result(board: Board, path: number[], toPlay: Player): Result {
  const won = winner(board);
  if (won) {
    return {
      kind: "final",
      result: won,
      path,
    };
  }
  if (!board.some((x) => x === null)) {
    return {
      kind: "final",
      result: null,
      path,
    };
  }
  const possibles: Result[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const newBoard = [...board];
      newBoard[i] = toPlay;
      const newResult = result(
        newBoard,
        [...path, i],
        toPlay === "P1" ? "P2" : "P1"
      );
      possibles.push(newResult);
    }
  }
  return {
    kind: "choice",
    chooser: toPlay,
    choices: possibles,
  };
}

function trimResult(result: Result, dominator: Dominator): Result {
  if (result.kind === "final") {
    return result;
  }
  const possibles = result.choices.flatMap((c) =>
    c.kind === "choice" && c.chooser === result.chooser ? c.choices : [c]
  );
  const trimmedPossibles = trimPossibles(
    _.uniqWith(possibles, eq),
    dominator,
    result.chooser
  );
  if (trimmedPossibles.length === 1) {
    return trimmedPossibles[0];
  }
  return {
    kind: "choice",
    chooser: result.chooser,
    choices: trimmedPossibles.sort(compareResult),
  };
}

function trimPossibles(
  results: Result[],
  dominator: Dominator,
  player: Player
): Result[] {
  const [finals, nonFinals] = splitTypes(results);
  const trimmed: Result[] = [...finals];
  for (const nonFinal of nonFinals) {
    const subFinals = [...allFinals(nonFinal)];
    if (!subFinals.every((r) => finals.some((f) => f.result === r))) {
      trimmed.push(nonFinal);
    }
  }
  const toRemove = new Set<number>();
  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length; j++) {
      if (
        i !== j &&
        !toRemove.has(j) &&
        dominator(trimmed[i], trimmed[j], player)
      ) {
        // console.log(
        //   `${resultToString(trimmed[i])} dominates ${resultToString(
        //     trimmed[j]
        //   )}`
        // );
        toRemove.add(j);
      }
    }
  }
  return trimmed.filter((_, i) => !toRemove.has(i));
}

function reduce(
  result: Result,
  dominator: Dominator,
  p1Declined: Set<Outcome>,
  p2Declined: Set<Outcome>
): Result {
  if (result.kind === "final") {
    return result;
  }
  const [finals, nonFinals] = splitTypes(result.choices);
  const [newP1Declined, newP2Declined] =
    result.chooser === "P1"
      ? [new Set([...p1Declined, ...finals.map((f) => f.result)]), p2Declined]
      : [p1Declined, new Set([...p2Declined, ...finals.map((f) => f.result)])];
  const reduced = nonFinals.map((c) =>
    reduce(c, dominator, newP1Declined, newP2Declined)
  );
  return trimResult(
    {
      kind: "choice",
      chooser: result.chooser,
      choices: [...finals, ...reduced],
    },
    dominator
  );
}

function normalTicTacToe(a: Result, b: Result, p: Player) {
  if (a.kind === "choice" || b.kind === "choice") {
    return false;
  }
  if (a.result === p) {
    return true;
  }
  if (a.result === null && b.result !== p) {
    return true;
  }
  return false;
}

function choicesDominate(a: Result, b: Result) {
  if (a.kind === "final" && b.kind === "choice") {
    if (!b.choices.every((c): c is FinalResult => c.kind === "final")) {
      return false;
    }
    if (b.choices.map((c) => c.result).includes(a.result)) {
      return true;
    }
  } else if (a.kind === "choice" && b.kind === "choice") {
    if (
      !a.choices.every((c): c is FinalResult => c.kind === "final") ||
      !b.choices.every((c): c is FinalResult => c.kind === "final")
    ) {
      return false;
    }
    const a2 = a.choices.map((c) => c.result);
    const b2 = b.choices.map((c) => c.result);
    for (const c of a2) {
      if (!b2.includes(c)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function playerWantsResult(player: Player, desired: Outcome): Dominator {
  return (a, b, p) => {
    if (choicesDominate(a, b)) {
      return true;
    }
    if (p === player && a.kind === "final" && a.result === desired) {
      return true;
    }
    if (
      p === player &&
      // The opponent making a choice that contains our desired choice is better
      // than definitely not getting it
      a.kind === "choice" &&
      a.choices.filter((c) => c.kind === "final" && c.result === desired)
        .length > 0 &&
      ((b.kind === "final" && b.result != desired) ||
        (b.kind === "choice" &&
          b.choices.every((c): c is FinalResult => c.kind === "final") &&
          b.choices.filter((c) => c.result === desired).length === 0))
    ) {
      return true;
    }
    return false;
  };
}

for (const [player, want] of [
  ["P1", "P1"],
  ["P1", "P2"],
  ["P1", null],
  ["P2", "P1"],
  ["P2", "P2"],
  ["P2", null],
] as const) {
  console.log(`
  ****
  **** ${player} wants ${want}
  ****
  `);
  console.log(
    resultToString(
      reduce(
        result(
          [null, null, null, null, null, null, null, null, null],
          [],
          "P1"
        ),
        // normalTicTacToe
        playerWantsResult(player, want),
        new Set(),
        new Set()
      )
    )
  );
}
