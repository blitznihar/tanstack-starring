/**
 * Builds content/grade3_math.json from the authored items in the Comet prototype
 * (Staar/.../standalone-src.html `practiceBank`). Run: `bun run scripts/build-grade3-math.ts`.
 *
 * Output is a single-upload bundle that validates against contentBundleSchema and
 * is seeded via scripts/seed.ts / the content-import endpoint.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type Opt = { k: string; t: string; correct?: boolean; why?: string };
type Src = { id: string; concept: string; prompt: string; whyRight: string; diff?: "easy" | "medium" | "hard"; opts: Opt[] };

const conceptNames: Record<string, string> = {
  "3.2A": "Place value to 100,000",
  "3.2D": "Comparing numbers",
  "3.4A": "Addition & subtraction",
  "3.4D": "Arrays & multiplication",
  "3.4K": "Multiplication & division word problems",
  "3.5B": "Number patterns",
  "3.3F": "Equivalent fractions",
  "3.3B": "Fractions on a number line",
};
const conceptDifficulty: Record<string, "easy" | "medium" | "hard"> = {
  "3.2A": "easy",
  "3.2D": "easy",
  "3.4A": "medium",
  "3.4D": "medium",
  "3.4K": "medium",
  "3.5B": "medium",
  "3.3F": "hard",
  "3.3B": "hard",
};

// Authored items (32) — ported verbatim from the prototype's practiceBank.
const bank: Src[] = [
  { id: "b1", concept: "3.2A", prompt: "What is the value of the 7 in 4,732?", whyRight: "The 7 sits in the hundreds place, so its value is 7 × 100 = 700.", opts: [{ k: "A", t: "7", why: "That would be the 7 in the ones place — here it is three places over." }, { k: "B", t: "70", why: "That is the tens place; the 7 is one place to the left of that." }, { k: "C", t: "700", correct: true }, { k: "D", t: "7,000", why: "That is the thousands place — the 4 is there, not the 7." }] },
  { id: "b2", concept: "3.2A", prompt: "Which number is fifty-three thousand, six hundred eight?", whyRight: "53 thousands, 6 hundreds, 0 tens, 8 ones → 53,608.", opts: [{ k: "A", t: "53,608", correct: true }, { k: "B", t: "53,680", why: 'This reads "six hundred eighty" — but there are 0 tens, so the tens digit is 0.' }, { k: "C", t: "5,368", why: 'This is only "five thousand" — we need fifty-three thousand.' }, { k: "D", t: "530,608", why: "That is five hundred thirty thousand, far too big." }] },
  { id: "b3", concept: "3.2A", prompt: "In 8,205, which digit is in the tens place?", whyRight: "Counting from the right: 5 ones, 0 tens, 2 hundreds, 8 thousands. The tens digit is 0.", opts: [{ k: "A", t: "8", why: "That is the thousands place." }, { k: "B", t: "2", why: "That is the hundreds place." }, { k: "C", t: "0", correct: true }, { k: "D", t: "5", why: "That is the ones place." }] },
  { id: "b4", concept: "3.2A", prompt: "6,000 + 300 + 40 + 9 = ?", whyRight: "Add each place value together: 6,000 + 300 + 40 + 9 = 6,349.", opts: [{ k: "A", t: "6,349", correct: true }, { k: "B", t: "6,439", why: "The tens and hundreds got swapped — 300 is hundreds, 40 is tens." }, { k: "C", t: "634.9", why: "These are whole-number place values, not decimals." }, { k: "D", t: "6,034", why: "This drops the hundreds; 300 means a 3 in the hundreds place." }] },
  { id: "b5", concept: "3.2D", prompt: "Which symbol makes this true?  4,512 __ 4,521", whyRight: "The thousands and hundreds match. Compare tens: 1 ten < 2 tens, so 4,512 < 4,521.", opts: [{ k: "A", t: ">", why: "That says 4,512 is bigger, but it is smaller in the tens place." }, { k: "B", t: "<", correct: true }, { k: "C", t: "=", why: "They are not equal — the tens digits differ." }, { k: "D", t: "+", why: "A comparison needs <, >, or =, not a plus sign." }] },
  { id: "b6", concept: "3.2D", prompt: "Which number is the greatest?", whyRight: "Compare the thousands place first: 9,087 has 9 thousands, more than all the others.", opts: [{ k: "A", t: "8,999", why: "Close, but 8 thousands is less than 9 thousands." }, { k: "B", t: "9,087", correct: true }, { k: "C", t: "9,078", why: "Same thousands and hundreds; compare ones: 9,087 > 9,078." }, { k: "D", t: "8,909", why: "8 thousands is less than 9 thousands." }] },
  { id: "b7", concept: "3.2D", prompt: "Order from LEAST to greatest: 3,400 · 3,040 · 3,404", whyRight: "Compare place by place: 3,040 < 3,400 < 3,404.", opts: [{ k: "A", t: "3,040 · 3,400 · 3,404", correct: true }, { k: "B", t: "3,400 · 3,404 · 3,040", why: "3,040 is the smallest, so it must come first." }, { k: "C", t: "3,404 · 3,400 · 3,040", why: "That is greatest to least, the reverse order." }, { k: "D", t: "3,400 · 3,040 · 3,404", why: "3,040 is smaller than 3,400, so the first two are out of order." }] },
  { id: "b8", concept: "3.4A", prompt: "347 + 285 = ?", whyRight: "7+5=12 (write 2 carry 1), 4+8+1=13 (write 3 carry 1), 3+2+1=6 → 632.", opts: [{ k: "A", t: "522", why: "It looks like the carrying was skipped when adding the tens." }, { k: "B", t: "632", correct: true }, { k: "C", t: "512", why: "Remember to carry the 1 from 7+5=12." }, { k: "D", t: "612", why: "Close — recheck the tens column: 4+8+1 carried = 13." }] },
  { id: "b9", concept: "3.4A", prompt: "500 − 236 = ?", whyRight: "Borrow across the zeros: 500 − 236 = 264.", opts: [{ k: "A", t: "264", correct: true }, { k: "B", t: "336", why: "This subtracted the wrong way in a column; borrowing from the zeros is needed." }, { k: "C", t: "274", why: "Recheck the ones and tens after borrowing." }, { k: "D", t: "364", why: "The hundreds digit drops to 2 after borrowing, not 3." }] },
  { id: "b10", concept: "3.4A", prompt: "Lia had 412 stickers and gave away 158. How many are left?", whyRight: "Subtract: 412 − 158 = 254 stickers left.", opts: [{ k: "A", t: "254", correct: true }, { k: "B", t: "346", why: "That adds instead of subtracts — she gave some away, so we take away." }, { k: "C", t: "264", why: "Recheck the borrow in the tens place." }, { k: "D", t: "570", why: 'This adds the two numbers; "gave away" means subtract.' }] },
  { id: "b11", concept: "3.4A", prompt: "Round 462 to the nearest hundred.", whyRight: "The tens digit is 6, which is 5 or more, so round up to 500.", opts: [{ k: "A", t: "400", why: "We round down only when the tens digit is 4 or less; here it is 6." }, { k: "B", t: "460", why: "That rounds to the nearest ten, not the nearest hundred." }, { k: "C", t: "500", correct: true }, { k: "D", t: "470", why: "That is not a hundred; nearest hundred means 400 or 500." }] },
  { id: "b12", concept: "3.4D", prompt: "An array has 5 rows of 3. How many in all?", whyRight: "5 rows × 3 in each row = 15.", opts: [{ k: "A", t: "8", why: "That adds 5+3; an array means multiply rows by columns." }, { k: "B", t: "15", correct: true }, { k: "C", t: "53", why: "Those are just the two numbers stuck together, not a product." }, { k: "D", t: "10", why: "That is 5×2; each row has 3, not 2." }] },
  { id: "b13", concept: "3.4D", prompt: "Which equation matches 4 groups of 6?", whyRight: "4 groups of 6 means 4 × 6 = 24.", opts: [{ k: "A", t: "4 + 6 = 10", why: "Groups means multiply, not add." }, { k: "B", t: "4 × 6 = 24", correct: true }, { k: "C", t: "6 − 4 = 2", why: "Subtraction does not show equal groups." }, { k: "D", t: "6 ÷ 4", why: "Division splits into groups; here we are combining equal groups." }] },
  { id: "b14", concept: "3.4D", prompt: "7 × 8 = ?", whyRight: "7 × 8 = 56 (think 7×8 = 7×4 doubled = 28 doubled = 56).", opts: [{ k: "A", t: "54", why: "Close — recount; 7×8 is 56, not 54." }, { k: "B", t: "15", why: "That is 7+8; the × sign means multiply." }, { k: "C", t: "56", correct: true }, { k: "D", t: "64", why: "That is 8×8; one factor here is 7." }] },
  { id: "b15", concept: "3.4D", prompt: "Which array shows 2 × 6?", whyRight: "2 × 6 is 2 rows with 6 in each row (or 6 rows of 2).", opts: [{ k: "A", t: "2 rows of 6", correct: true }, { k: "B", t: "3 rows of 6", why: "That is 3 × 6 = 18, not 2 × 6." }, { k: "C", t: "2 rows of 5", why: "That is 2 × 5 = 10; each row needs 6." }, { k: "D", t: "6 rows of 6", why: "That is 6 × 6 = 36." }] },
  { id: "b16", concept: "3.4K", prompt: "A bag has 12 marbles shared equally into 3 cups. How many in each cup?", whyRight: "Share equally = divide: 12 ÷ 3 = 4 in each cup.", opts: [{ k: "A", t: "3", why: "That is the number of cups, not how many go in each." }, { k: "B", t: "4", correct: true }, { k: "C", t: "6", why: "That would split into 2 cups, but there are 3." }, { k: "D", t: "9", why: 'That subtracts 12−3; "shared equally" means divide.' }] },
  { id: "b17", concept: "3.4K", prompt: "6 packs of pencils, 5 in each pack. How many pencils?", whyRight: "Equal groups = multiply: 6 × 5 = 30 pencils.", opts: [{ k: "A", t: "11", why: "That adds 6+5; equal groups means multiply." }, { k: "B", t: "30", correct: true }, { k: "C", t: "1", why: "That divides 6÷6; we want the total pencils." }, { k: "D", t: "25", why: "That is 5×5; there are 6 packs, not 5." }] },
  { id: "b18", concept: "3.4K", prompt: "24 students sit in rows of 4. How many rows?", whyRight: "Split into equal rows = divide: 24 ÷ 4 = 6 rows.", opts: [{ k: "A", t: "6", correct: true }, { k: "B", t: "20", why: "That subtracts 24−4; we need to split into groups." }, { k: "C", t: "28", why: "That adds; the students are being split up, not combined." }, { k: "D", t: "8", why: "That is 24÷3; each row holds 4, not 3." }] },
  { id: "b19", concept: "3.4K", prompt: "Ben reads 3 pages a day. How many pages in 7 days?", whyRight: "Same amount each day = multiply: 3 × 7 = 21 pages.", opts: [{ k: "A", t: "10", why: 'That adds 3+7; "each day" repeats, so multiply.' }, { k: "B", t: "21", correct: true }, { k: "C", t: "4", why: "That is 7−3; nothing is being taken away." }, { k: "D", t: "37", why: "Those are the digits stuck together, not a product." }] },
  { id: "b20", concept: "3.5B", prompt: "What comes next?  4, 8, 12, 16, __", whyRight: "The pattern adds 4 each time: 16 + 4 = 20.", opts: [{ k: "A", t: "18", why: "That adds only 2; the step here is +4." }, { k: "B", t: "20", correct: true }, { k: "C", t: "24", why: "That skips ahead by 8; each step is +4." }, { k: "D", t: "17", why: "That adds 1; look at the gap between terms." }] },
  { id: "b21", concept: "3.5B", prompt: "Skip count by 5: 25, 30, 35, __", whyRight: "Add 5 each time: 35 + 5 = 40.", opts: [{ k: "A", t: "36", why: "That adds 1; we are skip-counting by 5." }, { k: "B", t: "45", why: "That skips a step (added 10)." }, { k: "C", t: "40", correct: true }, { k: "D", t: "50", why: "That jumps too far; the next term after 35 is 40." }] },
  { id: "b22", concept: "3.5B", prompt: 'The rule is "add 3." If the input is 9, what is the output?', whyRight: "Apply the rule: 9 + 3 = 12.", opts: [{ k: "A", t: "12", correct: true }, { k: "B", t: "6", why: "That subtracts 3; the rule says add." }, { k: "C", t: "27", why: "That multiplies by 3; the rule is add 3." }, { k: "D", t: "3", why: "That is just the rule number, not 9 + 3." }] },
  { id: "b23", concept: "3.3F", prompt: "Which fraction is the same as one half?", whyRight: "2/4 means 2 out of 4 equal parts, which fills the same space as 1/2.", opts: [{ k: "A", t: "2/4", correct: true }, { k: "B", t: "1/3", why: "1/3 is less than half — 3 parts means each is smaller." }, { k: "C", t: "3/4", why: "3/4 is more than half." }, { k: "D", t: "1/5", why: "1/5 is much less than half." }] },
  { id: "b24", concept: "3.3F", prompt: "Which fraction equals 1 whole?", whyRight: "When the top and bottom numbers match (4/4), all the parts are filled = 1 whole.", opts: [{ k: "A", t: "3/4", why: "One part is still missing." }, { k: "B", t: "4/4", correct: true }, { k: "C", t: "1/4", why: "Only one part out of four is filled." }, { k: "D", t: "4/8", why: "4/8 is one half, not a whole." }] },
  { id: "b25", concept: "3.3F", prompt: "Which is the same as 2/6?", whyRight: "Divide top and bottom by 2: 2/6 = 1/3.", opts: [{ k: "A", t: "1/3", correct: true }, { k: "B", t: "1/2", why: "1/2 would be 3/6, not 2/6." }, { k: "C", t: "2/3", why: "That is 4/6; we only have 2 parts shaded." }, { k: "D", t: "1/6", why: "That is half of 2/6." }] },
  { id: "b26", concept: "3.3F", prompt: "Two pizzas are cut differently. Which shows the same amount as 1/2?", whyRight: "Any fraction worth half — like 3/6 — covers the same amount as 1/2.", opts: [{ k: "A", t: "3/6", correct: true }, { k: "B", t: "2/3", why: "2/3 is more than half." }, { k: "C", t: "1/4", why: "1/4 is less than half." }, { k: "D", t: "3/8", why: "3/8 is a little less than half (half would be 4/8)." }] },
  { id: "b27", concept: "3.3F", prompt: "Which fraction is greater: 3/4 or 1/4?", whyRight: "Same bottom number, so compare tops: 3 parts is more than 1 part — 3/4 is greater.", opts: [{ k: "A", t: "3/4", correct: true }, { k: "B", t: "1/4", why: "Fewer parts shaded means it is the smaller fraction." }, { k: "C", t: "They are equal", why: "The tops differ, so they are not equal." }, { k: "D", t: "Cannot tell", why: "Same denominator lets us compare easily." }] },
  { id: "b28", concept: "3.3F", prompt: "A shape has 8 equal parts and 4 are shaded. What fraction is that?", whyRight: "4 shaded out of 8 parts = 4/8, which is the same as 1/2.", opts: [{ k: "A", t: "4/8", correct: true }, { k: "B", t: "8/4", why: "The shaded parts go on top, the total on the bottom." }, { k: "C", t: "4/4", why: "That would mean all 8 are shaded." }, { k: "D", t: "1/4", why: "1/4 of 8 is only 2 parts." }] },
  { id: "b29", concept: "3.3B", prompt: "On a line from 0 to 1 split into 4 parts, where is 3/4?", whyRight: "Count 3 jumps of 1/4 from 0 — that lands on the 3rd mark.", opts: [{ k: "A", t: "1st mark", why: "That is 1/4." }, { k: "B", t: "2nd mark", why: "That is 2/4." }, { k: "C", t: "3rd mark", correct: true }, { k: "D", t: "at the 1", why: "The 1 is 4/4, a whole." }] },
  { id: "b30", concept: "3.3B", prompt: "A number line 0 to 1 is split into 3 equal parts. What is the first mark?", whyRight: "3 equal parts means each jump is 1/3, so the first mark is 1/3.", opts: [{ k: "A", t: "1/3", correct: true }, { k: "B", t: "1/4", why: "That would be 4 equal parts, not 3." }, { k: "C", t: "1/2", why: "Half would be between the 1st and 2nd marks of thirds." }, { k: "D", t: "3/3", why: "3/3 is the whole, at the far right." }] },
  { id: "b31", concept: "3.3B", prompt: "Which point is closest to 1 whole?", whyRight: "The closer the top is to the bottom, the closer to 1. 5/6 is nearly whole.", opts: [{ k: "A", t: "1/6", why: "That is near 0." }, { k: "B", t: "3/6", why: "That is exactly halfway." }, { k: "C", t: "5/6", correct: true }, { k: "D", t: "2/6", why: "That is closer to 0 than to 1." }] },
  { id: "b32", concept: "3.3B", prompt: "On a line split into halves, where does 1/2 sit?", whyRight: "1/2 is exactly one jump of one half — the middle mark between 0 and 1.", opts: [{ k: "A", t: "At the middle", correct: true }, { k: "B", t: "At 0", why: "0 is the start, before any jumps." }, { k: "C", t: "At 1", why: "1 is the whole, two halves over." }, { k: "D", t: "Past 1", why: "1/2 is less than a whole, so it stays before 1." }] },
];

const items = bank.map((src) => ({
  standardCodes: [src.concept],
  type: "multiple_choice" as const,
  difficulty: src.diff ?? conceptDifficulty[src.concept] ?? "medium",
  prompt: [src.prompt],
  figures: [],
  options: src.opts.map((o) => ({
    key: o.k,
    text: o.t,
    ...(o.correct ? { correct: true } : {}),
    ...(o.why ? { rationale: o.why } : {}),
  })),
  points: 1,
  allowPartialCredit: false,
  explanation: [src.whyRight],
  workedSolution: [src.whyRight],
}));

const usedConcepts = [...new Set(bank.map((b) => b.concept))];
const standards = usedConcepts.map((code) => ({
  code,
  programKey: "grade3_staar",
  subject: "math",
  reportingCategory: code.startsWith("3.2") ? "Numerical Representations" : code.startsWith("3.3") ? "Fractions" : code.startsWith("3.4") ? "Computations & Algebraic Relationships" : "Patterns",
  description: conceptNames[code] ?? code,
}));

const bundle = {
  programKey: "grade3_staar",
  subject: "math",
  version: 1,
  status: "available",
  title: "Grade 3 Math",
  standards,
  items,
};

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "content", "grade3_math.json");
writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
console.log(`Wrote ${items.length} items across ${usedConcepts.length} pools → ${out}`);
