import { GAMES } from "../games/registry";
import { GAME_LIST } from "../lib/gameList.js";

// The API's AI tools name the games from a plain copy of the registry.
test("the API's game list matches the registry", () => {
  const plain = GAMES.map((g) => {
    const out = { id: g.id, name: g.name, nameFi: g.nameFi, skill: g.skill, path: g.path };
    for (const flag of ["featured", "noPath", "soon"]) if (g[flag]) out[flag] = true;
    return out;
  });
  expect(GAME_LIST).toEqual(plain);
});
