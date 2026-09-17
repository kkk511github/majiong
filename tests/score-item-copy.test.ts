import { expect, it } from "vitest";
import { scoreItemCopy } from "../src/score-item-copy";

it("separates flower counts and points without duplicating the scored value",()=>{
  expect(scoreItemCopy({label:"硬花 6 × 2",value:12})).toEqual({label:"硬花",calculation:"6张 × 2分/张"});
  expect(scoreItemCopy({label:"软花 2 × 2",value:4})).toEqual({label:"软花",calculation:"2个 × 2分/个"});
});
it("explains multiplier rows as extra points, keeping historical values intact",()=>{
  expect(scoreItemCopy({label:"比下胡 × 2",value:36}).calculation).toBe("此前小计 × 2，本行列增加分");
  expect(scoreItemCopy({label:"天胡（三家归零）",value:270}).label).toBe("天胡（三家归零）");
});
