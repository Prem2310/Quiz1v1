/**
 * Public topic pages (/topics/:slug). Original explainer copy only: no question text is republished here,
 * so these pages add something a question bank does not (and never duplicate its content).
 * Plain data on purpose: vite.config.ts imports the slugs to build sitemap.xml.
 */
export interface Topic {
  slug: string;
  name: string;
  /** One line for the landing-page tile. */
  blurb: string;
  /** <title>, kept near 60 characters. */
  title: string;
  /** <meta name="description">, kept under about 160 characters. */
  description: string;
  heading: string;
  intro: string[];
  covers: string[];
  tips: { title: string; body: string }[];
  faq: { q: string; a: string }[];
  related: string[];
}

const practiceFaq = (name: string, how: string): Topic["faq"] => [
  {
    q: `How can I get faster at ${name.toLowerCase()}?`,
    a: `${how} Live 1v1 duels help too, because racing another student makes you commit to an answer quickly.`,
  },
  {
    q: `Can I practise ${name.toLowerCase()} on quiz1v1 for free?`,
    a: `Yes. Create a free account, pick the topic in practice mode or as a duel filter, and start. Missed questions come back sooner until you answer them right.`,
  },
];

export const TOPICS: Topic[] = [
  {
    slug: "quantitative-aptitude",
    name: "Quantitative aptitude",
    blurb: "Percentages, ratios, time and work, averages and the arithmetic that placement tests lean on.",
    title: "Quantitative Aptitude Practice for Placements | quiz1v1",
    description:
      "Practise quantitative aptitude for campus placements and bank exams: percentages, ratios, time and work, profit and loss and more. Free on quiz1v1.",
    heading: "Quantitative aptitude practice",
    intro: [
      "Quantitative aptitude is the arithmetic and number-reasoning section that shows up in almost every campus placement test and in most banking and SSC-style exams. It rewards speed as much as accuracy: the maths is rarely hard, but the clock is.",
      "On quiz1v1 you can drill it topic by topic, then test your speed against another student in a live 1v1 duel.",
    ],
    covers: [
      "Percentages",
      "Profit and loss",
      "Ratio and proportion",
      "Averages",
      "Time and work",
      "Time, speed and distance",
      "Simple and compound interest",
      "Mixtures and alligation",
      "Number systems",
      "Permutations, combinations and probability",
    ],
    tips: [
      { title: "Learn the shortcuts once", body: "Common fractions as percentages (1/8 is 12.5%), squares up to 30 and familiar ratios save seconds on every question. Memorise them before you start timing yourself." },
      { title: "Estimate before you calculate", body: "When the options are far apart, round and eliminate. A quick estimate often removes two choices before you do any exact arithmetic." },
      { title: "Time every session", body: "Give yourself a per-question limit and stick to it. Leaving a question that is eating your clock is a skill you only build under time pressure." },
      { title: "Redo your misses", body: "Solve the questions you got wrong again until you can do them cold. quiz1v1 brings missed questions back sooner for exactly this reason." },
    ],
    faq: [
      {
        q: "What does quantitative aptitude cover in placement tests?",
        a: "Most papers draw on percentages, profit and loss, ratios, averages, time and work, time-speed-distance, interest, number systems and basic probability.",
      },
      ...practiceFaq("Quantitative aptitude", "Memorise the common fractions, percentages and squares, practise under a timer and review every miss."),
    ],
    related: ["data-interpretation", "logical-reasoning", "verbal-ability"],
  },
  {
    slug: "data-interpretation",
    name: "Data interpretation",
    blurb: "Tables, bar charts, line graphs and pie charts, read fast and answered accurately.",
    title: "Data Interpretation Practice Online | quiz1v1",
    description:
      "Practise data interpretation with tables, bar graphs, line graphs and pie charts, timed questions and live 1v1 duels. Free on quiz1v1.",
    heading: "Data interpretation practice",
    intro: [
      "Data interpretation tests whether you can read a table or chart quickly and answer questions from it. It appears in banking exams, management-entrance style tests and many campus placement papers.",
      "The skill is less about hard maths and more about reading carefully and approximating fast, which is exactly what timed practice builds.",
    ],
    covers: ["Tables", "Bar graphs", "Line graphs", "Pie charts", "Mixed charts", "Caselets"],
    tips: [
      { title: "Read the title, axes and units first", body: "Many wrong answers come from misreading thousands as millions or a percentage as a count. Ten seconds on the labels saves the question." },
      { title: "Approximate percentages", body: "You rarely need the exact figure. Rounding to the nearest easy number is usually enough to pick the right option." },
      { title: "Practise one chart type at a time", body: "Pie charts, line graphs and tables each have their own traps. Drill them separately, then mix them." },
      { title: "Skip the calculation-heavy set first", body: "In a timed paper, answer the quick-read questions from a chart before spending time on the long ones." },
    ],
    faq: [
      {
        q: "What is data interpretation in aptitude tests?",
        a: "It is a section where you answer questions using data shown in tables and charts such as bar graphs, line graphs and pie charts.",
      },
      ...practiceFaq("Data interpretation", "Read labels and units first, approximate rather than dividing exactly, and practise one chart type at a time."),
    ],
    related: ["quantitative-aptitude", "logical-reasoning", "verbal-reasoning"],
  },
  {
    slug: "verbal-ability",
    name: "Verbal ability",
    blurb: "Grammar, vocabulary, synonyms, antonyms and sentence correction.",
    title: "Verbal Ability Practice for Placements | quiz1v1",
    description:
      "Practise verbal ability for placements and exams: synonyms, antonyms, error spotting, sentence correction and reading comprehension. Free on quiz1v1.",
    heading: "Verbal ability practice",
    intro: [
      "Verbal ability covers the English-language questions in placement and competitive exams: vocabulary, grammar, sentence correction and reading comprehension.",
      "It is the section where steady daily practice beats last-minute cramming, and where a quick duel is an easy way to keep the habit going.",
    ],
    covers: [
      "Synonyms and antonyms",
      "Spotting errors",
      "Sentence correction",
      "Fill in the blanks",
      "Reading comprehension",
      "Ordering of sentences",
      "Idioms and phrases",
      "Vocabulary",
    ],
    tips: [
      { title: "Learn the common grammar traps", body: "Subject-verb agreement, tenses and prepositions account for a large share of error-spotting questions." },
      { title: "Read the questions before the passage", body: "For reading comprehension, knowing what you are looking for makes the first read far more efficient." },
      { title: "Build vocabulary a little every day", body: "Ten new words a day, revisited a week later, beats a long list crammed the night before." },
      { title: "Use elimination", body: "Even when you are unsure of the right choice, you can often rule out two options that clearly break the sentence." },
    ],
    faq: [
      {
        q: "What does verbal ability include?",
        a: "Typically synonyms and antonyms, spotting errors, sentence correction, fill in the blanks, reading comprehension, ordering of sentences and idioms.",
      },
      ...practiceFaq("Verbal ability", "Learn the common grammar traps, read a little every day and use elimination when you are unsure."),
    ],
    related: ["verbal-reasoning", "logical-reasoning", "quantitative-aptitude"],
  },
  {
    slug: "logical-reasoning",
    name: "Logical reasoning",
    blurb: "Series, arrangements, syllogisms and puzzles that reward a clear head.",
    title: "Logical Reasoning Practice Online | quiz1v1",
    description:
      "Practise logical reasoning: series, coding-decoding, blood relations, seating arrangements, syllogisms and puzzles. Timed practice and 1v1 duels on quiz1v1.",
    heading: "Logical reasoning practice",
    intro: [
      "Logical reasoning questions test how quickly you can spot a pattern or work through a set of conditions. They feature in campus placement papers, banking exams and SSC-style tests.",
      "Most of them are solvable with a method rather than a flash of insight, so practising the methods pays off quickly.",
    ],
    covers: [
      "Number and letter series",
      "Coding and decoding",
      "Blood relations",
      "Direction sense",
      "Seating arrangements",
      "Syllogisms",
      "Puzzles",
      "Ranking and ordering",
    ],
    tips: [
      { title: "Draw it out", body: "A quick diagram or table for blood relations, directions and arrangements turns a confusing paragraph into a checklist." },
      { title: "Learn the syllogism rules", body: "A small set of Venn-diagram patterns covers almost every syllogism question." },
      { title: "Time-box the puzzles", body: "If a puzzle set is not opening up after a couple of minutes, move on and return with fresh eyes." },
      { title: "Check every condition", body: "Before you commit to an answer, run it against every stated condition. One missed condition is the usual reason for a wrong answer." },
    ],
    faq: [
      {
        q: "What topics come under logical reasoning?",
        a: "Number and letter series, coding-decoding, blood relations, direction sense, seating arrangements, syllogisms, puzzles and ranking questions.",
      },
      ...practiceFaq("Logical reasoning", "Draw diagrams, learn the standard methods and time-box the puzzles."),
    ],
    related: ["verbal-reasoning", "non-verbal-reasoning", "data-interpretation"],
  },
  {
    slug: "verbal-reasoning",
    name: "Verbal reasoning",
    blurb: "Analogies, classification and statement-based reasoning in words.",
    title: "Verbal Reasoning Practice Online | quiz1v1",
    description:
      "Practise verbal reasoning: analogies, classification, statements and conclusions, assumptions, cause and effect. Timed practice and 1v1 duels on quiz1v1.",
    heading: "Verbal reasoning practice",
    intro: [
      "Verbal reasoning asks you to reason with words: which pair fits an analogy, which statement follows from another, which option does not belong. It appears in banking, SSC and many placement papers.",
      "The wording matters more than any formula, so the best preparation is reading each statement carefully and practising against the clock.",
    ],
    covers: [
      "Analogies",
      "Classification (odd one out)",
      "Statements and conclusions",
      "Statements and assumptions",
      "Cause and effect",
      "Logical deduction",
    ],
    tips: [
      { title: "Use only what the statement says", body: "In conclusion and assumption questions, ignore what you know from outside and stick to the given statements." },
      { title: "Name the relationship in an analogy", body: "Say the link out loud, for example \"tool and its purpose\", then find the option with the same link." },
      { title: "Watch for absolute words", body: "Words such as all, never and only make a conclusion much harder to justify than it looks." },
      { title: "Practise under a timer", body: "These questions are short. Speed comes from recognising the question type in the first few seconds." },
    ],
    faq: [
      {
        q: "What is verbal reasoning?",
        a: "It is reasoning with language: analogies, classification, statements and conclusions, assumptions, cause and effect and logical deduction.",
      },
      ...practiceFaq("Verbal reasoning", "Stick to the given statements, name the relationship in each analogy and practise under a timer."),
    ],
    related: ["logical-reasoning", "verbal-ability", "non-verbal-reasoning"],
  },
  {
    slug: "non-verbal-reasoning",
    name: "Non-verbal reasoning",
    blurb: "Figure series, patterns and analogies with no words to lean on.",
    title: "Non-Verbal Reasoning Practice Online | quiz1v1",
    description:
      "Practise non-verbal reasoning: figure series, odd figure out, mirror and water images, paper folding and cubes. Timed practice and 1v1 duels on quiz1v1.",
    heading: "Non-verbal reasoning practice",
    intro: [
      "Non-verbal reasoning uses shapes and figures instead of words. You find the rule that turns one figure into the next, or the figure that does not belong. It appears in many competitive exams and some placement tests.",
      "Because there is nothing to read, it is a pure pattern-spotting skill, and one that improves quickly with repetition.",
    ],
    covers: [
      "Figure series",
      "Odd figure out",
      "Figure analogies",
      "Mirror and water images",
      "Paper folding and cutting",
      "Embedded figures",
      "Cubes and dice",
      "Counting figures",
    ],
    tips: [
      { title: "Find the rule first", body: "Most series change by rotation, reflection, addition or removal of a part, or shading. Name which one before you look at the options." },
      { title: "Check one feature at a time", body: "Compare position, then size, then shading. Changing one thing per step is the usual design." },
      { title: "Eliminate on a single mismatch", body: "One clear difference from the pattern is enough to cross an option out." },
      { title: "Sketch the tricky ones", body: "For paper folding and cubes, a quick rough sketch is faster and safer than doing it in your head." },
    ],
    faq: [
      {
        q: "What is non-verbal reasoning?",
        a: "It is reasoning with shapes and figures rather than words, such as figure series, odd figure out, analogies, mirror and water images and paper folding.",
      },
      ...practiceFaq("Non-verbal reasoning", "Name the rule before you look at the options, check one feature at a time and sketch the tricky ones."),
    ],
    related: ["logical-reasoning", "verbal-reasoning", "quantitative-aptitude"],
  },
];

export const findTopic = (slug: string) => TOPICS.find((t) => t.slug === slug);
