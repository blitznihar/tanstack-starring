import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentBundleSchema, type ContentBundleImport } from "~/schemas/contentBundle.js";
import { itemSchema, type Item } from "~/schemas/item.js";

const PROGRAM_KEY = "grade3_staar";
const SUBJECT = "rla";
const VERSION = 20260624;
const BUNDLE_ID = `${PROGRAM_KEY}:${SUBJECT}:v${VERSION}`;
const SOURCE = "generated_grade3_rla_teks_expansion_20260624";
const ITEMS_PER_STANDARD = 150;
const OUTFILE = join(dirname(fileURLToPath(import.meta.url)), "../../content/grade3_staar_rla_practice_expansion.json");

const TARGET_STANDARDS = [
  "3.10A",
  "3.10D",
  "3.3B",
  "3.6F",
  "3.6G",
  "3.7C",
  "3.7D",
  "3.8B",
  "3.8C",
  "3.9D",
] as const;
type StandardCode = (typeof TARGET_STANDARDS)[number];
type Difficulty = "easy" | "medium" | "hard";
type Genre = "literary" | "informational" | "poetry";

const standards: Record<StandardCode, { reportingCategory: string; description: string }> = {
  "3.10A": { reportingCategory: "Author's Craft", description: "Explain the author's purpose and message" },
  "3.10D": { reportingCategory: "Author's Craft", description: "Identify and explain figurative language such as simile" },
  "3.3B": { reportingCategory: "Vocabulary", description: "Use context within a sentence to determine the meaning of words" },
  "3.6F": { reportingCategory: "Comprehension", description: "Make inferences and use evidence to support understanding" },
  "3.6G": { reportingCategory: "Comprehension", description: "Evaluate details to determine key ideas" },
  "3.7C": { reportingCategory: "Response Skills", description: "Use text evidence to support an appropriate response" },
  "3.7D": { reportingCategory: "Response Skills", description: "Retell, paraphrase, or summarize texts" },
  "3.8B": { reportingCategory: "Literary Elements", description: "Describe the interaction of characters and changes they undergo" },
  "3.8C": { reportingCategory: "Literary Elements", description: "Analyze plot elements and the lesson or theme" },
  "3.9D": { reportingCategory: "Multiple Genres", description: "Recognize characteristics and the central idea of informational text" },
};

type OptionSet = {
  correct: string;
  distractors: [string, string, string];
  rationales?: [string, string, string];
};

type Spec = {
  standardCode: StandardCode;
  title: string;
  genre: Genre;
  difficulty: Difficulty;
  passage: [string, string, string];
  prompt: string;
  options: OptionSet;
  explanation: string;
  solution: string;
};

type InfoTopic = {
  topic: string;
  titleNoun: string;
  place: string;
  opener: string;
  important: string;
  second: string;
  third: string;
  minor: string;
  result: string;
  central: string;
  purpose: string;
  message: string;
  feature: string;
};

