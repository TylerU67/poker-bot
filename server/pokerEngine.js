import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let RULES = [];

// Load CSV into memory at startup
export function loadRules() {
  const csvPath = path.join(__dirname, "preflop_rules.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0].split(",");
  RULES = lines.slice(1).map((line) => {
    const parts = line.split(",");
    const obj = {};
    header.forEach((h, i) => {
      obj[h.trim()] = parts[i].trim();
    });
    obj.confidence = parseFloat(obj.confidence);
    return obj;
  });
  console.log(`Loaded ${RULES.length} rules.`);
}

// Helpers to parse cards and group hand into a coarse bucket
const RANK_ORDER = "23456789TJQKA";

function parseHandString(handStr) {
  // Supports "AsKs" or "As Ks"
  let s = handStr.trim();
  let parts = s.split(/\s+/);
  if (parts.length === 1) {
    if (s.length === 4) {
      parts = [s.slice(0, 2), s.slice(2, 4)];
    } else {
      throw new Error("Hand format must be like 'AsKs' or 'As Ks'");
    }
  }
  const cards = parts.map((c) => c.trim());
  if (cards.length !== 2) {
    throw new Error("Exactly 2 cards required for Texas Hold'em hand.");
  }
  return cards;
}

function handToGroup(handStr) {
  const cards = parseHandString(handStr);
  const ranks = cards.map((c) => c[0]);
  const suits = cards.map((c) => c[1]);
  const suited = suits[0] === suits[1];
  const [r1, r2] = ranks.sort(
    (a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b)
  );
  const pair = r1 === r2;
  const highRank = r2;

  // Extremely rough grouping:
  if (pair && "AKQJTT".includes(highRank)) {
    return "premium";
  }
  if (pair) {
    return "strong";
  }
  const highCombo = r1 + r2 + (suited ? "s" : "o");
  const broadwayRanks = new Set(["T", "J", "Q", "K", "A"]);

  if (broadwayRanks.has(r1) && broadwayRanks.has(r2)) {
    // Two broadways
    if (suited) return "premium";
    return "strong";
  }

  // suited connectors-ish
  if (suited && Math.abs(RANK_ORDER.indexOf(r1) - RANK_ORDER.indexOf(r2)) === 1) {
    return "speculative";
  }

  // Anything with an Ace suited
  if (suited && (r1 === "A" || r2 === "A")) {
    return "speculative";
  }

  // Otherwise trash
  return "trash";
}

export function decideAction({
  stage,
  style,
  hand,
  numPlayers,
  potSize,
  toCall
}) {
  stage = (stage || "preflop").toLowerCase();
  style = (style || "tight").toLowerCase();
  const group = handToGroup(hand);

  let rule =
    RULES.find((r) => r.stage === stage && r.style === style && r.group === group) ||
    RULES.find((r) => r.stage === "preflop" && r.style === style && r.group === group) ||
    RULES.find((r) => r.stage === "preflop" && r.style === "tight" && r.group === group);

  if (!rule) {
    rule = {
      stage: "preflop",
      style: "tight",
      group,
      action: "fold",
      confidence: 0.6
    };
  }

  const bestAction = rule.action;
  const confidence = rule.confidence;

  const actions = ["fold", "call", "raise"];
  const breakdown = actions.map((a) => {
    if (a === bestAction) {
      return { action: a, probability: confidence };
    }
    return {
      action: a,
      probability: (1 - confidence) / 2
    };
  });

  const explanation = `You have a ${group.toUpperCase()} ${hand} in a ${style.toUpperCase()} style on ${stage.toUpperCase()} with ${numPlayers} players. The rules suggest ${bestAction.toUpperCase()} with confidence ${(
    confidence * 100
  ).toFixed(0)}%. Pot: ${potSize}, to call: ${toCall}.`;

  return {
    bestAction,
    confidence,
    breakdown,
    explanation
  };
}
