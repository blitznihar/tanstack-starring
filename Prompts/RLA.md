Generate fresh, non-duplicate practice problems for the pools listed below:
There should be 150 to 200 problems on each of the topics for example 150-200 problems for 3.1 A, 150-200 problems for 3.1 B, 150-200 problems for 3.1 C etc. for every single topic  

OUTPUT FORMAT: a JSON array of Item objects matching this schema:

type Difficulty = "easy" | "medium" | "hard";
type ItemType =
  | "multiple_choice" | "multiselect" | "multipart" | "inline_choice"
  | "text_entry" | "hot_text" | "hot_spot" | "drag_and_drop" | "number_line"
  | "scr" | "ecr";
type Figure = { id: string; kind: "svg"|"png"|"bar_graph"|"pictograph"|"dot_plot"|
  "number_line"|"grid"|"base10_blocks"|"fraction_strip"|"array_model"|"area_model"|"shape";
  svg?: string; assetId?: string; data?: object; alt: string; caption?: string };
type Option = { key: string; text: string; correct?: boolean; rationale?: string };
type Item = {
  standardCodes: string[];            // REQUIRED — TEKS/standard codes this item assesses
  type: ItemType; difficulty: Difficulty;
  passageRef?: string;
  prompt: RichContent;                // array of strings or {kind,text,...} nodes
  figures: Figure[];                  // inline SVG where a figure is referenced
  options?: Option[];                 // selected-response choices, each with per-choice rationale
  correct?: string | string[];        // answer key for hot_text/multiselect where not on options
  parts?: { id; prompt; type; options?; correct?; answer? }[];  // multipart Part A / Part B
  blanks?: Record<string,string>;     // inline_choice / text_entry: blankId -> correct value
  answer?: string;                    // text_entry / number_line value
  zones?: { id; x; y; r }[];          // hot_spot
  tokens?: { id; text }[];            // hot_text
  draggables?: { id; text }[]; targets?: { id; accepts: string[] }[];  // drag_and_drop
  rubric?: { maxPoints: number; criteria: { id; description; points }[] };  // scr / ecr only
  points: number; allowPartialCredit: boolean;
  explanation: RichContent;           // WHY the right answer is right AND, per option, why each wrong choice is wrong
  workedSolution: RichContent;        // full step-by-step solution
};

Each item needs: standardCodes, type, difficulty, prompt, figures (inline SVG where a
figure is referenced), full answer key, allowPartialCredit, explanation (with per-choice
rationale), and workedSolution. Do NOT duplicate any existing stem.

EXISTING STEMS (do not reuse or paraphrase):
- Which step happened FIRST?
- Select TWO things the students did to PREPARE the soil before planting seeds.
- In two or three sentences, summarize how Room 12 turned the weedy strip into a vegetable garden. Use details from the passage.
- What lesson does the story teach?
- What lesson does Mira learn in the story? Write a paragraph explaining the lesson and use at least TWO details from the passage to support your answer.
- Select TWO ways bats help people, according to the passage.

POOLS NEEDED:
• Evaluate details to determine key ideas (TEKS 3.6G) — need 28 new items [running low]
• Retell, paraphrase, or summarize texts (TEKS 3.7D) — need 28 new items [running low]
• Analyze plot elements and the lesson or theme (TEKS 3.8C) — need 28 new items [running low]



## Eligible Texas Essential Knowledge and Skills (TEKS)

*Texas Education Agency — Student Assessment Division — Fall 2021*

---

## Genres Assessed in Reading

- Fiction
- Literary Nonfiction
- Poetry
- Drama
- Informational
- Argumentative
- Persuasive

---

## Reporting Category 1: Reading

*The student will understand and analyze a variety of texts from various genres.*

**(3) Developing and sustaining foundational language skills — vocabulary.** The student uses newly acquired vocabulary expressively. The student is expected to:

- **(A)** use print or digital resources to determine meaning, syllabication, and pronunciation; — **Supporting Standard**
- **(B)** use context within and beyond a sentence to determine the meaning of unfamiliar words and multiple-meaning words; — **Readiness Standard**
- **(C)** identify the meaning of and use words with affixes such as im- (into), non-, dis-, in- (not, non), pre-, -ness, -y, and -ful; and — **Supporting Standard**
- **(D)** identify, use, and explain the meaning of antonyms, synonyms, idioms, homophones, and homographs in a text. — **Supporting Standard**

**(6) Comprehension skills using multiple texts.** The student uses metacognitive skills to both develop and deepen comprehension of increasingly complex texts. The student is expected to:

- **(C)** make and correct or confirm predictions using text features, characteristics of genre, and structures; — **Supporting Standard**
- **(E)** make connections to personal experiences, ideas in other texts, and society; — **Readiness Standard**
- **(F)** make inferences and use evidence to support understanding; — **Readiness Standard**
- **(G)** evaluate details read to determine key ideas; — **Readiness Standard**
- **(H)** synthesize information to create new understanding; — **Readiness Standard**

**(7) Response skills using multiple texts.** The student responds to an increasingly challenging variety of sources that are read, heard, or viewed. The student is expected to:

- **(C)** use text evidence to support an appropriate response; — **Readiness Standard**
- **(D)** retell and paraphrase texts in ways that maintain meaning and logical order; — **Supporting Standard**

**(8) Multiple genres — literary elements.** The student recognizes and analyzes literary elements within and across increasingly complex traditional, contemporary, classical, and diverse literary texts. The student is expected to:

- **(A)** infer the theme of a work, distinguishing theme from topic; — **Supporting Standard**
- **(B)** explain the relationships among the major and minor characters; — **Readiness Standard**
- **(C)** analyze plot elements, including the sequence of events, the conflict, and the resolution; and — **Readiness Standard**
- **(D)** explain the influence of the setting on the plot. — **Supporting Standard**

**(9) Multiple genres — genres.** The student recognizes and analyzes genre-specific characteristics, structures, and purposes within and across increasingly complex traditional, contemporary, classical, and diverse texts. The student is expected to:

- **(A)** demonstrate knowledge of distinguishing characteristics of well-known children's literature such as folktales, fables, fairy tales, legends, and myths; — **Supporting Standard**
- **(B)** explain rhyme scheme, sound devices, and structural elements such as stanzas in a variety of poems; — **Supporting Standard**
- **(C)** discuss elements of drama such as characters, dialogue, setting, and acts; — **Supporting Standard**
- **(D)** recognize characteristics and structures of informational text, including:
  - **(i)** the central idea with supporting evidence; — **Readiness Standard**
  - **(ii)** features such as sections, tables, graphs, timelines, bullets, numbers, and bold and italicized font to support understanding; and — **Supporting Standard**
  - **(iii)** organizational patterns such as cause and effect and problem and solution; — **Supporting Standard**
- **(E)** recognize characteristics and structures of argumentative text by:
  - **(i)** identifying the claim; — **Readiness Standard**
  - **(ii)** distinguishing facts from opinion; and — **Readiness Standard**
  - **(iii)** identifying the intended audience or reader; — **Supporting Standard**

**(10) Author's purpose and craft using multiple texts.** The student uses critical inquiry to analyze the authors' choices and how they influence and communicate meaning within a variety of texts. The student analyzes and applies author's craft purposefully in order to develop his or her own products and performances. The student is expected to:

- **(A)** explain the author's purpose and message within a text; — **Readiness Standard**
- **(B)** explain how the use of text structure contributes to the author's purpose; — **Supporting Standard**
- **(C)** explain the author's use of print and graphic features to achieve specific purposes; — **Supporting Standard**
- **(D)** describe how the author's use of imagery, literal and figurative language such as simile, and sound devices such as onomatopoeia achieves specific purposes; — **Supporting Standard**
- **(E)** identify the use of literary devices, including first- or third-person point of view; — **Supporting Standard**
- **(F)** discuss how the author's use of language contributes to voice; and — **Supporting Standard**
- **(G)** identify and explain the use of hyperbole. — **Supporting Standard**