const infoTopics: InfoTopic[] = [
  {
    topic: "rain gauges",
    titleNoun: "Rain Gauge",
    place: "school garden",
    opener: "A rain gauge is a clear tube that catches rainwater during a storm.",
    important: "Numbers on the side show exactly how much rain fell.",
    second: "Garden helpers check the tube before deciding whether plants need more water.",
    third: "The gauge helps the class save water after a wet week.",
    minor: "The tube is tied to a green post near the tomatoes.",
    result: "Students make better watering choices because they measure first.",
    central: "A rain gauge helps gardeners know when plants need water.",
    purpose: "explain how measuring rain helps people care for a garden",
    message: "measuring carefully can help people make smart choices",
    feature: "facts and a clear explanation of how a tool works",
  },
  {
    topic: "book repair stations",
    titleNoun: "Book Repair Station",
    place: "library corner",
    opener: "A book repair station keeps torn classroom books from being thrown away too soon.",
    important: "Students place ripped pages in a tray instead of taping them quickly.",
    second: "The librarian uses special tape that will not crack or turn yellow.",
    third: "Clean hands and slow page turns help repaired books last longer.",
    minor: "The repair basket sits beside a blue reading chair.",
    result: "More readers can enjoy the same books all year.",
    central: "Careful book repair helps classroom books last for many readers.",
    purpose: "show readers how a library protects damaged books",
    message: "taking care of shared things helps everyone",
    feature: "realistic steps and facts about caring for books",
  },
  {
    topic: "walking school buses",
    titleNoun: "Walking School Bus",
    place: "neighborhood sidewalk",
    opener: "A walking school bus is a group of students who walk to school with adults.",
    important: "The group follows the same route and stops at marked corners.",
    second: "Bright vests help drivers notice the walkers.",
    third: "Students learn to look left, right, and left again before crossing.",
    minor: "One volunteer carries a clipboard with a star sticker on it.",
    result: "The walk becomes safer and more organized for everyone.",
    central: "A walking school bus helps students travel to school safely together.",
    purpose: "inform readers about a safe way for students to walk to school",
    message: "planning and teamwork can make everyday trips safer",
    feature: "details that explain a community safety routine",
  },
  {
    topic: "compost bins",
    titleNoun: "Compost Bin",
    place: "cafeteria patio",
    opener: "A compost bin turns fruit peels and old leaves into food for soil.",
    important: "Tiny living things break the scraps into dark, crumbly compost.",
    second: "The compost adds nutrients that help plants grow strong roots.",
    third: "Keeping meat and plastic out of the bin prevents bad smells.",
    minor: "The lid makes a soft thump when students close it.",
    result: "Less trash leaves the cafeteria, and the garden gets healthier soil.",
    central: "Compost bins turn some waste into helpful material for plants.",
    purpose: "explain how composting helps gardens and reduces trash",
    message: "small daily choices can help the environment",
    feature: "cause-and-effect facts about a natural process",
  },
  {
    topic: "classroom job charts",
    titleNoun: "Job Chart",
    place: "third-grade classroom",
    opener: "A classroom job chart lists helpful tasks students can do each week.",
    important: "Rotating the names gives every student a fair turn.",
    second: "Jobs such as line leader and supply helper keep the room running smoothly.",
    third: "The chart also reminds students that a classroom belongs to everyone.",
    minor: "The chart has yellow stars beside Friday's jobs.",
    result: "When students share responsibilities, fewer reminders are needed.",
    central: "A classroom job chart helps students share responsibility.",
    purpose: "explain why classroom jobs are useful",
    message: "shared responsibility makes a group work better",
    feature: "examples that support one clear idea",
  },
  {
    topic: "seed libraries",
    titleNoun: "Seed Library",
    place: "public library",
    opener: "A seed library lets people borrow packets of seeds instead of books.",
    important: "Families plant the seeds and save a few new seeds after harvest.",
    second: "Returning saved seeds helps the library offer more choices next spring.",
    third: "Labels tell gardeners how much sun and water each plant needs.",
    minor: "The packets are stored in an old wooden card catalog.",
    result: "The community grows food and flowers while sharing resources.",
    central: "A seed library helps people share seeds and grow plants.",
    purpose: "inform readers about a library service for gardeners",
    message: "sharing resources can help a whole community grow",
    feature: "facts about a real-world community program",
  },
  {
    topic: "bike safety checks",
    titleNoun: "Bike Safety Check",
    place: "park pavilion",
    opener: "Before a long ride, cyclists can do a quick bike safety check.",
    important: "Squeezing the brakes shows whether the bike can stop quickly.",
    second: "A firm tire rolls more safely than a soft tire.",
    third: "A helmet should sit level and snug on the rider's head.",
    minor: "The bike bell may make a cheerful ring.",
    result: "Checking equipment first can prevent problems later.",
    central: "Bike safety checks help riders prepare before they ride.",
    purpose: "explain simple steps that make bike riding safer",
    message: "preparing before an activity can prevent trouble",
    feature: "step-by-step safety details",
  },
  {
    topic: "museum labels",
    titleNoun: "Museum Label",
    place: "children's museum",
    opener: "Museum labels are small signs that help visitors understand displays.",
    important: "A good label names the object and explains why it matters.",
    second: "Some labels ask questions that make visitors look more closely.",
    third: "Labels are short so people can read them while standing.",
    minor: "One label in the museum has a silver border.",
    result: "Visitors learn more than they would by only looking.",
    central: "Museum labels help visitors learn from exhibits.",
    purpose: "explain how labels guide museum visitors",
    message: "clear information can make learning easier",
    feature: "examples of text features that support understanding",
  },
  {
    topic: "weather maps",
    titleNoun: "Weather Map",
    place: "morning news board",
    opener: "A weather map uses symbols to show what is happening in different places.",
    important: "Cloud pictures can show where rain may fall.",
    second: "Arrows can show which way wind is moving.",
    third: "Colors often show warmer and cooler temperatures.",
    minor: "The map hangs beside the lunch menu.",
    result: "Readers can understand the forecast quickly.",
    central: "Weather maps use symbols and colors to explain the forecast.",
    purpose: "teach readers how a map can show weather information",
    message: "symbols can share a lot of information quickly",
    feature: "map symbols, labels, and colors",
  },
  {
    topic: "reusable lunch kits",
    titleNoun: "Lunch Kit",
    place: "cafeteria table",
    opener: "Reusable lunch kits can replace many throwaway bags and wrappers.",
    important: "A washable container can be used again the next day.",
    second: "A cloth napkin creates less trash than a paper one.",
    third: "Families can pack only the food a student expects to eat.",
    minor: "Some lunch kits have bright stripes.",
    result: "The trash can fills more slowly during lunch.",
    central: "Reusable lunch kits help reduce cafeteria trash.",
    purpose: "persuade readers to consider reusable lunch supplies",
    message: "reusing everyday items can reduce waste",
    feature: "reasons that support an opinion",
  },
  {
    topic: "crosswalk signals",
    titleNoun: "Crosswalk Signal",
    place: "busy corner",
    opener: "Crosswalk signals help walkers know when it is safer to cross.",
    important: "A white walking symbol tells people they may start across.",
    second: "A flashing hand warns people not to begin crossing.",
    third: "Some signals beep so people can hear the change.",
    minor: "The pole has a small sticker near the button.",
    result: "The signals help walkers and drivers understand each other.",
    central: "Crosswalk signals guide people across streets safely.",
    purpose: "explain what crosswalk signals mean",
    message: "paying attention to signs can keep people safe",
    feature: "symbols paired with explanations",
  },
  {
    topic: "school recycling teams",
    titleNoun: "Recycling Team",
    place: "school hallway",
    opener: "A school recycling team collects paper and bottles from classroom bins.",
    important: "Team members sort materials so each kind goes to the right place.",
    second: "Posters remind students to empty bottles before recycling them.",
    third: "The team weighs the bags to track progress each month.",
    minor: "Their cart has a squeaky front wheel.",
    result: "The school throws away less reusable material.",
    central: "A recycling team helps a school reuse materials instead of wasting them.",
    purpose: "inform readers about how a student recycling team works",
    message: "organized teamwork can solve a school problem",
    feature: "details that explain a repeated process",
  },
  {
    topic: "plant labels",
    titleNoun: "Plant Label",
    place: "botanical garden",
    opener: "Plant labels give visitors quick information about flowers, trees, and herbs.",
    important: "The largest words usually name the plant.",
    second: "Smaller lines may tell where the plant grows naturally.",
    third: "Some labels include pictures for readers who are still learning the words.",
    minor: "A lizard-shaped shadow sometimes falls across the label.",
    result: "Visitors can compare plants without asking a guide each time.",
    central: "Plant labels help visitors identify and compare plants.",
    purpose: "explain how labels support learning in a garden",
    message: "organized information helps readers notice details",
    feature: "labels, names, and short facts",
  },
  {
    topic: "emergency kits",
    titleNoun: "Emergency Kit",
    place: "family hallway closet",
    opener: "An emergency kit holds supplies a family may need during a power outage.",
    important: "A flashlight helps people move safely in the dark.",
    second: "Bottled water and snacks are useful if stores are closed.",
    third: "A radio can share weather updates when the internet is not working.",
    minor: "The kit is stored in a red backpack.",
    result: "Families feel more prepared when a storm arrives.",
    central: "Emergency kits help families prepare for unexpected problems.",
    purpose: "explain why certain supplies belong in an emergency kit",
    message: "planning ahead helps people stay calm during problems",
    feature: "a list of supplies with reasons for each one",
  },
  {
    topic: "trail markers",
    titleNoun: "Trail Marker",
    place: "nature trail",
    opener: "Trail markers are signs that help hikers follow a path.",
    important: "Colored arrows show which direction the trail turns.",
    second: "Distance numbers tell hikers how far they have walked.",
    third: "Warning signs point out steep steps or muddy ground.",
    minor: "One marker is nailed to a crooked wooden post.",
    result: "Markers make it easier for hikers to stay on the correct trail.",
    central: "Trail markers guide hikers and help them stay safe.",
    purpose: "inform readers about signs used on a trail",
    message: "following clear directions helps people reach a goal",
    feature: "signs, symbols, and distance labels",
  },
  {
    topic: "water fountains with bottle fillers",
    titleNoun: "Bottle Filler",
    place: "gym hallway",
    opener: "A bottle-filling fountain lets students refill water bottles quickly.",
    important: "The tall spout sends water straight into the bottle without spilling.",
    second: "A small counter shows how many plastic bottles were not used.",
    third: "Cold water helps students stay refreshed after exercise.",
    minor: "The machine makes a soft humming sound.",
    result: "Students drink more water and throw away fewer bottles.",
    central: "Bottle fillers make it easier to drink water and reduce plastic waste.",
    purpose: "explain the benefits of bottle-filling fountains",
    message: "a useful design can make healthy choices easier",
    feature: "facts about a tool and its benefits",
  },
  {
    topic: "class newsletters",
    titleNoun: "Class Newsletter",
    place: "teacher's desk",
    opener: "A class newsletter shares school news with families.",
    important: "Headings divide the page into topics such as dates, projects, and reminders.",
    second: "Short captions explain photographs from class activities.",
    third: "A calendar box helps families remember upcoming events.",
    minor: "The newsletter is printed on pale blue paper.",
    result: "Families can talk with students about what is happening at school.",
    central: "Class newsletters keep families informed about classroom events.",
    purpose: "explain how a newsletter shares information",
    message: "clear communication helps school and home work together",
    feature: "headings, captions, and a calendar",
  },
  {
    topic: "bus route signs",
    titleNoun: "Bus Route Sign",
    place: "transit stop",
    opener: "Bus route signs help riders know which bus will stop there.",
    important: "The route number matches the number on the front of the bus.",
    second: "A schedule shows when the bus is expected to arrive.",
    third: "A map shows the streets the bus will travel.",
    minor: "The sign is attached to a round metal pole.",
    result: "Riders can plan trips without guessing.",
    central: "Bus route signs help riders choose the correct bus.",
    purpose: "teach readers how route signs help travelers",
    message: "reading public signs can help people move around confidently",
    feature: "numbers, schedules, and maps",
  },
  {
    topic: "reading logs",
    titleNoun: "Reading Log",
    place: "homework folder",
    opener: "A reading log is a chart where students record what they read.",
    important: "Writing the title helps students remember each book.",
    second: "A short note about the favorite part helps readers think about meaning.",
    third: "Dates show how reading habits grow over time.",
    minor: "The log has a tiny pencil picture in the corner.",
    result: "Students can look back and notice their reading progress.",
    central: "Reading logs help students track and think about their reading.",
    purpose: "explain how a reading log supports readers",
    message: "keeping records can show growth",
    feature: "a chart with titles, dates, and notes",
  },
  {
    topic: "garden pollination signs",
    titleNoun: "Pollination Sign",
    place: "butterfly garden",
    opener: "A pollination sign explains how pollen moves from flower to flower.",
    important: "The sign shows that some insects carry pollen on their bodies.",
    second: "Arrows point from one blossom to the next.",
    third: "A diagram shows how seeds can form after pollination.",
    minor: "The sign is shaped like a large leaf.",
    result: "Visitors understand why flower visitors matter.",
    central: "Pollination signs explain how flowers can make seeds.",
    purpose: "inform readers about pollination using words and pictures",
    message: "small parts of nature can have important jobs",
    feature: "a labeled diagram with arrows",
  },
  {
    topic: "noise meters",
    titleNoun: "Noise Meter",
    place: "school cafeteria",
    opener: "A noise meter shows when a room is getting too loud.",
    important: "Green means voices are at a comfortable level.",
    second: "Yellow warns students to lower their voices.",
    third: "Red means the sound is making it hard for people to talk.",
    minor: "The meter is mounted near the clock.",
    result: "Students can adjust their voices without waiting for a shout.",
    central: "Noise meters help students manage sound levels.",
    purpose: "explain how a tool can remind students to use calmer voices",
    message: "visual reminders can help a group make better choices",
    feature: "colors that stand for different sound levels",
  },
  {
    topic: "field guides",
    titleNoun: "Field Guide",
    place: "pond trail",
    opener: "A field guide is a book that helps people identify things in nature.",
    important: "Pictures show what leaves, tracks, or rocks look like.",
    second: "Short descriptions point out details that separate one kind from another.",
    third: "Indexes help readers find a page quickly.",
    minor: "The guide fits in the side pocket of a backpack.",
    result: "Readers can name what they notice outdoors.",
    central: "Field guides help people identify natural objects by using pictures and facts.",
    purpose: "inform readers about how field guides support outdoor learning",
    message: "careful observation helps people learn about nature",
    feature: "pictures, descriptions, and an index",
  },
  {
    topic: "fire drill maps",
    titleNoun: "Fire Drill Map",
    place: "classroom doorway",
    opener: "A fire drill map shows the safest path out of a classroom.",
    important: "Arrows lead from the room to the nearest exit.",
    second: "A meeting spot is marked so the class knows where to gather.",
    third: "Practicing the route helps students move calmly.",
    minor: "The map is inside a clear plastic sleeve.",
    result: "Everyone can leave the building more safely during a drill.",
    central: "Fire drill maps help classes practice safe exits.",
    purpose: "explain how maps support emergency routines",
    message: "knowing a plan helps people act safely",
    feature: "arrows, labels, and a marked meeting spot",
  },
  {
    topic: "recipe cards",
    titleNoun: "Recipe Card",
    place: "after-school kitchen",
    opener: "A recipe card gives directions for making a food or drink.",
    important: "The ingredient list tells cooks what supplies to gather first.",
    second: "Numbered steps show the order for mixing and cooking.",
    third: "A serving size tells how many people the recipe will feed.",
    minor: "A small drawing of a spoon decorates the corner.",
    result: "Cooks can follow the card instead of guessing.",
    central: "Recipe cards organize ingredients and steps for cooks.",
    purpose: "explain how recipe cards guide cooking",
    message: "organized steps make a task easier to finish",
    feature: "lists, numbers, and sequence words",
  },
  {
    topic: "class voting",
    titleNoun: "Class Vote",
    place: "morning meeting rug",
    opener: "A class vote lets students choose between two or more fair options.",
    important: "Each student gets one vote so the choice is equal.",
    second: "A tally chart makes the result easy to count.",
    third: "The group agrees to follow the option with the most votes.",
    minor: "The tally marks are written with a purple marker.",
    result: "The class can make a decision without arguing for a long time.",
    central: "Class voting gives students a fair way to make group decisions.",
    purpose: "explain how a class vote works",
    message: "fair rules help groups make decisions",
    feature: "a process explained with examples",
  },
  {
    topic: "solar oven boxes",
    titleNoun: "Solar Oven",
    place: "science table",
    opener: "A solar oven uses sunlight to warm food inside a covered box.",
    important: "Shiny foil reflects light toward the food.",
    second: "Clear plastic traps warm air inside the box.",
    third: "Dark paper helps absorb heat from the sun.",
    minor: "The box once held a pair of sneakers.",
    result: "The food warms without using a stove or plug.",
    central: "A solar oven uses sunlight and simple materials to make heat.",
    purpose: "explain how a solar oven works",
    message: "science ideas can solve problems with simple materials",
    feature: "cause-and-effect details about heat",
  },
  {
    topic: "lost-and-found labels",
    titleNoun: "Lost-and-Found Label",
    place: "school office",
    opener: "A lost-and-found label can help return a missing jacket or lunch box.",
    important: "A name inside an item tells adults who owns it.",
    second: "A classroom number helps the office send the item to the right place.",
    third: "Checking the rack often keeps the pile from growing too large.",
    minor: "The rack stands under a window.",
    result: "Labeled items are returned more quickly.",
    central: "Labels help lost items find their owners again.",
    purpose: "persuade readers to label belongings before they are lost",
    message: "a small habit can prevent a bigger problem",
    feature: "reasons that support practical advice",
  },
  {
    topic: "morning announcements",
    titleNoun: "Morning Announcement",
    place: "school speaker",
    opener: "Morning announcements share important news with the whole school.",
    important: "The announcer reads reminders about clubs, lunches, and events.",
    second: "Speaking clearly helps every classroom understand the message.",
    third: "Short announcements keep the school day from starting late.",
    minor: "The microphone has a black foam cover.",
    result: "Students and teachers begin the day with the same information.",
    central: "Morning announcements keep the school informed.",
    purpose: "explain why school announcements are useful",
    message: "shared information helps a community stay organized",
    feature: "brief facts meant for a specific audience",
  },
  {
    topic: "library call numbers",
    titleNoun: "Call Number",
    place: "library shelf",
    opener: "A call number is a label that shows where a library book belongs.",
    important: "Letters and numbers on the spine match a section of the shelf.",
    second: "Books about similar topics are often placed near one another.",
    third: "Returning books to the correct spot helps the next reader find them.",
    minor: "The label is printed on a white sticker.",
    result: "The library stays organized even when many people borrow books.",
    central: "Call numbers help organize library books so readers can find them.",
    purpose: "teach readers how a library label works",
    message: "systems can help people find information",
    feature: "letters, numbers, and organized categories",
  },
  {
    topic: "playground shade sails",
    titleNoun: "Shade Sail",
    place: "playground",
    opener: "A shade sail is a strong cloth stretched above part of a playground.",
    important: "The cloth blocks some sunlight during hot parts of the day.",
    second: "Cooler benches give students a better place to rest.",
    third: "Workers pull the cloth tight so rain does not collect in the middle.",
    minor: "The shade sail is shaped like a triangle.",
    result: "The playground becomes more comfortable in sunny weather.",
    central: "Shade sails make outdoor play spaces cooler and more comfortable.",
    purpose: "explain how shade sails improve a playground",
    message: "thoughtful design can make shared spaces better",
    feature: "details about a useful structure",
  },
  {
    topic: "classroom aquariums",
    titleNoun: "Class Aquarium",
    place: "science corner",
    opener: "A classroom aquarium lets students observe a small water habitat.",
    important: "A filter helps keep the water clean for the fish.",
    second: "Students measure food carefully so extra flakes do not cloud the water.",
    third: "A thermometer shows whether the water is the right temperature.",
    minor: "Smooth blue stones cover the bottom of the tank.",
    result: "The aquarium teaches responsibility and observation.",
    central: "A classroom aquarium helps students learn by observing and caring for a habitat.",
    purpose: "inform readers about caring for a classroom aquarium",
    message: "living things need careful, steady care",
    feature: "facts about needs, tools, and observation",
  },
  {
    topic: "paper-making workshops",
    titleNoun: "Paper Workshop",
    place: "art room",
    opener: "In a paper-making workshop, scraps can become a new sheet of paper.",
    important: "Soaked scraps are blended into a soft pulp.",
    second: "A screen lifts the pulp from the water in a thin layer.",
    third: "Pressing out extra water helps the sheet dry flat.",
    minor: "The drying rack sits near a sunny window.",
    result: "Students see how recycling can create something useful.",
    central: "Paper-making workshops show how scraps can be reused.",
    purpose: "explain the steps for making recycled paper",
    message: "old materials can become useful again",
    feature: "ordered steps in a process",
  },
  {
    topic: "school maps",
    titleNoun: "School Map",
    place: "front hallway",
    opener: "A school map helps visitors find classrooms, offices, and exits.",
    important: "A star often marks the spot where the reader is standing.",
    second: "Symbols show bathrooms, stairs, and the nurse's office.",
    third: "A map key explains what each symbol means.",
    minor: "The frame around the map is dark brown.",
    result: "New students and visitors can move around with less confusion.",
    central: "School maps help people find places inside the building.",
    purpose: "explain how a map helps school visitors",
    message: "maps and keys make unfamiliar places easier to understand",
    feature: "symbols, labels, and a map key",
  },
  {
    topic: "water-cycle jars",
    titleNoun: "Water-Cycle Jar",
    place: "science windowsill",
    opener: "A water-cycle jar is a small model that shows water moving in a cycle.",
    important: "Warm sunlight causes some water to evaporate from the soil.",
    second: "Droplets collect on the plastic wrap like tiny clouds.",
    third: "The droplets fall back down when they become heavy.",
    minor: "The jar sits on a folded paper towel.",
    result: "Students can watch a slow version of evaporation and precipitation.",
    central: "A water-cycle jar models how water moves from place to place.",
    purpose: "explain a science model of the water cycle",
    message: "models can help people understand large natural processes",
    feature: "science words explained with observations",
  },
  {
    topic: "cafeteria menu boards",
    titleNoun: "Menu Board",
    place: "cafeteria line",
    opener: "A cafeteria menu board tells students what foods are being served.",
    important: "Large headings separate the main dish, sides, fruit, and milk.",
    second: "Pictures can help younger readers choose before they reach the counter.",
    third: "Allergy notes warn students about ingredients such as nuts.",
    minor: "A magnet shaped like an apple holds one corner.",
    result: "The line moves faster because students can decide early.",
    central: "Menu boards help students choose lunch safely and quickly.",
    purpose: "explain how menu boards organize lunch information",
    message: "clear displays can help people make choices",
    feature: "headings, pictures, and notes",
  },
  {
    topic: "garden watering schedules",
    titleNoun: "Watering Schedule",
    place: "community garden shed",
    opener: "A watering schedule tells garden helpers when each plant bed needs care.",
    important: "New seedlings may need water more often than older plants.",
    second: "The schedule prevents three helpers from watering the same bed.",
    third: "Notes after heavy rain can tell helpers to skip a day.",
    minor: "The schedule hangs from a silver clip.",
    result: "Plants get enough water without wasting it.",
    central: "Watering schedules help gardeners care for plants without wasting water.",
    purpose: "explain why a garden schedule is useful",
    message: "planning helps a team use resources wisely",
    feature: "a chart with times, tasks, and notes",
  },
  {
    topic: "science notebooks",
    titleNoun: "Science Notebook",
    place: "lab table",
    opener: "A science notebook records observations during an investigation.",
    important: "Dates help students compare what changed over time.",
    second: "Drawings can show details that are hard to describe in words.",
    third: "Measurements make observations more exact.",
    minor: "The notebook cover has a picture of a rocket.",
    result: "Students can use their notes to explain what they learned.",
    central: "Science notebooks help students record and explain observations.",
    purpose: "inform readers about a tool scientists use for careful thinking",
    message: "good notes help people remember evidence",
    feature: "dates, drawings, measurements, and labels",
  },
  {
    topic: "community bulletin boards",
    titleNoun: "Bulletin Board",
    place: "community center",
    opener: "A community bulletin board shares notices about events and services.",
    important: "Flyers tell readers where and when activities will happen.",
    second: "Large titles help people choose which notices to read first.",
    third: "Old flyers are removed so the board stays useful.",
    minor: "Pushpins are kept in a small plastic cup.",
    result: "Neighbors can learn about helpful opportunities nearby.",
    central: "Bulletin boards share local information with a community.",
    purpose: "explain how public notices help people find events",
    message: "organized public information can connect people",
    feature: "flyers with titles, dates, and locations",
  },
  {
    topic: "library suggestion boxes",
    titleNoun: "Suggestion Box",
    place: "library desk",
    opener: "A suggestion box gives readers a way to recommend books or changes.",
    important: "Students write ideas on slips and place them through the slot.",
    second: "The librarian reads the slips before ordering new books.",
    third: "Several similar suggestions can show what many readers want.",
    minor: "The box has a tiny lock on the side.",
    result: "Readers feel that their ideas can improve the library.",
    central: "Suggestion boxes help libraries learn what readers need.",
    purpose: "explain how student suggestions can guide library choices",
    message: "listening to users can improve a shared place",
    feature: "a simple process for collecting opinions",
  },
  {
    topic: "garden trellises",
    titleNoun: "Garden Trellis",
    place: "bean patch",
    opener: "A garden trellis is a frame that gives climbing plants a place to grow upward.",
    important: "Vines wrap around the poles instead of spreading across the ground.",
    second: "Keeping leaves off wet soil can help plants stay healthier.",
    third: "Trellises also make beans and peas easier to pick.",
    minor: "The frame casts a striped shadow at noon.",
    result: "The garden uses space more neatly.",
    central: "Trellises support climbing plants and help gardens stay organized.",
    purpose: "explain how a garden structure helps plants grow",
    message: "the right support can help living things grow well",
    feature: "facts about a structure and its uses",
  },
  {
    topic: "table of contents pages",
    titleNoun: "Table of Contents",
    place: "science book",
    opener: "A table of contents appears near the beginning of many nonfiction books.",
    important: "It lists chapter titles in the order they appear.",
    second: "Page numbers tell readers where each section starts.",
    third: "Readers can use it to skip directly to the information they need.",
    minor: "The page is printed in dark blue ink.",
    result: "Finding a topic becomes faster than flipping through every page.",
    central: "A table of contents helps readers locate information in a book.",
    purpose: "teach readers how a nonfiction text feature works",
    message: "text features help readers use information efficiently",
    feature: "chapter titles and page numbers",
  },
];

