/**
 * Builds content/grade3_rla.json — the Grade 3 Reading/Language Arts bundle (§20.2).
 * Run: `bun run scripts/build-grade3-rla.ts`.
 *
 * RLA is at PARITY with Math: its own ≥30-item practice bank, original passages,
 * and the FULL item-type range — multiple_choice, multiselect (Select TWO),
 * text_entry, inline_choice (drop-down), multipart (Part A/B evidence), hot_text,
 * plus written SCR (2-pt) and ECR (5-pt) scored by the local model (§8).
 *
 * All passages are ORIGINAL (§18) — no copyrighted text. The builder self-validates
 * against contentBundleSchema before writing, so a bad answer key fails fast here.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { contentBundleSchema } from "~/schemas/contentBundle.js";

type Para = { n: number; text: string };
const p = (...lines: string[]): Para[] => lines.map((text, i) => ({ n: i + 1, text }));

// ---------------------------------------------------------------------------
// Passages (original)
// ---------------------------------------------------------------------------
const passages = [
  {
    id: "garden",
    title: "The Class Garden",
    genre: "informational",
    level: "Grade 3 · 530L",
    paras: p(
      "Last spring, Room 12 turned a weedy strip of dirt behind the school into a vegetable garden. Mr. Diaz warned that the hard, dry ground would need a lot of work before a single seed could grow.",
      "First, the students pulled the weeds and broke up the packed dirt with small shovels. The work was slow, and by recess their hands were sore. Still, no one wanted to quit.",
      "Next, they mixed in compost — dark, crumbly material made from old leaves and vegetable scraps. Compost adds nutrients, the things plants need to grow strong and healthy. The soil that had been pale and dusty turned a rich brown.",
      "The class planted beans, carrots, and tomatoes. Each student took charge of one row and watered it every morning. They kept a notebook to record how tall the sprouts grew.",
      "By the end of May, the garden was bursting with green. The bean vines climbed up their strings like ladders, and the tomatoes turned from green to red. The harvest filled three big baskets.",
      "The class shared the vegetables with the school kitchen. Mr. Diaz smiled and said the best crop of all was how much patience the students had grown along the way.",
    ),
  },
  {
    id: "lighthouse",
    title: "Mira and the Lighthouse",
    genre: "literary",
    level: "Grade 3 · 560L",
    paras: p(
      "Mira lived with her grandfather in a tall white lighthouse at the edge of the bay. Every evening, Grandpa climbed the spiral stairs that curled up the tower to light the great lamp so ships could find their way home.",
      "One stormy night, the wind howled and rain slapped the windows. Halfway up the stairs, Grandpa stopped and pressed a hand to his knee. \"It's acting up again,\" he said. \"I'm not sure I can make the climb tonight.\"",
      "Mira looked out at the churning, crashing sea. Somewhere out there a fishing boat would be searching for the light. Her heart pounded, but she squared her shoulders. \"I'll go,\" she said. \"Tell me what to do.\"",
      "Step by step, Grandpa guided her from his chair below. Mira reached the lamp room, struck the match just as he had shown her a hundred times, and the warm beam swept out across the water like a golden road.",
      "Minutes later, a horn sounded from the bay — three short blasts, the fishing boat's way of saying thank you. Grandpa's eyes shone. \"You kept the light, Mira,\" he said softly. \"You kept us all safe.\"",
      "From that night on, Mira climbed the stairs beside her grandfather every evening, proud to be the lighthouse keeper's helper.",
    ),
  },
  {
    id: "bats",
    title: "Backyard Bats",
    genre: "informational",
    level: "Grade 3 · 540L",
    paras: p(
      "When people think of bats, they often imagine something spooky. But bats are some of the most helpful animals in your neighborhood.",
      "A single little brown bat can eat more than a thousand insects in one hour. Many of those insects are mosquitoes, so bats help keep pesky bugs away from yards and gardens.",
      "Bats help plants, too. As they fly from flower to flower sipping nectar, the sweet liquid inside blossoms, they carry yellow pollen with them. That helps fruits like bananas and mangoes grow.",
      "Bats find their food in the dark using sound. They make tiny squeaks and listen for the echoes that bounce back, like a shout returning in a canyon. This clever trick is called echolocation.",
      "You can help bats by leaving old trees standing and by putting up a bat house. When we protect bats, they keep right on protecting us.",
    ),
  },
] as const;

const passageBodies = Object.fromEntries(
  passages.map((pg) => [pg.id, pg.paras.map((para) => ({ kind: "paragraph" as const, text: `${para.n}. ${para.text}` }))]),
);

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------
type Diff = "easy" | "medium" | "hard";
type RawItem = Record<string, unknown>;
const items: RawItem[] = [];
const base = (concept: string, passageRef: string, difficulty: Diff) => ({
  standardCodes: [concept],
  difficulty,
  passageRef,
  figures: [] as unknown[],
  points: 1,
  allowPartialCredit: false,
});

type Opt = { k: string; t: string; correct?: boolean; why?: string };
function mc(concept: string, passageRef: string, diff: Diff, prompt: string, opts: Opt[], why: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "multiple_choice",
    prompt: [prompt],
    options: opts.map((o) => ({ key: o.k, text: o.t, ...(o.correct ? { correct: true } : {}), ...(o.why ? { rationale: o.why } : {}) })),
    explanation: [why],
    workedSolution: [why],
  });
}
function multi(concept: string, passageRef: string, diff: Diff, prompt: string, opts: Opt[], why: string, partial = false) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "multiselect",
    prompt: [prompt],
    allowPartialCredit: partial,
    points: 1,
    options: opts.map((o) => ({ key: o.k, text: o.t, ...(o.correct ? { correct: true } : {}), ...(o.why ? { rationale: o.why } : {}) })),
    explanation: [why],
    workedSolution: [why],
  });
}
function inlineC(concept: string, passageRef: string, diff: Diff, prompt: string, choices: string[], correct: string, why: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "inline_choice",
    prompt: [prompt],
    blanks: { b1: correct },
    options: choices.map((c) => ({ key: c, text: c, ...(c === correct ? { correct: true } : {}) })),
    explanation: [why],
    workedSolution: [why],
  });
}
function textE(concept: string, passageRef: string, diff: Diff, prompt: string, answer: string, why: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "text_entry",
    prompt: [prompt],
    answer,
    explanation: [why],
    workedSolution: [why],
  });
}
function hot(concept: string, passageRef: string, diff: Diff, prompt: string, tokens: { id: string; text: string }[], correct: string[], why: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "hot_text",
    prompt: [prompt],
    tokens,
    correct,
    explanation: [why],
    workedSolution: [why],
  });
}
type Part = { id: string; prompt: string; opts: Opt[] };
function multipart(concept: string, passageRef: string, diff: Diff, lead: string, parts: Part[], why: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type: "multipart",
    prompt: [lead],
    points: parts.length,
    allowPartialCredit: true,
    parts: parts.map((pt) => ({
      id: pt.id,
      prompt: [pt.prompt],
      type: "multiple_choice",
      options: pt.opts.map((o) => ({ key: o.k, text: o.t, ...(o.correct ? { correct: true } : {}), ...(o.why ? { rationale: o.why } : {}) })),
    })),
    explanation: [why],
    workedSolution: [why],
  });
}
function written(type: "scr" | "ecr", concept: string, passageRef: string, diff: Diff, prompt: string, maxPoints: number, criteria: [string, string, number][], exemplar: string) {
  items.push({
    ...base(concept, passageRef, diff),
    type,
    prompt: [prompt],
    points: maxPoints,
    rubric: { maxPoints, criteria: criteria.map(([id, description, points]) => ({ id, description, points })) },
    explanation: [exemplar],
    workedSolution: [exemplar],
  });
}

// ===========================================================================
// THE CLASS GARDEN (informational)
// ===========================================================================
mc("3.9D", "garden", "easy", "What is “The Class Garden” MOSTLY about?", [
  { k: "A", t: "A class that grows a vegetable garden behind the school", correct: true },
  { k: "B", t: "How to cook fresh vegetables", why: "The passage is about growing the garden, not cooking." },
  { k: "C", t: "A big storm that floods a school", why: "There is no storm in this passage." },
  { k: "D", t: "A field trip to a farm", why: "The class works on their own garden, not a farm trip." },
], "The whole passage follows Room 12 as they turn a weedy strip into a garden — that is the central idea.");
mc("3.10A", "garden", "medium", "The author wrote this passage mainly to —", [
  { k: "A", t: "inform readers about how a class grew a garden", correct: true },
  { k: "B", t: "tell a make-believe adventure story", why: "These are real steps, not a make-believe story." },
  { k: "C", t: "persuade readers to stop eating vegetables", why: "The author never argues against vegetables." },
  { k: "D", t: "give a recipe for tomato soup", why: "No recipe appears anywhere in the passage." },
], "The passage explains real steps and facts, so the author's purpose is to inform.");
mc("3.6F", "garden", "medium", "By the end of the passage, the students most likely feel —", [
  { k: "A", t: "proud of what they accomplished", correct: true },
  { k: "B", t: "bored with the garden", why: "They worked hard and shared the harvest — not signs of boredom." },
  { k: "C", t: "angry at Mr. Diaz", why: "Nothing shows the students are upset with their teacher." },
  { k: "D", t: "afraid of the vegetables", why: "There is no reason for fear in the passage." },
], "They turned hard dirt into a full harvest and shared it — the details point to pride.");
mc("3.3B", "garden", "medium", "In paragraph 3, the word “nutrients” means —", [
  { k: "A", t: "things plants need to grow strong", correct: true, },
  { k: "B", t: "kinds of weeds", why: "Weeds were pulled out earlier; nutrients help plants, not hurt them." },
  { k: "C", t: "small garden tools", why: "Tools were the shovels in paragraph 2, not nutrients." },
  { k: "D", t: "colors of the soil", why: "Color is described separately ('rich brown')." },
], "The sentence says compost adds nutrients, 'the things plants need to grow strong and healthy.'");
mc("3.7C", "garden", "medium", "Which detail BEST shows that preparing the soil was hard work?", [
  { k: "A", t: "“by recess their hands were sore”", correct: true },
  { k: "B", t: "“the tomatoes turned from green to red”", why: "That shows the plants growing, not the difficulty of the work." },
  { k: "C", t: "“They kept a notebook”", why: "The notebook records growth; it does not show hard work." },
  { k: "D", t: "“Mr. Diaz smiled”", why: "Smiling shows happiness at the end, not hard work." },
], "Sore hands by recess is direct evidence that the soil work was difficult.");
mc("3.6F", "garden", "easy", "Why did the class keep a notebook?", [
  { k: "A", t: "to record how tall the sprouts grew", correct: true },
  { k: "B", t: "to draw pictures of bugs", why: "The passage does not mention drawing bugs." },
  { k: "C", t: "to write a story", why: "The notebook tracks the plants, not stories." },
  { k: "D", t: "to list the students' names", why: "No name list is mentioned." },
], "Paragraph 4 says they 'kept a notebook to record how tall the sprouts grew.'");
mc("3.7D", "garden", "medium", "Which step happened FIRST?", [
  { k: "A", t: "The students pulled weeds and broke up the dirt", correct: true },
  { k: "B", t: "They planted beans, carrots, and tomatoes", why: "Planting came after the soil was prepared." },
  { k: "C", t: "They shared vegetables with the kitchen", why: "Sharing happened at the very end." },
  { k: "D", t: "The harvest filled three baskets", why: "The harvest was one of the last events." },
], "The order is: pull weeds → add compost → plant → harvest → share. Pulling weeds is first.");
mc("3.3B", "garden", "hard", "In paragraph 5, “bursting with green” means the garden was —", [
  { k: "A", t: "full of healthy growing plants", correct: true },
  { k: "B", t: "empty and bare", why: "'Bursting with green' is the opposite of empty." },
  { k: "C", t: "painted green", why: "The green is from living plants, not paint." },
  { k: "D", t: "on fire", why: "'Bursting' here is a lively image of growth, not flames." },
], "'Bursting with green' is a vivid way of saying the garden was packed with thriving plants.");

multi("3.6G", "garden", "medium", "Select TWO things the students did to PREPARE the soil before planting seeds.", [
  { k: "A", t: "Pulled the weeds and broke up the dirt", correct: true },
  { k: "B", t: "Mixed in compost", correct: true },
  { k: "C", t: "Watered each row every morning", why: "Watering happened after planting, not while preparing the soil." },
  { k: "D", t: "Shared vegetables with the kitchen", why: "Sharing happened at the very end." },
  { k: "E", t: "Climbed the bean strings", why: "The bean vines climbed the strings — the students did not." },
], "Preparing the soil = pulling weeds/breaking dirt and mixing in compost (paragraphs 2–3).");
inlineC("3.10A", "garden", "easy", "Choose the word that best completes the sentence about the text:  “The Class Garden” is a piece of ______ writing.", ["informational", "fairy-tale", "poetry"], "informational", "It gives real facts and steps about growing a garden, so it is informational writing.");
textE("3.3B", "garden", "medium", "In paragraph 3, find the word that names the dark, crumbly material made from old leaves and vegetable scraps. Write the word.", "compost", "Paragraph 3 names that material 'compost.'");
hot("3.7C", "garden", "hard", "Click the sentence that BEST shows the soil got better after the class worked on it.", [
  { id: "t1", text: "The work was slow, and by recess their hands were sore." },
  { id: "t2", text: "The soil that had been pale and dusty turned a rich brown." },
  { id: "t3", text: "Each student took charge of one row and watered it every morning." },
  { id: "t4", text: "The harvest filled three big baskets." },
], ["t2"], "Pale, dusty soil turning 'a rich brown' is the evidence that the soil improved.");
multipart("3.6F", "garden", "hard", "Answer Part A and Part B.", [
  { id: "A", prompt: "Part A: Why did the soil change from pale and dusty to a rich brown?", opts: [
    { k: "A", t: "The students mixed in compost", correct: true },
    { k: "B", t: "It rained for many days", why: "Rain is not mentioned as the reason in the passage." },
    { k: "C", t: "They painted the soil", why: "Soil is not painted; the color came from compost." },
    { k: "D", t: "They pulled out the weeds", why: "Pulling weeds came first but did not change the soil's color." },
  ] },
  { id: "B", prompt: "Part B: Which sentence from the passage BEST supports your answer to Part A?", opts: [
    { k: "A", t: "“The work was slow, and by recess their hands were sore.”", why: "This is about the hard work, not the soil's color." },
    { k: "B", t: "“Next, they mixed in compost … The soil that had been pale and dusty turned a rich brown.”", correct: true },
    { k: "C", t: "“Each student took charge of one row.”", why: "This is about caring for rows, not the soil changing color." },
    { k: "D", t: "“The harvest filled three big baskets.”", why: "This happens at the very end, after the soil was ready." },
  ] },
], "Adding compost is what changed the soil, and the sentence about compost turning it 'a rich brown' is the evidence.");
written("scr", "3.7D", "garden", "medium",
  "In two or three sentences, summarize how Room 12 turned the weedy strip into a vegetable garden. Use details from the passage.", 2,
  [["steps", "Names the key steps in order (clear weeds/dirt, add compost, plant, water, harvest).", 1], ["evidence", "Uses accurate details from the passage.", 1]],
  "Room 12 first pulled the weeds and broke up the hard dirt. Then they mixed in compost to add nutrients, planted beans, carrots, and tomatoes, and watered them every day. By May they had a big harvest to share.");
written("ecr", "3.7C", "garden", "hard",
  "At the end, Mr. Diaz says the best crop was the patience the students grew. Write a paragraph explaining what he means. Use at least two details from the passage to support your answer.", 5,
  [["claim", "States a clear idea of what the teacher means.", 1], ["evidence", "Includes at least two relevant details from the passage.", 2], ["explanation", "Explains how the details support the idea.", 1], ["conventions", "Writing is organized and easy to follow.", 1]],
  "Mr. Diaz means the students learned to wait and keep working even when things were hard. At first the dirt was so packed their hands got sore, but they did not quit. They watered every morning and waited weeks for the sprouts to grow before the big harvest. Growing the garden slowly taught them patience, which is why he calls it the best crop.");

// ===========================================================================
// MIRA AND THE LIGHTHOUSE (literary)
// ===========================================================================
mc("3.8B", "lighthouse", "easy", "At the beginning of the story, who lights the lamp each evening?", [
  { k: "A", t: "Grandpa", correct: true },
  { k: "B", t: "Mira", why: "Mira lights it only on the stormy night, not at the beginning." },
  { k: "C", t: "the fishing crew", why: "The crew is out at sea looking for the light." },
  { k: "D", t: "a neighbor", why: "No neighbor appears in the story." },
], "Paragraph 1 says every evening Grandpa climbed the stairs to light the great lamp.");
mc("3.6F", "lighthouse", "medium", "Why does Mira go up the stairs herself that night?", [
  { k: "A", t: "Grandpa's knee hurts, so he cannot make the climb", correct: true },
  { k: "B", t: "She wants to play in the lamp room", why: "She goes because the boat needs light, not to play." },
  { k: "C", t: "Grandpa has fallen asleep", why: "Grandpa is awake and guides her from his chair." },
  { k: "D", t: "The lamp is broken", why: "The lamp works fine once she lights it." },
], "Grandpa presses his sore knee and says he cannot climb, so Mira goes instead.");
mc("3.10D", "lighthouse", "hard", "Read this sentence: “the warm beam swept out across the water like a golden road.” This is an example of —", [
  { k: "A", t: "a simile, because it compares two things using “like”", correct: true },
  { k: "B", t: "a question the author asks", why: "It is a statement, not a question." },
  { k: "C", t: "a fact you could look up", why: "It is a poetic comparison, not a checkable fact." },
  { k: "D", t: "a list of steps", why: "There is no list in the sentence." },
], "A simile compares two things using 'like' or 'as' — here the beam is compared to a golden road.");
mc("3.3B", "lighthouse", "medium", "In paragraph 1, “spiral stairs” are stairs that —", [
  { k: "A", t: "wind around in a curl going up", correct: true },
  { k: "B", t: "are cracked and broken", why: "Nothing says the stairs are broken." },
  { k: "C", t: "lead outside the tower", why: "The stairs lead up to the lamp inside the tower." },
  { k: "D", t: "are painted bright red", why: "Their color is not described." },
], "The text says the spiral stairs 'curled up the tower,' so spiral means winding around.");
mc("3.8C", "lighthouse", "medium", "What lesson does the story teach?", [
  { k: "A", t: "Helping others can take courage", correct: true },
  { k: "B", t: "Always stay inside during a storm", why: "The story celebrates Mira's brave action, not staying put." },
  { k: "C", t: "Lighthouses are very old buildings", why: "That is a fact, not the lesson of the story." },
  { k: "D", t: "Fishing boats are dangerous", why: "The boat is helped, not shown as dangerous." },
], "Mira is scared but helps anyway, teaching that helping others can take courage.");
mc("3.8B", "lighthouse", "easy", "How does Grandpa feel about Mira at the end?", [
  { k: "A", t: "proud", correct: true },
  { k: "B", t: "angry", why: "His eyes shine and he praises her — that is pride, not anger." },
  { k: "C", t: "bored", why: "He is moved by what she did, not bored." },
  { k: "D", t: "frightened", why: "The danger has passed and he is grateful." },
], "Grandpa's eyes shine and he says she kept everyone safe — he is proud.");
mc("3.6F", "lighthouse", "medium", "The three short horn blasts from the boat are a way of saying —", [
  { k: "A", t: "thank you", correct: true },
  { k: "B", t: "help, we are sinking", why: "The boat is safe now thanks to the light." },
  { k: "C", t: "goodbye forever", why: "Nothing suggests a final goodbye." },
  { k: "D", t: "turn off the light", why: "The crew is grateful the light is on." },
], "The passage states the three blasts are 'the fishing boat's way of saying thank you.'");

multi("3.8B", "lighthouse", "medium", "Select TWO words that BEST describe Mira in the story.", [
  { k: "A", t: "brave", correct: true },
  { k: "B", t: "helpful", correct: true },
  { k: "C", t: "lazy", why: "She works hard to climb the tower and light the lamp." },
  { k: "D", t: "selfish", why: "She helps the sailors and her grandfather." },
  { k: "E", t: "cruel", why: "Nothing in the story shows her being unkind." },
], "Mira is frightened but climbs the tower to help — she is brave and helpful.");
inlineC("3.3B", "lighthouse", "hard", "In paragraph 3, the word “churning” describes water that is —", ["moving violently", "perfectly still", "frozen solid"], "moving violently", "'Churning, crashing sea' during a storm describes water moving violently.");
hot("3.10D", "lighthouse", "hard", "Click the sentence that uses a SIMILE (a comparison using “like” or “as”).", [
  { id: "t1", text: "Every evening, Grandpa climbed the spiral stairs to light the great lamp." },
  { id: "t2", text: "Halfway up the stairs, Grandpa stopped and pressed a hand to his knee." },
  { id: "t3", text: "The warm beam swept out across the water like a golden road." },
  { id: "t4", text: "Minutes later, a horn sounded from the bay." },
], ["t3"], "Only sentence t3 compares two things with 'like' (the beam to a golden road) — a simile.");
multipart("3.7C", "lighthouse", "hard", "Answer Part A and Part B.", [
  { id: "A", prompt: "Part A: Which word BEST describes how Mira feels as she decides to climb the stairs?", opts: [
    { k: "A", t: "Calm and bored", why: "Her pounding heart shows she is not calm or bored." },
    { k: "B", t: "Frightened but determined", correct: true },
    { k: "C", t: "Angry at her grandfather", why: "She is not angry; she volunteers to help." },
    { k: "D", t: "Confident and unworried", why: "Her heart pounds, so she is worried — but she goes anyway." },
  ] },
  { id: "B", prompt: "Part B: Which sentence from the story BEST supports your answer to Part A?", opts: [
    { k: "A", t: "“Mira lived with her grandfather in a tall white lighthouse.”", why: "This tells where she lives, not how she feels." },
    { k: "B", t: "“Her heart pounded, but she squared her shoulders.”", correct: true },
    { k: "C", t: "“Grandpa's eyes shone.”", why: "This describes Grandpa at the end, not Mira's feelings before the climb." },
    { k: "D", t: "“A horn sounded from the bay.”", why: "This happens after she lights the lamp." },
  ] },
], "Mira is frightened (heart pounding) but determined (squares her shoulders) — and that exact sentence is the evidence.");
written("scr", "3.6F", "lighthouse", "medium",
  "Why does the fishing boat sound its horn three times? What does this tell you about what happened? Use details from the story.", 2,
  [["reason", "Explains the horn means thank you / the boat is safe.", 1], ["inference", "Connects it to Mira lighting the lamp so the boat found its way.", 1]],
  "The boat sounds its horn three times to say thank you. This tells me the crew saw Mira's light and found their way safely through the storm, so her climb up the tower worked.");
written("ecr", "3.8C", "lighthouse", "hard",
  "What lesson does Mira learn in the story? Write a paragraph explaining the lesson and use at least TWO details from the passage to support your answer.", 5,
  [["theme", "Identifies a reasonable lesson/theme (e.g., bravery, helping others).", 1], ["evidence", "Uses at least two relevant details from the passage.", 2], ["explanation", "Explains how the details support the lesson.", 1], ["conventions", "Organized and clear.", 1]],
  "Mira learns that helping others is worth being brave. At first she is scared — her heart pounds when she sees the churning sea — but she squares her shoulders and climbs the tower anyway. She lights the lamp, and the fishing boat sounds its horn to say thank you. By the end she proudly climbs the stairs every night, showing she learned that courage helps her take care of others.");

// ===========================================================================
// BACKYARD BATS (informational)
// ===========================================================================
mc("3.9D", "bats", "easy", "What is the MAIN idea of “Backyard Bats”?", [
  { k: "A", t: "Bats are helpful animals, not scary ones", correct: true },
  { k: "B", t: "Bats are dangerous and should be feared", why: "The passage argues the opposite — that bats are helpful." },
  { k: "C", t: "Bats only eat fruit", why: "Bats also eat thousands of insects." },
  { k: "D", t: "Bats sleep in caves all winter", why: "Caves and winter sleep are not the focus here." },
], "Every paragraph gives a reason bats help us, so the main idea is that bats are helpful.");
mc("3.10A", "bats", "medium", "The author most likely wrote this passage to —", [
  { k: "A", t: "inform readers and change their minds about bats", correct: true },
  { k: "B", t: "tell a funny made-up story", why: "It gives facts, not a story." },
  { k: "C", t: "describe a family vacation", why: "There is no vacation in the passage." },
  { k: "D", t: "explain how to draw a bat", why: "No drawing steps are given." },
], "The author shares facts to show bats are helpful — informing and shifting the reader's view.");
mc("3.7C", "bats", "medium", "According to the passage, how do bats help fruit grow?", [
  { k: "A", t: "They carry pollen from flower to flower", correct: true },
  { k: "B", t: "They eat the fruit when it is ripe", why: "Eating fruit would not help it grow." },
  { k: "C", t: "They water the plants", why: "Bats do not water plants in the passage." },
  { k: "D", t: "They scare away hungry birds", why: "The passage never mentions scaring birds." },
], "Paragraph 3 says bats carry pollen between flowers, which helps fruits like bananas grow.");
mc("3.6F", "bats", "medium", "From the passage, you can tell that mosquitoes are —", [
  { k: "A", t: "insects that bats eat", correct: true },
  { k: "B", t: "a kind of bat", why: "Mosquitoes are insects, not bats." },
  { k: "C", t: "a type of flower", why: "Mosquitoes are pests, not flowers." },
  { k: "D", t: "a fruit", why: "Mosquitoes are insects, not fruit." },
], "The passage lists mosquitoes among the insects bats eat, so they are insects bats eat.");
mc("3.3B", "bats", "easy", "In paragraph 3, “nectar” is —", [
  { k: "A", t: "a sweet liquid inside flowers", correct: true },
  { k: "B", t: "a kind of insect", why: "The insects are what bats eat in paragraph 2." },
  { k: "C", t: "a bat's wing", why: "Nectar is something bats sip, not part of their body." },
  { k: "D", t: "a tall tree", why: "Trees appear in paragraph 5, not as the meaning of nectar." },
], "The passage explains nectar right in the sentence: 'the sweet liquid inside blossoms.'");
mc("3.6F", "bats", "medium", "Putting up a bat house most likely helps bats by —", [
  { k: "A", t: "giving them a safe place to live", correct: true },
  { k: "B", t: "feeding the neighborhood birds", why: "A bat house is for bats, not birds." },
  { k: "C", t: "growing more flowers", why: "A house is shelter, not a garden." },
  { k: "D", t: "scaring insects away by itself", why: "It is the bats, not the house, that handle insects." },
], "A bat house is shelter, so it most likely gives bats a safe place to live.");

multi("3.6G", "bats", "medium", "Select TWO ways bats help people, according to the passage.", [
  { k: "A", t: "They eat insects like mosquitoes", correct: true },
  { k: "B", t: "They carry pollen that helps fruit grow", correct: true },
  { k: "C", t: "They make spooky sounds at night", why: "Spooky is what people imagine; it is not a way bats help." },
  { k: "D", t: "They build houses for people", why: "People build bat houses, not the other way around." },
  { k: "E", t: "They guard gardens from rain", why: "The passage never says bats stop rain." },
], "Two helpful actions the passage names: eating insects and carrying pollen.");
inlineC("3.3B", "bats", "hard", "In paragraph 4, the word “echolocation” names the way bats —", ["find food using sound and echoes", "fly very high in the sky", "sleep upside down"], "find food using sound and echoes", "The paragraph defines echolocation as making squeaks and listening for echoes to find food.");
textE("3.3B", "bats", "hard", "Write the science word from paragraph 4 that means finding food by making sounds and listening for echoes.", "echolocation", "Paragraph 4 ends by naming this trick 'echolocation.'");
hot("3.10D", "bats", "hard", "Click the sentence that compares bat echoes to something using the word “like.”", [
  { id: "t1", text: "A single little brown bat can eat more than a thousand insects in one hour." },
  { id: "t2", text: "They make tiny squeaks and listen for the echoes that bounce back, like a shout returning in a canyon." },
  { id: "t3", text: "You can help bats by leaving old trees standing." },
  { id: "t4", text: "But bats are some of the most helpful animals in your neighborhood." },
], ["t2"], "Sentence t2 compares the echoes to 'a shout returning in a canyon' using 'like' — figurative language.");
multipart("3.6F", "bats", "hard", "Answer Part A and Part B.", [
  { id: "A", prompt: "Part A: How are bats able to find food in the dark?", opts: [
    { k: "A", t: "They have very large eyes", why: "The passage says bats use sound, not big eyes." },
    { k: "B", t: "They use sound and listen for echoes", correct: true },
    { k: "C", t: "They follow the smell of flowers", why: "Smell is not how the passage says they find food." },
    { k: "D", t: "They wait until morning", why: "Bats hunt in the dark, not in the morning." },
  ] },
  { id: "B", prompt: "Part B: Which sentence from the passage BEST supports your answer to Part A?", opts: [
    { k: "A", t: "“They make tiny squeaks and listen for the echoes that bounce back.”", correct: true },
    { k: "B", t: "“A single little brown bat can eat more than a thousand insects in one hour.”", why: "This is about how much bats eat, not how they find food." },
    { k: "C", t: "“As they fly from flower to flower sipping nectar …”", why: "This is about helping plants, not finding food in the dark." },
    { k: "D", t: "“You can help bats by leaving old trees standing.”", why: "This is about helping bats, not how they hunt." },
  ] },
], "Bats use echolocation — squeaking and listening for echoes — and that exact sentence is the supporting evidence.");
written("scr", "3.9D", "bats", "medium",
  "What is the central (main) idea of “Backyard Bats”? Support your answer with ONE detail from the passage.", 2,
  [["idea", "States the central idea (bats are helpful).", 1], ["detail", "Gives one accurate supporting detail.", 1]],
  "The central idea is that bats are helpful animals. For example, one little brown bat can eat more than a thousand insects, including mosquitoes, in a single hour, which keeps yards more comfortable for people.");

// ---------------------------------------------------------------------------
// Standards + bundle
// ---------------------------------------------------------------------------
const conceptNames: Record<string, { d: string; cat: string }> = {
  "3.6F": { d: "Make inferences and use evidence to support understanding", cat: "Comprehension" },
  "3.6G": { d: "Evaluate details to determine key ideas", cat: "Comprehension" },
  "3.7C": { d: "Use text evidence to support an appropriate response", cat: "Response Skills" },
  "3.7D": { d: "Retell, paraphrase, or summarize texts", cat: "Response Skills" },
  "3.8B": { d: "Describe the interaction of characters and changes they undergo", cat: "Literary Elements" },
  "3.8C": { d: "Analyze plot elements and the lesson or theme", cat: "Literary Elements" },
  "3.9D": { d: "Recognize characteristics and the central idea of informational text", cat: "Multiple Genres" },
  "3.10A": { d: "Explain the author's purpose and message", cat: "Author's Craft" },
  "3.10D": { d: "Identify and explain figurative language such as simile", cat: "Author's Craft" },
  "3.3B": { d: "Use context within a sentence to determine the meaning of words", cat: "Vocabulary" },
};
const usedConcepts = [...new Set(items.flatMap((i) => i.standardCodes as string[]))];
const standards = usedConcepts.map((code) => ({
  code,
  programKey: "grade3_staar",
  subject: "rla",
  reportingCategory: conceptNames[code]?.cat ?? "Reading",
  description: conceptNames[code]?.d ?? code,
}));

const bundle = {
  programKey: "grade3_staar",
  subject: "rla",
  version: 1,
  status: "available",
  title: "Grade 3 Reading / Language Arts",
  standards,
  passages: passages.map((pg) => ({
    id: pg.id,
    title: pg.title,
    genre: pg.genre,
    level: pg.level,
    body: passageBodies[pg.id],
    wordCount: pg.paras.reduce((n, para) => n + para.text.split(/\s+/).length, 0),
  })),
  items,
};

// Self-validate before writing — a bad answer key or passageRef fails HERE.
const parsed = contentBundleSchema.safeParse(bundle);
if (!parsed.success) {
  console.error("RLA bundle failed validation:");
  console.error(JSON.stringify(parsed.error.issues, null, 2));
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "content", "grade3_rla.json");
writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
const byType = items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.type as string]: (m[i.type as string] ?? 0) + 1 }), {});
console.log(`Wrote ${items.length} RLA items across ${usedConcepts.length} concepts + ${bundle.passages.length} passages → ${out}`);
console.log("  by type:", Object.entries(byType).map(([t, n]) => `${t}:${n}`).join("  "));