---

## Reporting Category 2: Writing

### Genres Assessed in Revising and Editing

- Fiction
- Literary Nonfiction
- Correspondence
- Expository/Informational
- Argumentative
- Persuasive

### Revising and Editing

*The student will revise and edit a variety of texts from various genres.*

**(2) Developing and sustaining foundational language skills — beginning reading and writing.** The student develops word structure knowledge through phonological awareness, print concepts, phonics, and morphology to communicate, decode, and spell. The student is expected to:

- **(B)** demonstrate and apply spelling knowledge by:
  - **(i)** spelling multisyllabic words with closed syllables; open syllables; VCe syllables; vowel teams, including digraphs and diphthongs; r-controlled syllables; and final stable syllables; — **Readiness Standard**
  - **(ii)** spelling homophones; — **Readiness Standard**
  - **(iii)** spelling compound words, contractions, and abbreviations; — **Readiness Standard**
  - **(iv)** spelling multisyllabic words with multiple sound-spelling patterns; — **Supporting Standard**
  - **(v)** spelling words using knowledge of syllable division patterns such as VCCV, VCV, and VCCCV; — **Supporting Standard**
  - **(vi)** spelling words using knowledge of prefixes; and — **Supporting Standard**
  - **(vii)** spelling words using knowledge of suffixes, including how they can change base words such as dropping e, changing y to i, and doubling final consonants; — **Readiness Standard**

**(11) Composition — writing process.** The student uses the writing process recursively to compose multiple texts that are legible and uses appropriate conventions. The student is expected to:

- **(B)** develop drafts into a focused, structured, and coherent piece of writing by:
  - **(i)** organizing with purposeful structure, including an introduction and a conclusion; and — **Readiness Standard**
  - **(ii)** developing an engaging idea with relevant details; — **Readiness Standard**
- **(C)** revise drafts to improve sentence structure and word choice by adding, deleting, combining, and rearranging ideas for coherence and clarity; — **Readiness Standard**
- **(D)** edit drafts using standard English conventions, including: — **Supporting Standard**
  - **(i)** complete simple and compound sentences with subject-verb agreement; — **Readiness Standard**
  - **(ii)** past, present, and future verb tense; — **Readiness Standard**
  - **(iii)** singular, plural, common, and proper nouns; — **Supporting Standard**
  - **(iv)** adjectives, including their comparative and superlative forms; — **Supporting Standard**
  - **(v)** adverbs that convey time and adverbs that convey manner; — **Supporting Standard**
  - **(vi)** prepositions and prepositional phrases; — **Supporting Standard**
  - **(vii)** pronouns, including subjective, objective, and possessive cases; — **Supporting Standard**
  - **(viii)** coordinating conjunctions to form compound subjects, predicates, and sentences; — **Supporting Standard**
  - **(ix)** capitalization of official titles of people, holidays, and geographical names and places; — **Supporting Standard**
  - **(x)** punctuation marks, including apostrophes in contractions and possessives and commas in compound sentences and items in a series; and — **Supporting Standard**
  - **(xi)** correct spelling of words with grade-appropriate orthographic patterns and rules and high-frequency words; — **Readiness Standard**

### Written Essay

*The student will compose a variety of written texts with a clear: central idea or claim; coherent organization; sufficient development; supporting evidence; and effective use of language and conventions.*

**(7) Response skills using multiple texts.** The student responds to an increasingly challenging variety of sources that are read, heard, or viewed. The student is expected to:

- **(B)** write a response to a literary or informational text that demonstrates an understanding of a text; — **Readiness Standard**

**(12) Composition — genres.** The student uses genre characteristics and craft to compose multiple texts that are meaningful. The student is expected to:

- **(B)** compose informational texts, including brief compositions that convey information about a topic, using a clear central idea and genre characteristics and craft; — **Readiness Standard**
- **(C)** compose argumentative texts, including opinion essays, using genre characteristics and craft; — **Readiness Standard**