type StorySeed = {
  name: string;
  friend: string;
  place: string;
  object: string;
  want: string;
  problem: string;
  helperLine: string;
  action: string;
  result: string;
  startTrait: string;
  endTrait: string;
  interaction: string;
  theme: string;
  titleNoun: string;
  clueDetail: string;
  extraObstacle: string;
};

const names = [
  "Maya", "Leo", "Sofia", "Eli", "Nora", "Mateo", "Iris", "Caleb", "Priya", "Jonah",
  "Ari", "Lena", "Owen", "Zara", "Miles", "Ana", "Noah", "Ruby", "Sam", "Talia",
  "Jin", "Grace", "Dante", "Mina", "Kai", "Layla", "Theo", "Rina", "Ben", "Amara",
];
const friends = [
  "Aunt Rosa", "Mr. Hill", "his cousin", "her neighbor", "Coach Lee", "Grandma June",
  "the librarian", "his lab partner", "her older brother", "Ms. Patel", "Uncle Ray", "a new classmate",
];
const storyPlaces = [
  "art room", "music stage", "community garden", "library", "soccer field", "science fair table",
  "bus stop", "playground", "school hallway", "kitchen table", "park trail", "classroom window",
  "gym floor", "front porch", "museum room",
];
const storyObjects = [
  "paintbrush", "paper bridge", "seed tray", "bookmark", "soccer pass", "model volcano",
  "permission slip", "jump rope", "lost notebook", "mixing bowl", "trail map", "rain jar",
  "team banner", "plant pot", "display card",
];
const wants = [
  "finish the project alone",
  "be first in line",
  "hide a mistake",
  "avoid asking a question",
  "win without practicing",
  "keep a promise",
  "try a new role",
  "fix a problem before anyone notices",
  "speak clearly to the group",
  "give up and start over",
];
const problems = [
  "the plan stopped working halfway through",
  "the materials did not fit the way the directions showed",
  "a teammate felt left out",
  "the first try looked messy",
  "the room grew quiet while everyone waited",
  "the important note went missing",
  "rain changed the outdoor plan",
  "the group disagreed about what to do next",
  "a younger student needed help",
  "the clock showed there was not much time left",
];
const helperLines = [
  "\"Slow down and look for one clue at a time,\"",
  "\"A mistake can show you what to try next,\"",
  "\"You do not have to solve it by yourself,\"",
  "\"Listen first, and the answer may get clearer,\"",
  "\"A fair team lets every voice matter,\"",
  "\"Try the careful way, not the fastest way,\"",
  "\"One brave sentence can begin the whole job,\"",
  "\"Check the evidence before you decide,\"",
  "\"Helping someone else can move the whole group forward,\"",
  "\"Practice turns worry into a plan,\"",
];
const actions = [
  "took a breath and asked for help",
  "invited the quiet teammate to share an idea",
  "read the directions again and found the missed step",
  "apologized and offered a fair turn",
  "practiced the hard part three more times",
  "told the truth about the mistake",
  "changed the plan without quitting",
  "used the clue everyone had overlooked",
  "helped a younger student before returning to the task",
  "spoke slowly even though the words felt stuck",
];
const actionEvidence = [
  "checking the sketch again",
  "rereading the note on the board",
  "listening to the quietest teammate",
  "testing one small change first",
  "matching the clue to the directions",
  "counting the supplies one more time",
  "looking back at the promise",
  "sharing the easiest part of the job",
  "asking what would be fair",
  "moving the materials into better order",
  "taking notes on what had changed",
  "trying the step that looked hardest",
  "comparing the first try with the second",
  "making room for another idea",
  "reading the label more carefully",
  "waiting until the group was ready",
  "choosing the safer route",
];
const storyResults = [
  "the project worked better than the first plan",
  "the group finished with smiles instead of arguments",
  "the missing piece finally made sense",
  "a new friend joined the work",
  "the class noticed the effort more than the mistake",
  "the problem became smaller once everyone helped",
  "the final try was neat enough to share",
  "the team learned a better way for next time",
  "the younger student copied the kind example",
  "the room clapped because the message was clear",
];
const clueDetails = [
  "a smudged corner on the plan",
  "three crossed-out tries in the notebook",
  "a quiet sigh from the group",
  "a crooked line across the poster",
  "one missing label on the display",
  "a wobbly stack beside the chair",
  "a note with two underlined words",
  "a bent paper clip near the supplies",
  "a half-erased arrow on the board",
  "a row of unused materials",
  "a frown that quickly turned thoughtful",
  "a folded checklist in the folder",
  "a tiny crack in the model",
  "a muddy footprint by the doorway",
  "an empty space where the next piece belonged",
  "a whisper from the back of the group",
  "a timer blinking beside the project",
  "a pencil mark around the hardest step",
  "a loose knot in the string",
];
const extraObstacles = [
  "the directions used two words nobody had noticed",
  "the first solution helped one person but not the whole group",
  "the quiet teammate had the missing information",
  "the tool they needed was across the room",
  "the example looked different from their materials",
  "the group had to choose between speed and care",
  "the small mistake changed the order of the steps",
  "the best idea sounded strange at first",
  "the helper could explain but could not do the work for them",
  "the last piece fit only when it was turned around",
  "the class was watching, but nobody was laughing",
  "the first clue made sense only after the second clue",
  "the fair choice meant waiting a little longer",
  "the safest plan took more patience",
  "the answer was written in a place no one had checked",
  "the group needed a calm voice more than a fast one",
  "the problem was smaller after it was named clearly",
  "the materials worked only on the third try",
  "the helpful detail was easy to overlook",
  "the plan improved when someone asked a question",
  "the result mattered to someone besides the main character",
  "the final step required everyone to agree",
  "the kind choice changed the mood of the room",
];

