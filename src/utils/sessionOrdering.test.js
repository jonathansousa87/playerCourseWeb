import { describe, it, expect } from "vitest";
import {
  interleaveByCourse,
  prioritizeConfusion,
  buildSessionQueue,
} from "./sessionOrdering.js";

const card = (id, course) => ({ id, course_title: course, front: `q${id}` });

describe("interleaveByCourse", () => {
  it("retorna vazio pra entrada invalida", () => {
    expect(interleaveByCourse([])).toEqual([]);
    expect(interleaveByCourse(null)).toEqual([]);
    expect(interleaveByCourse(undefined)).toEqual([]);
  });

  it("nao reordena quando ha apenas 1 curso", () => {
    const cards = [card(1, "A"), card(2, "A"), card(3, "A")];
    expect(interleaveByCourse(cards)).toEqual(cards);
  });

  it("alterna A-B-A-B com 2 cursos balanceados", () => {
    const cards = [card(1, "A"), card(2, "A"), card(3, "B"), card(4, "B")];
    const ordered = interleaveByCourse(cards);
    expect(ordered.map((c) => c.course_title)).toEqual(["A", "B", "A", "B"]);
    expect(ordered.map((c) => c.id)).toEqual([1, 3, 2, 4]);
  });

  it("alterna A-B-A com cursos desbalanceados (3+1)", () => {
    const cards = [card(1, "A"), card(2, "A"), card(3, "A"), card(4, "B")];
    const ordered = interleaveByCourse(cards);
    expect(ordered.map((c) => c.course_title)).toEqual(["A", "B", "A", "A"]);
  });

  it("preserva ordem original dentro de cada curso", () => {
    const cards = [card(10, "A"), card(20, "B"), card(11, "A"), card(21, "B")];
    const ordered = interleaveByCourse(cards);
    // Bucket A vira [10, 11]; bucket B vira [20, 21]
    expect(ordered.map((c) => c.id)).toEqual([10, 20, 11, 21]);
  });

  it("aceita courseTitle (camelCase) alem de course_title", () => {
    const cards = [
      { id: 1, courseTitle: "A" },
      { id: 2, courseTitle: "B" },
      { id: 3, courseTitle: "A" },
    ];
    const ordered = interleaveByCourse(cards);
    expect(ordered.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("3 cursos round-robin", () => {
    const cards = [
      card(1, "A"), card(2, "A"),
      card(3, "B"), card(4, "B"),
      card(5, "C"), card(6, "C"),
    ];
    const ordered = interleaveByCourse(cards);
    expect(ordered.map((c) => c.course_title)).toEqual(["A", "B", "C", "A", "B", "C"]);
  });
});

describe("prioritizeConfusion", () => {
  it("sem grupo confuso retorna como veio", () => {
    const cards = [card(1, "A"), card(2, "B")];
    expect(prioritizeConfusion(cards, new Set())).toEqual(cards);
  });

  it("cards confusos vem antes (e tambem interleaved)", () => {
    const cards = [
      card(1, "A"),
      card(2, "B"),
      card(3, "A"), // confuso
      card(4, "B"), // confuso
      card(5, "A"),
    ];
    const ordered = prioritizeConfusion(cards, new Set([3, 4]));
    // Primeiro: confusos interleaved (3 [A], 4 [B])
    // Depois: resto interleaved (1 [A], 2 [B], 5 [A])
    expect(ordered.map((c) => c.id)).toEqual([3, 4, 1, 2, 5]);
  });

  it("todos confusos: aplica interleaving em todos", () => {
    const cards = [card(1, "A"), card(2, "A"), card(3, "B")];
    const ordered = prioritizeConfusion(cards, new Set([1, 2, 3]));
    expect(ordered.map((c) => c.course_title)).toEqual(["A", "B", "A"]);
  });
});

describe("buildSessionQueue", () => {
  it("aplica interleave quando nao ha confusao", () => {
    const cards = [card(1, "A"), card(2, "A"), card(3, "B")];
    const ordered = buildSessionQueue(cards);
    expect(ordered.map((c) => c.id)).toEqual([1, 3, 2]);
  });

  it("aplica prioritizeConfusion quando ha grupos", () => {
    const cards = [card(1, "A"), card(2, "B"), card(3, "A")];
    const ordered = buildSessionQueue(cards, new Set([3]));
    expect(ordered[0].id).toBe(3);
  });

  it("vazio retorna vazio", () => {
    expect(buildSessionQueue([])).toEqual([]);
  });
});
