import { describe, expect, it } from "vitest";
import { applyProposal } from "@/lib/map/applyProposal";
import { buildPreview } from "@/lib/map/diff";
import { SAMPLE_MAP } from "@/lib/map/sample";
import { toOperations } from "@/lib/map/schema";
import type { Operation, Proposal } from "@/lib/map/types";
import { validateProposal } from "@/lib/map/validateProposal";

const ids = (m: { nodes: { id: string }[] }) => m.nodes.map((n) => n.id);
const seqId = () => {
  let i = 0;
  return () => `x${i++}`;
};

describe("applyProposal", () => {
  it("adds, updates and deletes (with descendants)", () => {
    const ops: Operation[] = [
      { op: "add", id: "new_1", parentId: "t3", label: "朝30分を確保する", kind: "plan", reason: "" },
      { op: "add", id: "new_2", parentId: "new_1", label: "6時に起きる", kind: "action", reason: "" },
      { op: "update", id: "p1", label: "Webライティングで初案件を取る", reason: "" },
      { op: "delete", id: "t2", reason: "" },
    ];
    const r = applyProposal(SAMPLE_MAP, ops, () => true, seqId());
    expect(r.skipped).toEqual([]);
    expect(ids(r.map)).toEqual(["t1", "t3", "t4", "x0", "x1"]); // t2 配下の p1, a1 も消える
    expect(r.map.nodes.find((n) => n.id === "x1")?.parentId).toBe("x0");
  });

  it("skips ops whose prerequisite was not approved", () => {
    const ops: Operation[] = [
      { op: "add", id: "new_1", parentId: "t3", label: "朝30分を確保する", kind: "plan", reason: "" },
      { op: "add", id: "new_2", parentId: "new_1", label: "6時に起きる", kind: "action", reason: "" },
      { op: "update", id: "a1", label: "記事を2本書く", reason: "" },
    ];
    const r = applyProposal(SAMPLE_MAP, ops, (i) => i !== 0, seqId());
    expect(r.applied).toEqual([2]);
    expect(r.skipped.map((s) => s.index)).toEqual([1]);
  });

  it("does not mutate the input map", () => {
    const before = JSON.stringify(SAMPLE_MAP);
    applyProposal(SAMPLE_MAP, [{ op: "delete", id: "t2", reason: "" }]);
    expect(JSON.stringify(SAMPLE_MAP)).toBe(before);
  });
});

describe("validateProposal", () => {
  const agent = { mode: "agent" as const, selectedId: null };

  it("accepts a valid proposal", () => {
    const p: Proposal = {
      summary: "",
      operations: [{ op: "add", id: "n1", parentId: "t3", label: "スキマ時間を使う", kind: "plan", reason: "" }],
    };
    expect(validateProposal(SAMPLE_MAP, p, agent)).toEqual([]);
  });

  it("rejects unknown ids, hierarchy violations and root deletion", () => {
    const p: Proposal = {
      summary: "",
      operations: [
        { op: "update", id: "ghost", label: "x", reason: "" },
        { op: "add", id: "n1", parentId: "a1", label: "行動の下の思考", kind: "thought", reason: "" },
        { op: "update", id: "p1", kind: "action", reason: "" }, // 親が思考なので行動にはできない
        { op: "delete", id: "t1", reason: "" },
      ],
    };
    const errors = validateProposal(SAMPLE_MAP, p, agent);
    expect(errors).toHaveLength(4);
  });

  it("restricts Edit mode to the selected node and its children", () => {
    const p: Proposal = {
      summary: "",
      operations: [
        { op: "update", id: "t3", label: "平日は1日30分しかない", reason: "" },
        { op: "add", id: "n1", parentId: "t1", label: "別の場所", kind: "thought", reason: "" },
        { op: "delete", id: "a1", reason: "" },
      ],
    };
    const errors = validateProposal(SAMPLE_MAP, p, { mode: "edit", selectedId: "t3" });
    expect(errors.some((e) => e.includes("直下"))).toBe(true);
    expect(errors.some((e) => e.includes("削除"))).toBe(true);
    expect(errors.some((e) => e.includes("選択中のノード（t3）以外"))).toBe(false);
  });

  it("rejects empty proposals", () => {
    expect(validateProposal(SAMPLE_MAP, { summary: "", operations: [] }, agent)).not.toEqual([]);
  });
});

describe("toOperations", () => {
  it("converts the flat LLM shape into typed operations", () => {
    const p = toOperations({
      summary: "s",
      operations: [
        { op: "update", id: "p1", parentId: null, label: null, kind: "plan", reason: "r" },
        { op: "delete", id: "a1", parentId: null, label: null, kind: null, reason: "r" },
      ],
    });
    expect(p.operations[0]).toEqual({ op: "update", id: "p1", kind: "plan", reason: "r" });
    expect(p.operations[1]).toEqual({ op: "delete", id: "a1", reason: "r" });
  });
});

describe("buildPreview", () => {
  it("marks added / updated / deleted nodes without dropping deleted ones", () => {
    const nodes = buildPreview(SAMPLE_MAP, [
      { op: "add", id: "n1", parentId: "t3", label: "朝活", kind: "plan", reason: "" },
      { op: "update", id: "p1", label: "新しい名前", reason: "" },
      { op: "delete", id: "t2", reason: "" },
    ]);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId["preview:n1"].status).toBe("added");
    expect(byId["p1"].status).toBe("deleted"); // t2 削除に巻き込まれる
    expect(byId["a1"].status).toBe("deleted");
    expect(byId["t2"].status).toBe("deleted");
    expect(nodes).toHaveLength(SAMPLE_MAP.nodes.length + 1);
  });
});