function storySeed(index: number): StorySeed {
  const name = names[index % names.length]!;
  const friend = friends[(index * 3 + 2) % friends.length]!;
  const place = storyPlaces[(index * 5 + 1) % storyPlaces.length]!;
  const object = storyObjects[(index * 7 + 4) % storyObjects.length]!;
  const want = wants[(index * 2 + 1) % wants.length]!;
  const problem = problems[(index * 3 + 4) % problems.length]!;
  const helperLine = helperLines[(index * 5 + 3) % helperLines.length]!;
  const action = `${actions[(index * 7 + 6) % actions.length]!} after ${actionEvidence[index % actionEvidence.length]!}`;
  const result = storyResults[(index * 11 + 5) % storyResults.length]!;
  const startTrait = ["unsure", "impatient", "worried", "quiet", "careless", "proud"][index % 6]!;
  const endTrait = ["confident", "patient", "honest", "thoughtful", "brave", "cooperative"][(index * 2 + 3) % 6]!;
  const titleNoun = object.replace(/^\w/, (c) => c.toUpperCase());
  const clueDetail = clueDetails[index % clueDetails.length]!;
  const extraObstacle = extraObstacles[(index * 2 + 5) % extraObstacles.length]!;
  return {
    name,
    friend,
    place,
    object,
    want,
    problem,
    helperLine,
    action,
    result,
    startTrait,
    endTrait,
    interaction: `${friend} gives ${name} advice, and ${name} uses it to make a better choice`,
    theme: [
      "asking for help can lead to success",
      "honesty is better than hiding a mistake",
      "teamwork improves a hard job",
      "practice can turn worry into confidence",
      "kindness can solve more than one problem",
      "careful thinking is stronger than rushing",
    ][(index * 5) % 6]!,
    titleNoun,
    clueDetail,
    extraObstacle,
  };
}

function makeStory(seed: StorySeed, index: number): [string, string, string] {
  const variant = index % 5;
  if (variant === 0) {
    return [
      `${seed.name} stood in the ${seed.place} with the ${seed.object} and wanted to ${seed.want}. At first, ${seed.name} acted ${seed.startTrait} because the work seemed easier in the morning.`,
      `Then ${seed.problem}. ${capitalize(seed.extraObstacle)}. ${seed.friend} noticed ${seed.clueDetail} and said, ${seed.helperLine} while pointing to the part ${seed.name} had skipped.`,
      `${seed.name} ${seed.action}. By the end, ${seed.result}, and ${seed.name} felt more ${seed.endTrait} than before.`,
    ];
  }
  if (variant === 1) {
    return [
      `${seed.name} carried the ${seed.object} into the ${seed.place}, hoping to ${seed.want} before lunch. The first few minutes felt smooth, so ${seed.name} did not listen closely to the others.`,
      `The plan changed when ${seed.problem}. ${capitalize(seed.extraObstacle)}. ${seed.friend} quietly noticed ${seed.clueDetail} and reminded the group, ${seed.helperLine}`,
      `Instead of arguing, ${seed.name} ${seed.action}. The choice helped because ${seed.result}, showing that ${seed.name} had changed.`,
    ];
  }
  if (variant === 2) {
    return [
      `At the ${seed.place}, ${seed.name} thought the ${seed.object} would be simple. ${seed.name} wanted to ${seed.want}, so there was little patience for advice.`,
      `Soon ${seed.problem}. ${capitalize(seed.extraObstacle)}. ${seed.friend} stepped closer after seeing ${seed.clueDetail} and said, ${seed.helperLine} The words made ${seed.name} look at the problem in a new way.`,
      `${seed.name} ${seed.action}. When ${seed.result}, the lesson of the day was clear.`,
    ];
  }
  if (variant === 3) {
    return [
      `${seed.name} had one goal in the ${seed.place}: ${seed.want}. The ${seed.object} sat ready, but ${seed.name}'s face showed a ${seed.startTrait} feeling.`,
      `Trouble arrived when ${seed.problem}. ${capitalize(seed.extraObstacle)}. Nobody laughed when they saw ${seed.clueDetail}. Instead, ${seed.friend} said, ${seed.helperLine}`,
      `${seed.name} ${seed.action}. After that, ${seed.result}, and the problem no longer felt too big.`,
    ];
  }
  return [
    `${seed.name} reached the ${seed.place} early and placed the ${seed.object} on the table. The plan was to ${seed.want}, even if that meant working too quickly.`,
    `Halfway through, ${seed.problem}. ${capitalize(seed.extraObstacle)}. ${seed.friend} noticed ${seed.clueDetail} and did not take over but offered this advice: ${seed.helperLine}`,
    `The advice worked when ${seed.name} ${seed.action}. Because ${seed.result}, ${seed.name} left feeling ${seed.endTrait}.`,
  ];
}

type VocabEntry = { word: string; meaning: string; wrong: [string, string, string]; clue: string; topic: string };
const vocabEntries: VocabEntry[] = [
  { word: "abundant", meaning: "more than enough", wrong: ["hard to find", "broken into pieces", "newly painted"], clue: "the basket overflowed and several extras stayed on the table", topic: "tomatoes" },
  { word: "adjust", meaning: "change a little to make fit or work better", wrong: ["throw away", "read aloud", "hide completely"], clue: "moved the strap until the helmet sat correctly", topic: "helmet" },
  { word: "ancient", meaning: "very old", wrong: ["made yesterday", "brightly colored", "easy to carry"], clue: "the pot had been buried for hundreds of years", topic: "clay pot" },
  { word: "applaud", meaning: "clap to show approval", wrong: ["whisper a secret", "walk away quickly", "cover with paper"], clue: "everyone put their hands together after the song", topic: "concert" },
  { word: "arrange", meaning: "put in a planned order", wrong: ["tear apart", "forget about", "shout loudly"], clue: "lined the cards from first event to last event", topic: "story cards" },
  { word: "assist", meaning: "help", wrong: ["refuse", "guess", "paint"], clue: "held the door while the teacher carried the box", topic: "door" },
  { word: "avoid", meaning: "stay away from", wrong: ["run toward", "decorate", "study carefully"], clue: "stepped around the puddle so his shoes stayed dry", topic: "puddle" },
  { word: "brief", meaning: "short", wrong: ["very noisy", "made of glass", "hard to lift"], clue: "the announcement lasted only one minute", topic: "announcement" },
  { word: "cautious", meaning: "careful to avoid trouble", wrong: ["careless", "sleepy", "hungry"], clue: "checked each step before climbing down", topic: "ladder" },
  { word: "collapse", meaning: "fall down suddenly", wrong: ["shine brightly", "grow taller", "become quiet"], clue: "the paper tower folded and dropped onto the desk", topic: "tower" },
  { word: "collect", meaning: "gather together", wrong: ["scatter", "borrow forever", "erase"], clue: "picked up each pencil and placed it in one cup", topic: "pencils" },
  { word: "confident", meaning: "sure about what you can do", wrong: ["afraid of trying", "covered with dust", "full of water"], clue: "smiled and began the speech without shaking", topic: "speech" },
  { word: "construct", meaning: "build", wrong: ["break", "sleep", "count backward"], clue: "used blocks and glue to make a bridge", topic: "bridge" },
  { word: "curious", meaning: "wanting to know more", wrong: ["not interested", "very heavy", "already asleep"], clue: "asked three questions about the strange seed", topic: "seed" },
  { word: "decrease", meaning: "become less", wrong: ["grow larger", "change color", "begin singing"], clue: "the stack got smaller as students took papers", topic: "paper stack" },
  { word: "delicate", meaning: "easily damaged", wrong: ["rough and strong", "very loud", "far away"], clue: "carried the thin shell with both hands", topic: "shell" },
  { word: "demonstrate", meaning: "show how to do something", wrong: ["hide the directions", "argue about lunch", "forget a name"], clue: "modeled each step before the class tried it", topic: "folding" },
  { word: "drowsy", meaning: "sleepy", wrong: ["angry", "sparkling", "empty"], clue: "yawned twice and rested his head on the desk", topic: "reading time" },
  { word: "eager", meaning: "excited and ready", wrong: ["unwilling", "covered in mud", "late"], clue: "stood by the door with her backpack on before the trip", topic: "field trip" },
  { word: "effort", meaning: "hard work", wrong: ["a tiny snack", "a loud noise", "a secret code"], clue: "sweat rolled down as the team pushed the heavy cart", topic: "cart" },
  { word: "enormous", meaning: "very large", wrong: ["tiny", "invisible", "quick"], clue: "the pumpkin took two students to lift", topic: "pumpkin" },
  { word: "examine", meaning: "look at closely", wrong: ["ignore", "throw", "sing to"], clue: "used a hand lens to study the leaf veins", topic: "leaf" },
  { word: "fragile", meaning: "easily broken", wrong: ["safe to drop", "very spicy", "already missing"], clue: "wrapped the glass ornament in soft paper", topic: "ornament" },
  { word: "frequent", meaning: "happening often", wrong: ["never happening", "made of wood", "only once"], clue: "the bell rang several times every afternoon", topic: "bell" },
  { word: "generous", meaning: "willing to share", wrong: ["selfish", "lost", "silent"], clue: "gave half of her markers to a classmate", topic: "markers" },
  { word: "glance", meaning: "look quickly", wrong: ["stare for an hour", "drop loudly", "carry home"], clue: "peeked at the clock for just a second", topic: "clock" },
  { word: "gloomy", meaning: "dark or sad", wrong: ["cheerful and bright", "very clean", "full of jokes"], clue: "gray clouds covered the sky and the room felt dim", topic: "morning" },
  { word: "grateful", meaning: "thankful", wrong: ["jealous", "careless", "hidden"], clue: "said thanks twice after the neighbor found the dog leash", topic: "leash" },
  { word: "hesitate", meaning: "pause before acting", wrong: ["rush forward", "laugh loudly", "draw a map"], clue: "stopped at the diving board before jumping", topic: "pool" },
  { word: "inspect", meaning: "check carefully", wrong: ["damage on purpose", "mix together", "run past"], clue: "looked over every wheel before the race", topic: "cart race" },
  { word: "jagged", meaning: "having sharp, uneven edges", wrong: ["smooth and round", "soft and fluffy", "freshly washed"], clue: "the broken tile had points that could cut a finger", topic: "tile" },
  { word: "loyal", meaning: "faithful and supportive", wrong: ["quick to leave", "made of metal", "very small"], clue: "cheered for her team even after a loss", topic: "team" },
  { word: "mend", meaning: "fix", wrong: ["rip more", "measure", "borrow"], clue: "used thread to close the tear in the sleeve", topic: "sleeve" },
  { word: "mild", meaning: "not strong or harsh", wrong: ["wild and dangerous", "frozen solid", "impossible"], clue: "the sauce had only a little pepper", topic: "sauce" },
  { word: "observe", meaning: "watch carefully", wrong: ["cover up", "forget", "argue"], clue: "sat quietly and noted how the ants moved", topic: "ants" },
  { word: "patient", meaning: "able to wait calmly", wrong: ["unable to wait", "very thirsty", "painted purple"], clue: "kept reading while the line moved slowly", topic: "line" },
  { word: "predict", meaning: "make a reasonable guess about what will happen", wrong: ["tell what already happened", "erase a drawing", "close a window"], clue: "used the clouds to guess rain would start soon", topic: "weather" },
  { word: "protect", meaning: "keep safe", wrong: ["give away", "make smaller", "laugh at"], clue: "put a cover over the tablet before packing it", topic: "tablet" },
  { word: "rare", meaning: "not common", wrong: ["easy to find everywhere", "very noisy", "made of cloth"], clue: "the flower blooms only once every few years", topic: "flower" },
  { word: "repair", meaning: "fix", wrong: ["hide", "count", "trade"], clue: "replaced the loose wheel so the wagon rolled again", topic: "wagon" },
  { word: "rescue", meaning: "save from danger or trouble", wrong: ["decorate", "forget", "make heavier"], clue: "pulled the wet notebook away from the spill", topic: "notebook" },
  { word: "scarce", meaning: "hard to find because there is little", wrong: ["plentiful", "brightly painted", "easy to hear"], clue: "only two pencils were left in the supply cup", topic: "pencils" },
  { word: "select", meaning: "choose", wrong: ["drop", "repair", "whisper"], clue: "picked one book from the shelf", topic: "book" },
  { word: "slender", meaning: "thin and narrow", wrong: ["wide and thick", "very noisy", "covered in ice"], clue: "the ribbon fit through the tiny hole", topic: "ribbon" },
  { word: "sturdy", meaning: "strong and not easily broken", wrong: ["weak and shaky", "wet and cold", "very sour"], clue: "the chair held the heavy box without wobbling", topic: "chair" },
  { word: "swift", meaning: "fast", wrong: ["slow", "angry", "empty"], clue: "finished the lap before anyone else reached the turn", topic: "runner" },
  { word: "temporary", meaning: "lasting for a short time", wrong: ["lasting forever", "made of stone", "too loud"], clue: "the sign would be taken down after the fair", topic: "sign" },
  { word: "timid", meaning: "shy or not bold", wrong: ["bossy", "careless", "freezing"], clue: "spoke so softly that only the front row heard", topic: "speaker" },
  { word: "triumph", meaning: "a great success or win", wrong: ["a small mistake", "a cloudy day", "a type of snack"], clue: "the team celebrated after solving the final puzzle", topic: "puzzle" },
  { word: "vanish", meaning: "disappear", wrong: ["arrive early", "grow louder", "turn blue"], clue: "the chalk marks were gone after the rain", topic: "chalk" },
];

const figurativeEntries = [
  ["as quiet as a closed library", "very quiet"], ["like a ribbon of silver", "long and shiny"], ["as proud as a flag in the wind", "very proud"],
  ["like popcorn in a hot pan", "jumping around quickly"], ["as heavy as a bucket of wet sand", "very heavy"], ["a blanket of fog", "thick fog covering the area"],
  ["the sun winked through the clouds", "the sun appeared for a moment"], ["as bright as a freshly polished bell", "very bright"], ["like a drum in his chest", "his heart beat hard"],
  ["as smooth as warm honey", "very smooth"], ["the classroom buzzed with ideas", "the room was full of excited talk"], ["like a kite cut loose", "moving freely"],
  ["as sharp as a tack", "quick to understand"], ["the wind whispered at the window", "the wind made a soft sound"], ["like a mountain of laundry", "a very large pile"],
  ["as thin as a pencil line", "very thin"], ["the clock crawled toward dismissal", "time seemed to pass slowly"], ["like sparks from a campfire", "quick bright pieces"],
  ["as busy as a kitchen before dinner", "very busy"], ["a river of students", "many students moving together"], ["the idea bloomed in her mind", "she began to understand"],
  ["as cold as a spoon from the freezer", "very cold"], ["the stairs groaned under the boxes", "the stairs made a creaking sound"], ["like a lantern in the dark", "easy to notice and helpful"],
  ["as light as a paper cup", "not heavy"], ["the news flew down the hallway", "the news spread quickly"], ["like a puzzle missing one piece", "almost complete but not finished"],
  ["as neat as a row of tiles", "very orderly"], ["the page danced in the breeze", "the page moved lightly"], ["like thunder in a gym", "very loud"],
  ["as gentle as falling snow", "very gentle"], ["the question tugged at his thoughts", "he kept thinking about the question"], ["like a door opening", "a new chance appeared"],
  ["as quick as a camera flash", "very quick"], ["the garden drank the rain", "the soil absorbed water"], ["like stepping into a freezer", "entering a very cold place"],
  ["as cheerful as a parade tune", "very cheerful"], ["the pencil raced across the page", "someone wrote quickly"], ["like a bridge between friends", "something that helped people connect"],
  ["as still as a photograph", "not moving"], ["the lights blinked awake", "the lights turned on"], ["like a secret folded in paper", "something hidden or private"],
  ["as rough as driveway gravel", "very rough"], ["the plan sprouted quickly", "the plan began to grow or develop"], ["like a map for the mind", "something that helps you understand"],
  ["as warm as a towel from the dryer", "pleasantly warm"], ["the room swallowed the sound", "the sound became hard to hear"], ["like a trail of breadcrumbs", "clues that lead somewhere"],
  ["as careful as a glass carrier", "very careful"], ["the moon painted the sidewalk", "moonlight shone on the sidewalk"],
] as const;

function infoPassage(topic: InfoTopic, index: number): [string, string, string] {
  const lead = [
    `${topic.opener} In the ${topic.place}, this may seem simple at first, but it has an important job.`,
    `Students in the ${topic.place} can learn a lot from ${article(topic.topic)} ${topic.topic}. ${topic.opener}`,
    `Many people pass the ${topic.place} without thinking about ${article(topic.topic)} ${topic.topic}. ${topic.opener}`,
  ][index % 3]!;
  const middle = [
    `${topic.important} ${topic.second} ${topic.third}`,
    `${topic.second} ${topic.third} Most of all, ${lowerFirst(topic.important)}`,
    `${topic.third} ${topic.important} ${topic.second}`,
  ][Math.floor(index / 3) % 3]!;
  const ending = [
    `${topic.minor} ${topic.result}`,
    `${topic.result} ${topic.minor}`,
    `${topic.minor} Over time, ${lowerFirst(topic.result)}`,
  ][Math.floor(index / 9) % 3]!;
  return [lead, middle, ending];
}

function article(text: string): string {
  return /^[aeiou]/i.test(text) ? "an" : "a";
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function difficulty(index: number): Difficulty {
  return (["easy", "medium", "hard"] as const)[index % 3]!;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function norm(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(text: string): Set<string> {
  return new Set(norm(text).split(" ").filter((token) => token.length > 2));
}

function jaccard(a: string, b: string): number {
  const ax = tokens(a);
  const bx = tokens(b);
  if (ax.size === 0 || bx.size === 0) return 0;
  let intersection = 0;
  for (const token of ax) if (bx.has(token)) intersection += 1;
  return intersection / (ax.size + bx.size - intersection);
}

function makeOptions(spec: Spec, index: number) {
  const keys = ["A", "B", "C", "D"] as const;
  const correctPosition = index % 4;
  const wrong = spec.options.distractors.map((text, i) => ({
    text,
    rationale: spec.options.rationales?.[i] ?? `This choice does not match the evidence in “${spec.title}.”`,
  }));
  const ordered = [...wrong];
  ordered.splice(correctPosition, 0, { text: spec.options.correct, rationale: "" });
  return ordered.map((option, i) => ({
    key: keys[i]!,
    text: option.text,
    ...(i === correctPosition ? { correct: true } : { rationale: option.rationale }),
  }));
}

function specToItem(spec: Spec, standardIndex: number, itemIndex: number): { item: Item; passage: ContentBundleImport["passages"][number] } {
  const codeSlug = spec.standardCode.replace(".", "_");
  const serial = String(itemIndex + 1).padStart(3, "0");
  const prompt = spec.prompt.includes(`“${spec.title}”`) ? spec.prompt : `${spec.prompt} Use “${spec.title}” to answer.`;
  const contentHash = hashText(`${spec.standardCode}|${spec.title}|${spec.passage.join(" ")}|${prompt}|${spec.options.correct}`);
  const passageId = `rla-exp-${codeSlug}-${serial}-${contentHash.slice(0, 8)}`;
  const itemId = `${BUNDLE_ID}:item:${codeSlug}:${serial}`;
  const options = makeOptions(spec, standardIndex * ITEMS_PER_STANDARD + itemIndex);
  const correct = options.find((option) => "correct" in option && option.correct)?.key;
  const passage = {
    id: passageId,
    title: spec.title,
    genre: spec.genre,
    level: "Grade 3",
    body: spec.passage.map((text, i) => ({ kind: "paragraph" as const, text: `${i + 1}. ${text}` })),
    wordCount: spec.passage.join(" ").split(/\s+/).length,
  };
  const item = itemSchema.parse({
    _id: itemId,
    bundleId: BUNDLE_ID,
    programKey: PROGRAM_KEY,
    subject: SUBJECT,
    source: `${SOURCE}:${contentHash}`,
    standardCodes: [spec.standardCode],
    type: "multiple_choice",
    difficulty: spec.difficulty,
    passageRef: passageId,
    prompt: [prompt],
    figures: [],
    options,
    correct,
    points: 1,
    allowPartialCredit: false,
    explanation: [spec.explanation],
    workedSolution: [spec.solution],
  });
  return { item, passage };
}

function distractorSummary(topic: InfoTopic, kind: "tooSmall" | "opposite" | "wrongText"): string {
  if (kind === "tooSmall") return topic.minor.replace(/\.$/, "");
  if (kind === "opposite") return topic.central.includes("reduce") ? "Throwaway supplies are always the best choice" : `${topic.titleNoun}s are not useful to readers`;
  return "The passage is mainly a made-up adventure with talking characters";
}

function generate310A(index: number): Spec {
  const topic = infoTopics[(index * 7) % infoTopics.length]!;
  const body = infoPassage(topic, index);
  const mode = index % 5;
  const title = `${topic.titleNoun} Purpose ${index + 1}`;
  if (mode === 0) {
    return {
      standardCode: "3.10A",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Why did the author most likely write “${title}”?`,
      options: {
        correct: `To ${topic.purpose}`,
        distractors: [
          `To tell a fantasy story about ${topic.topic}`,
          `To list every color found in the ${topic.place}`,
          `To make readers afraid of ${topic.topic}`,
        ],
      },
      explanation: `The passage gives facts and reasons about ${topic.topic}, so the author's purpose is to ${topic.purpose}.`,
      solution: `Look at what most sentences do. They explain ${topic.topic}; they do not tell a fantasy story or try to scare readers.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.10A",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What message does the author share in “${title}”?`,
      options: {
        correct: capitalize(topic.message),
        distractors: [
          `${topic.titleNoun}s should be ignored because details do not matter`,
          `The ${topic.place} should never change its routines`,
          `Guessing is better than using information`,
        ],
      },
      explanation: `The details point to the message that ${topic.message}.`,
      solution: `The correct message is supported by the important details and result in the passage.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.10A",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which sentence BEST explains the author's purpose?`,
      options: {
        correct: `The author wants readers to understand how ${topic.topic} can help.`,
        distractors: [
          `The author wants readers to memorize a poem about the ${topic.place}.`,
          `The author wants readers to believe ${topic.topic} is useless.`,
          `The author wants readers to compare two imaginary characters.`,
        ],
      },
      explanation: `The author includes facts that show how ${topic.topic} helps, which reveals the purpose.`,
      solution: `A purpose statement should match the whole text, not one small detail or an opposite idea.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.10A",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What does the author want the reader to think about ${topic.topic}?`,
      options: {
        correct: `They are useful because ${lowerFirst(topic.result)}`,
        distractors: [
          `They matter only because ${lowerFirst(topic.minor)}`,
          `They create problems that cannot be solved`,
          `They belong only in made-up stories`,
        ],
      },
      explanation: `The author emphasizes the useful result: ${topic.result}`,
      solution: `Use the final result and key details to identify what the author wants readers to understand.`,
    };
  }
  return {
    standardCode: "3.10A",
    title,
    genre: "informational",
    difficulty: difficulty(index),
    passage: body,
    prompt: `Which choice states both the author's purpose and message?`,
    options: {
      correct: `Purpose: to explain ${topic.topic}; Message: ${topic.message}.`,
      distractors: [
        `Purpose: to entertain with magic; Message: never use ${topic.topic}.`,
        `Purpose: to describe the color of one object; Message: colors solve every problem.`,
        `Purpose: to tell a joke; Message: school tools are always silly.`,
      ],
    },
    explanation: `The passage explains ${topic.topic} and supports the message that ${topic.message}.`,
    solution: `The correct answer matches both what the text does and the idea its details support.`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function generate310D(index: number): Spec {
  const [phrase, meaning] = figurativeEntries[index % figurativeEntries.length]!;
  const seed = storySeed(index);
  const title = `Figure in ${seed.titleNoun} ${index + 1}`;
  const body: [string, string, string] = [
    `${seed.name} paused in the ${seed.place} while the ${seed.object} waited on the table.`,
    `When ${seed.problem}, ${seed.name} noticed that the moment felt ${phrase}.`,
    `${seed.friend} helped ${seed.name} choose the next step, and soon ${seed.result}.`,
  ];
  const mode = index % 4;
  if (mode === 0) {
    return {
      standardCode: "3.10D",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What does the phrase “${phrase}” mean in paragraph 2?`,
      options: {
        correct: capitalize(meaning),
        distractors: [
          `It means ${seed.name} forgot where the ${seed.object} was.`,
          `It means the ${seed.place} was closed for the day.`,
          `It means ${seed.friend} was telling a joke.`,
        ],
      },
      explanation: `The phrase is figurative language. In this context, “${phrase}” means ${meaning}.`,
      solution: `Use the surrounding sentence and the comparison to decide what idea the phrase creates.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.10D",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Why is “${phrase}” an example of figurative language?`,
      options: {
        correct: `It helps readers picture the moment as ${meaning}, not as a literal fact.`,
        distractors: [
          `It gives the exact time of day in “${title}.”`,
          `It names every person who enters the ${seed.place}.`,
          `It tells the reader the page number for the ${seed.object}.`,
        ],
      },
      explanation: `The phrase is not meant only literally; it helps readers picture the moment as ${meaning}.`,
      solution: `Figurative language uses words in a special way to create meaning or a picture.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.10D",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which sentence from the passage uses figurative language?`,
      options: {
        correct: `“${seed.name} noticed that the moment felt ${phrase}.”`,
        distractors: [
          `“${seed.name} paused in the ${seed.place}.”`,
          `“${seed.friend} helped ${seed.name} choose the next step.”`,
          `“The ${seed.object} waited on the table.”`,
        ],
      },
      explanation: `The correct sentence uses “${phrase},” which is a figurative description.`,
      solution: `Find the sentence that uses words in a nonliteral or imaginative way.`,
    };
  }
  return {
    standardCode: "3.10D",
    title,
    genre: "literary",
    difficulty: difficulty(index),
    passage: body,
    prompt: `How does the figurative phrase “${phrase}” help the reader?`,
    options: {
      correct: `It helps the reader imagine that the moment was ${meaning}.`,
      distractors: [
        `It explains the exact size of the ${seed.object}.`,
        `It proves that the story happened long ago.`,
        `It lists the steps for solving the problem.`,
      ],
    },
    explanation: `The phrase adds a picture or feeling by showing the moment as ${meaning}.`,
    solution: `Figurative language often helps readers imagine a feeling, sound, sight, or action more clearly.`,
  };
}

function generate33B(index: number): Spec {
  const entry = vocabEntries[index % vocabEntries.length]!;
  const seed = storySeed(index + 13);
  const title = `Context Clue ${entry.word} ${index + 1}`;
  const frameIndex = Math.floor(index / vocabEntries.length) % 3;
  const frames: [string, string, string][] = [
    [
      `${seed.name} noticed the ${entry.topic} during class.`,
      `The ${entry.topic} was ${entry.word}: ${entry.clue}.`,
      `${seed.name} used the clue in the sentence to understand the new word.`,
    ],
    [
      `At the ${seed.place}, ${seed.name} heard the word ${entry.word}.`,
      `The sentence gave a clue because ${entry.clue}.`,
      `That clue helped ${seed.name} figure out the meaning without a dictionary.`,
    ],
    [
      `${seed.friend} pointed to the ${entry.topic} and used the word ${entry.word}.`,
      `Nearby words explained the meaning: ${entry.clue}.`,
      `${seed.name} reread the sentence and understood the word.`,
    ],
  ];
  const choiceSet = frameIndex === 0
    ? {
      correct: capitalize(entry.meaning),
      distractors: entry.wrong,
    }
    : frameIndex === 1
      ? {
        correct: `It means “${entry.meaning}.”`,
        distractors: entry.wrong.map((wrong) => `It means “${wrong}.”`) as [string, string, string],
      }
      : {
        correct: `The clue points to “${entry.meaning}.”`,
        distractors: entry.wrong.map((wrong) => `The clue points to “${wrong}.”`) as [string, string, string],
      };
  return {
    standardCode: "3.3B",
    title,
    genre: "informational",
    difficulty: difficulty(index),
    passage: frames[frameIndex]!,
    prompt: `What does the word “${entry.word}” mean in the passage?`,
    options: {
      correct: choiceSet.correct,
      distractors: choiceSet.distractors,
      rationales: [
        `The context clue says ${entry.clue}, so this meaning does not fit.`,
        `The nearby words point to “${entry.meaning},” not this idea.`,
        `This choice is not supported by the clue in the passage.`,
      ],
    },
    explanation: `The context clue “${entry.clue}” shows that “${entry.word}” means ${entry.meaning}.`,
    solution: `Reread the sentence around the word. The clue explains the meaning directly or by example.`,
  };
}

function generate36F(index: number): Spec {
  const seed = storySeed(index + 29);
  const title = `Inference ${seed.titleNoun} ${index + 1}`;
  const body = makeStory(seed, index);
  const mode = index % 5;
  if (mode === 0) {
    return {
      standardCode: "3.6F",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What can the reader infer about ${seed.name} by the end of “${title}”?`,
      options: {
        correct: `${seed.name} has learned to be more ${seed.endTrait} by choosing to ${seed.action}.`,
        distractors: [
          `${seed.name} wants the ${seed.object} problem to become worse.`,
          `${seed.name} never listens to ${seed.friend} in the ${seed.place}.`,
          `${seed.name} decides that ${seed.want} is the only thing that matters.`,
        ],
      },
      explanation: `The ending shows ${seed.name} taking action and getting a better result, so the reader can infer a change.`,
      solution: `Combine the beginning feeling with the ending action to make a supported inference.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.6F",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Why does ${seed.name} most likely ${seed.action}?`,
      options: {
        correct: `Because ${seed.extraObstacle}, so ${seed.name} understands that a new plan is needed.`,
        distractors: [
          `Because ${seed.name} wants to make ${seed.friend} upset about ${seed.clueDetail}.`,
          `Because the ${seed.object} has disappeared forever from the ${seed.place}.`,
          `Because ${seed.name} decides ${seed.clueDetail} is not important.`,
        ],
      },
      explanation: `The problem and advice lead ${seed.name} to try a better action.`,
      solution: `Use the problem, the advice, and the action together to infer the reason.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.6F",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which detail BEST supports the inference that ${seed.friend} wants to help ${seed.name}?`,
      options: {
        correct: `${seed.friend} gives advice that helps ${seed.name} ${seed.action}.`,
        distractors: [
          `${seed.name} stands in the ${seed.place}.`,
          `The ${seed.object} is on the table.`,
          `${seed.name} wanted to ${seed.want}.`,
        ],
      },
      explanation: `${seed.friend}'s advice helps ${seed.name} make a better choice.`,
      solution: `Evidence for an inference should point directly to the idea being inferred.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.6F",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Based on the passage, what will ${seed.name} probably do the next time a task is difficult?`,
      options: {
        correct: `${seed.name} will likely remember ${seed.friend}'s advice and ${seed.action}.`,
        distractors: [
          `${seed.name} will hide every mistake in the ${seed.place}.`,
          `${seed.name} will refuse to work with ${seed.friend} again.`,
          `${seed.name} will throw away the ${seed.object} before starting.`,
        ],
      },
      explanation: `${seed.name} solves the problem by using advice and taking a better action.`,
      solution: `A prediction should grow from what the character learns in the passage.`,
    };
  }
  return {
    standardCode: "3.6F",
    title,
    genre: "literary",
    difficulty: difficulty(index),
      passage: body,
      prompt: `What is the best inference the reader can make from the sentence with ${seed.friend}'s advice?`,
      options: {
        correct: `${seed.friend} notices what ${seed.name} needs and offers guidance that leads to ${seed.action}.`,
        distractors: [
          `${seed.friend} wants to stop the whole activity.`,
        `${seed.friend} has never solved a problem before.`,
        `${seed.friend} is trying to hide the ${seed.object}.`,
      ],
    },
    explanation: `The advice fits the problem, so it shows that ${seed.friend} is paying attention and trying to guide ${seed.name}.`,
    solution: `An inference must be supported by a detail in the text, not by a random guess.`,
  };
}

function generate36G(index: number): Spec {
  const topic = infoTopics[(index * 5 + 2) % infoTopics.length]!;
  const title = `${topic.titleNoun} Key Idea ${index + 1}`;
  const body = infoPassage(topic, index);
  const mode = index % 5;
  if (mode === 0) {
    return {
      standardCode: "3.6G",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which detail is MOST important to the key idea of “${title}”?`,
      options: {
        correct: topic.important,
        distractors: [topic.minor, `The ${topic.place} has many ordinary sounds.`, `Someone may walk past the ${topic.place}.`],
      },
      explanation: `The detail “${topic.important}” directly supports the key idea: ${topic.central}`,
      solution: `Important details explain the central idea. Minor details may be true but are not needed.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.6G",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which sentence BEST states the key idea of the passage?`,
      options: {
        correct: topic.central,
        distractors: [distractorSummary(topic, "tooSmall"), distractorSummary(topic, "opposite"), distractorSummary(topic, "wrongText")],
      },
      explanation: `The whole passage explains that ${lowerFirst(topic.central)}.`,
      solution: `A key idea covers the whole passage, not just one small detail.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.6G",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which detail could be left out of a short explanation of the key idea?`,
      options: {
        correct: topic.minor,
        distractors: [topic.important, topic.second, topic.result],
      },
      explanation: `“${topic.minor}” is a small descriptive detail. The other choices support the key idea.`,
      solution: `To evaluate details, decide whether each one helps explain the main point.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.6G",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which pair of details BEST supports the key idea?`,
      options: {
        correct: `${topic.important} Also, ${lowerFirst(topic.result)}`,
        distractors: [
          `${topic.minor} Also, the title has two words.`,
          `The ${topic.place} exists. Also, the paragraph has sentences.`,
          `${topic.minor} Also, someone might see the ${topic.place}.`,
        ],
      },
      explanation: `Both details in the correct answer explain why the topic matters.`,
      solution: `The best pair of details should both connect to the central idea.`,
    };
  }
  return {
    standardCode: "3.6G",
    title,
    genre: "informational",
    difficulty: difficulty(index),
    passage: body,
    prompt: `What makes the detail “${topic.second}” important?`,
    options: {
      correct: `It helps explain ${lowerFirst(topic.central)}.`,
      distractors: [
        "It changes the passage into a poem.",
        "It tells a joke that is unrelated to the topic.",
        "It gives the name of a made-up character.",
      ],
    },
    explanation: `The detail supports the central idea by explaining part of how ${topic.topic} helps.`,
    solution: `Important details connect to the key idea and help the reader understand it.`,
  };
}

function generate37C(index: number): Spec {
  const topic = infoTopics[(index * 11 + 4) % infoTopics.length]!;
  const title = `${topic.titleNoun} Evidence ${index + 1}`;
  const body = infoPassage(topic, index);
  const claims = [
    { claim: topic.central, evidence: topic.important },
    { claim: topic.message, evidence: topic.result },
    { claim: `${topic.topic} can be useful in the ${topic.place}`, evidence: topic.second },
    { claim: `${topic.topic} helps people understand or solve a problem`, evidence: topic.third },
  ];
  const selected = claims[index % claims.length]!;
  return {
    standardCode: "3.7C",
    title,
    genre: "informational",
    difficulty: difficulty(index),
    passage: body,
    prompt: `Which detail from “${title}” BEST supports this response? ${capitalize(selected.claim)}.`,
    options: {
      correct: selected.evidence,
      distractors: [
        topic.minor,
        `The ${topic.place} is mentioned near the beginning.`,
        `The title includes the words “${topic.titleNoun}.”`,
      ],
    },
    explanation: `The detail “${selected.evidence}” directly supports the response.`,
    solution: `Text evidence should match the claim. Small details or title facts are weaker evidence.`,
  };
}

function generate37D(index: number): Spec {
  const mode = index % 5;
  if (mode <= 1) {
    const topic = infoTopics[(index * 13 + 3) % infoTopics.length]!;
    const title = `${topic.titleNoun} Summary ${index + 1}`;
    const body = infoPassage(topic, index);
    return {
      standardCode: "3.7D",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: mode === 0 ? `Which sentence is the BEST summary of “${title}”?` : `Which sentence best paraphrases the main point of “${title}”?`,
      options: {
        correct: mode === 0
          ? `Summary: ${topic.central} The passage explains this with details about ${topic.topic}.`
          : `Paraphrase: The passage says that ${lowerFirst(topic.central)}.`,
        distractors: [
          mode === 0
            ? `${topic.minor} That is the only idea in the passage.`
            : `Paraphrase: The only point is that ${lowerFirst(topic.minor)}`,
          mode === 0
            ? `The passage is mostly about a character who loses a magic key.`
            : `Paraphrase: A character solves a magical problem with a key.`,
          mode === 0
            ? `The passage lists colors but does not explain why ${topic.topic} matters.`
            : `Paraphrase: The passage gives colors but no information about ${topic.topic}.`,
        ],
      },
      explanation: `The correct choice retells the main idea and important details without copying every sentence.`,
      solution: `A summary or paraphrase should include the main point and leave out small details.`,
    };
  }
  const seed = storySeed(index + 47);
  const title = `Retell ${seed.titleNoun} ${index + 1}`;
  const body = makeStory(seed, index);
  if (mode === 2) {
    return {
      standardCode: "3.7D",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which sentence BEST summarizes the story “${title}”?`,
      options: {
        correct: `${seed.name} faces a problem because ${seed.extraObstacle}, uses advice from ${seed.friend}, and solves it by choosing to ${seed.action}.`,
        distractors: [
          `${seed.name} spends the whole story describing ${seed.clueDetail}.`,
          `${seed.friend} leaves before ${seed.extraObstacle}.`,
          `The story explains how to build every kind of ${seed.object} in the ${seed.place}.`,
        ],
      },
      explanation: `The correct summary includes the character, problem, helpful advice, and solution.`,
      solution: `Summaries include the most important events, not every small detail.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.7D",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which event should come FIRST in a retelling of “${title}”?`,
      options: {
        correct: `${seed.name} wants to ${seed.want} in the ${seed.place}.`,
        distractors: [
          `${seed.name} ${seed.action}.`,
          `${seed.result}.`,
          `${seed.friend} gives advice after the problem appears.`,
        ],
      },
      explanation: `A retelling follows the order of the story. The goal at the beginning comes first.`,
      solution: `Look for the event that happens before the problem, advice, and solution.`,
    };
  }
  return {
    standardCode: "3.7D",
    title,
    genre: "literary",
    difficulty: difficulty(index),
    passage: body,
    prompt: `Which choice paraphrases ${seed.friend}'s advice in the story?`,
    options: {
      correct: `${seed.friend} tells ${seed.name} to think carefully about ${seed.extraObstacle} and use a better plan.`,
      distractors: [
        `${seed.friend} tells ${seed.name} to quit immediately because of ${seed.clueDetail}.`,
        `${seed.friend} says the ${seed.object} is not important to anyone in the ${seed.place}.`,
        `${seed.friend} asks ${seed.name} to hide the problem instead of choosing to ${seed.action}.`,
      ],
    },
    explanation: `A paraphrase restates the advice in new words while keeping the meaning.`,
    solution: `The correct paraphrase keeps the helpful meaning of the original advice.`,
  };
}

function generate38B(index: number): Spec {
  const seed = storySeed(index + 71);
  const title = `Character Change ${seed.titleNoun} ${index + 1}`;
  const body = makeStory(seed, index);
  const mode = index % 4;
  if (mode === 0) {
    return {
      standardCode: "3.8B",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `How does ${seed.name} change from the beginning to the end of “${title}”?`,
      options: {
        correct: `${seed.name} changes from ${seed.startTrait} to more ${seed.endTrait} after choosing to ${seed.action}.`,
        distractors: [
          `${seed.name} becomes less willing to solve problems after noticing ${seed.clueDetail}.`,
          `${seed.name} forgets every lesson from ${seed.friend} about ${seed.extraObstacle}.`,
          `${seed.name} changes from helpful to cruel in the ${seed.place}.`,
        ],
      },
      explanation: `At first ${seed.name} is ${seed.startTrait}, but the ending shows a more ${seed.endTrait} choice.`,
      solution: `Compare the character's beginning behavior with the ending behavior.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.8B",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which choice BEST describes the interaction between ${seed.name} and ${seed.friend}?`,
      options: {
        correct: `${capitalize(seed.interaction)} when ${seed.extraObstacle}.`,
        distractors: [
          `${seed.friend} makes ${seed.clueDetail} harder and refuses to speak.`,
          `${seed.name} ignores ${seed.friend} and never changes after ${seed.extraObstacle}.`,
          `${seed.friend} takes the ${seed.object} and leaves the ${seed.place}.`,
        ],
      },
      explanation: `${seed.friend}'s advice affects ${seed.name}'s next action.`,
      solution: `Character interaction is about how characters affect each other.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.8B",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which detail shows that ${seed.name} is changing?`,
      options: {
        correct: `${seed.name} ${seed.action}.`,
        distractors: [
          `${seed.name} reached the ${seed.place}.`,
          `The ${seed.object} was nearby.`,
          `${seed.friend} was present in the story.`,
        ],
      },
      explanation: `The action shows a new choice after the problem and advice.`,
      solution: `A change detail should show different behavior, not just setting or objects.`,
    };
  }
  return {
    standardCode: "3.8B",
    title,
    genre: "literary",
    difficulty: difficulty(index),
    passage: body,
    prompt: `What causes ${seed.name} to act differently?`,
    options: {
      correct: `${seed.friend}'s advice about ${seed.extraObstacle} makes ${seed.name} rethink the plan.`,
      distractors: [
        `The ${seed.object} turns into something magical after ${seed.clueDetail}.`,
        `${seed.name} never has a problem to solve in the ${seed.place}.`,
        `The story skips from ${seed.clueDetail} straight to bedtime.`,
      ],
    },
    explanation: `The problem plus advice leads to the character's changed action.`,
    solution: `Find what happens just before the character makes the new choice.`,
  };
}

function generate38C(index: number): Spec {
  const seed = storySeed(index + 89);
  const title = `Plot Lesson ${seed.titleNoun} ${index + 1}`;
  const body = makeStory(seed, index);
  const mode = index % 5;
  if (mode === 0) {
    return {
      standardCode: "3.8C",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What is the main problem in “${title}”?`,
      options: {
        correct: `${capitalize(seed.problem)}, and ${seed.extraObstacle}.`,
        distractors: [
          `${seed.name} already knows exactly what to do after seeing ${seed.clueDetail}.`,
          `${seed.friend} refuses to appear in the story about the ${seed.object}.`,
          `The ${seed.place} is only described as quiet and has no conflict.`,
        ],
      },
      explanation: `The plot problem is the trouble that interrupts ${seed.name}'s plan.`,
      solution: `Find the event that creates conflict or makes the goal harder.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.8C",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `How is the problem solved in “${title}”?`,
      options: {
        correct: `${seed.name} ${seed.action}.`,
        distractors: [
          `${seed.name} pretends the problem is not there.`,
          `${seed.friend} hides all the materials.`,
          `The problem is never solved.`,
        ],
      },
      explanation: `The resolution happens when ${seed.name} takes the action that leads to a better result.`,
      solution: `A resolution tells how the problem is worked out.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.8C",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What lesson does “${title}” teach?`,
      options: {
        correct: `${capitalize(seed.theme)}, as shown when ${seed.name} ${seed.action}.`,
        distractors: [
          `It is better to hide ${seed.clueDetail} than fix mistakes.`,
          `People should never listen to advice about ${seed.extraObstacle}.`,
          `Trying again with the ${seed.object} always makes a problem worse.`,
        ],
      },
      explanation: `The events show the lesson that ${seed.theme}.`,
      solution: `A story's lesson grows from what the character learns through the plot.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.8C",
      title,
      genre: "literary",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which event is part of the rising action before the problem is solved?`,
      options: {
        correct: `${seed.friend} gives advice after ${seed.problem} and ${seed.extraObstacle}.`,
        distractors: [
          `${seed.result}.`,
          `${seed.name} leaves feeling ${seed.endTrait} after ${seed.action}.`,
          `The story's lesson becomes clear after ${seed.clueDetail} is no longer important.`,
        ],
      },
      explanation: `Advice after the problem builds toward the solution, so it is part of the rising action.`,
      solution: `Rising action happens after the problem begins and before the resolution.`,
    };
  }
  return {
    standardCode: "3.8C",
    title,
    genre: "literary",
    difficulty: difficulty(index),
    passage: body,
    prompt: `Which sentence BEST explains how the plot supports the lesson?`,
    options: {
      correct: `${seed.name} faces ${seed.extraObstacle}, accepts help, and learns that ${seed.theme}.`,
      distractors: [
        `${seed.name} never faces ${seed.clueDetail}, so there is no lesson.`,
        `The setting changes to the ${seed.place}, but no character makes a choice.`,
        `The title tells the whole lesson without the event where ${seed.name} ${seed.action}.`,
      ],
    },
    explanation: `The plot events show the lesson through the character's choices and result.`,
    solution: `Connect the problem, action, and ending to the lesson.`,
  };
}

function generate39D(index: number): Spec {
  const topic = infoTopics[(index * 17 + 1) % infoTopics.length]!;
  const title = `${topic.titleNoun} Informational ${index + 1}`;
  const body = infoPassage(topic, index);
  const mode = index % 5;
  if (mode === 0) {
    return {
      standardCode: "3.9D",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What is the central idea of “${title}”?`,
      options: {
        correct: topic.central,
        distractors: [
          `${topic.minor} is the most important idea.`,
          `The passage is mostly about a make-believe adventure.`,
          `${topic.topic} should never be used.`,
        ],
      },
      explanation: `The passage is informational and all major details support the idea that ${lowerFirst(topic.central)}.`,
      solution: `The central idea is what the whole informational text is mostly about.`,
    };
  }
  if (mode === 1) {
    return {
      standardCode: "3.9D",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which feature shows that “${title}” is informational text?`,
      options: {
        correct: `It uses ${topic.feature}.`,
        distractors: [
          "It has magical events that could not happen.",
          "It is written as a play with character names before each line.",
          "It uses only rhyming lines and no facts.",
        ],
      },
      explanation: `Informational text teaches about a topic using facts and text features. This passage uses ${topic.feature}.`,
      solution: `Look for facts, explanations, labels, steps, diagrams, headings, or other nonfiction features.`,
    };
  }
  if (mode === 2) {
    return {
      standardCode: "3.9D",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `Which detail supports the central idea of “${title}”?`,
      options: {
        correct: topic.result,
        distractors: [
          topic.minor,
          `The passage has three paragraphs.`,
          `The title has a capital letter.`,
        ],
      },
      explanation: `The result supports the central idea because it explains why the topic matters.`,
      solution: `A supporting detail should explain the central idea, not just name a small description.`,
    };
  }
  if (mode === 3) {
    return {
      standardCode: "3.9D",
      title,
      genre: "informational",
      difficulty: difficulty(index),
      passage: body,
      prompt: `What is the author's main purpose in this informational text?`,
      options: {
        correct: `To ${topic.purpose}`,
        distractors: [
          `To tell a fairy tale about ${topic.topic}`,
          `To describe only the color of one object`,
          `To confuse readers with made-up facts`,
        ],
      },
      explanation: `The text gives facts and explanations, so the purpose is to ${topic.purpose}.`,
      solution: `Informational text usually explains, describes, or teaches about a real topic.`,
    };
  }
  return {
    standardCode: "3.9D",
    title,
    genre: "informational",
    difficulty: difficulty(index),
    passage: body,
    prompt: `Which choice tells why the passage is NOT mainly a story?`,
    options: {
      correct: `It explains facts about ${topic.topic} instead of focusing on a character's problem.`,
      distractors: [
        "It has a title, and only stories have titles.",
        "It mentions a place, and informational texts never mention places.",
        "It has paragraphs, and paragraphs are not used in nonfiction.",
      ],
    },
    explanation: `The passage explains a real topic with facts, which is a characteristic of informational text.`,
    solution: `Decide whether the text mostly teaches facts or tells a character's plot.`,
  };
}

const generators: Record<StandardCode, (index: number) => Spec> = {
  "3.10A": generate310A,
  "3.10D": generate310D,
  "3.3B": generate33B,
  "3.6F": generate36F,
  "3.6G": generate36G,
  "3.7C": generate37C,
  "3.7D": generate37D,
  "3.8B": generate38B,
  "3.8C": generate38C,
  "3.9D": generate39D,
};

function validateUniqueness(items: Item[], passages: ContentBundleImport["passages"]): void {
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const promptKeys = new Set<string>();
  const passageQuestionKeys = new Set<string>();
  const answerSetByStandard = new Map<string, Map<string, string>>();
  const combinedByStandard = new Map<string, Array<{ id: string; text: string }>>();

  for (const item of items) {
    const standard = item.standardCodes[0]!;
    const prompt = item.prompt.map((node) => (typeof node === "string" ? node : node.text ?? "")).join(" ");
    const passage = item.passageRef ? passageById.get(item.passageRef) : undefined;
    const passageText = passage?.body.map((node) => (typeof node === "string" ? node : node.text ?? "")).join(" ") ?? "";
    const promptKey = norm(prompt);
    if (promptKeys.has(promptKey)) throw new Error(`Duplicate question text: ${prompt}`);
    promptKeys.add(promptKey);

    const passageQuestionKey = norm(`${passageText} ${prompt}`);
    if (passageQuestionKeys.has(passageQuestionKey)) throw new Error(`Duplicate passage-question combination: ${item._id}`);
    passageQuestionKeys.add(passageQuestionKey);

    const answerSet = norm((item.options ?? []).map((option) => option.text).sort().join("|"));
    const answerSets = answerSetByStandard.get(standard) ?? new Map<string, string>();
    const priorAnswerSetId = answerSets.get(answerSet);
    if (priorAnswerSetId) throw new Error(`Duplicate answer-choice set for ${standard}: ${priorAnswerSetId} and ${item._id}`);
    answerSets.set(answerSet, item._id);
    answerSetByStandard.set(standard, answerSets);

    const combined = `${prompt} ${passageText} ${(item.options ?? []).map((option) => option.text).join(" ")}`;
    const list = combinedByStandard.get(standard) ?? [];
    for (const prior of list) {
      if (jaccard(combined, prior.text) > 0.92) {
        throw new Error(`Near-duplicate generated item for ${standard}: ${prior.id} and ${item._id}`);
      }
    }
    list.push({ id: item._id, text: combined });
    combinedByStandard.set(standard, list);
  }

  for (const standard of TARGET_STANDARDS) {
    const count = items.filter((item) => item.standardCodes.includes(standard)).length;
    if (count !== ITEMS_PER_STANDARD) throw new Error(`Expected ${ITEMS_PER_STANDARD} items for ${standard}, got ${count}`);
  }
}

function buildBundle(): ContentBundleImport {
  const items: Item[] = [];
  const passages: ContentBundleImport["passages"] = [];

  TARGET_STANDARDS.forEach((standard, standardIndex) => {
    for (let i = 0; i < ITEMS_PER_STANDARD; i += 1) {
      const spec = generators[standard](i);
      const { item, passage } = specToItem(spec, standardIndex, i);
      items.push(item);
      passages.push(passage);
    }
  });

  validateUniqueness(items, passages);

  return contentBundleSchema.parse({
    programKey: PROGRAM_KEY,
    subject: SUBJECT,
    version: VERSION,
    status: "available",
    title: "Grade 3 STAAR RLA Practice Expansion",
    standards: TARGET_STANDARDS.map((code) => ({
      code,
      programKey: PROGRAM_KEY,
      subject: SUBJECT,
      ...standards[code],
    })),
    passages,
    items,
  });
}

const bundle = buildBundle();
writeFileSync(OUTFILE, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`Wrote ${OUTFILE}`);
for (const standard of TARGET_STANDARDS) {
  const count = bundle.items.filter((item) => item.standardCodes.includes(standard)).length;
  console.log(`${standard}: ${count}`);
}
