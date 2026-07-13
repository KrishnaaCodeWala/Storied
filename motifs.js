/* ============================================================
   STORIED — motif library
   ------------------------------------------------------------
   When a player answers correctly, abstract objects tied to the
   work drift up the sides of the screen.

   THREE THINGS LIVE HERE — all plain data, all editable:

   1. MOTIFS          the shape library. Each entry is SVG inner
                      markup drawn in a 100x100 viewBox, stroke-
                      based line art (stroke/fill come from CSS,
                      so shapes auto-tint to the category color).
                      Add your own art: any <path>/<circle>/etc.

   2. MOTIF_MAP       canonical answer title -> array of motif ids.
                      Works without an entry fall back to their
                      category's motifs.

   3. CATEGORY_MOTIFS category key -> default motif ids.

   A quote entry in quotes.js can also carry its own
   `motifs: ["ring", "mountain"]` to override everything.
   ============================================================ */

const MOTIFS = {
  /* --- generic / category --- */
  book:      '<path d="M50 28 C40 20 26 19 15 24 V76 C26 71 40 72 50 80 C60 72 74 71 85 76 V24 C74 19 60 20 50 28 Z"/><path d="M50 28 V80"/>',
  quill:     '<path d="M78 18 C52 26 34 48 27 74 L22 82"/><path d="M78 18 C70 44 54 62 32 70"/><path d="M42 50 L60 32"/>',
  reel:      '<circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="6"/><circle cx="50" cy="30" r="6"/><circle cx="50" cy="70" r="6"/><circle cx="30" cy="50" r="6"/><circle cx="70" cy="50" r="6"/>',
  clapper:   '<rect x="18" y="42" width="64" height="32" rx="4"/><path d="M18 42 L26 26 L82 34 L74 42 Z"/><path d="M36 28 L44 41 M52 30 L60 42 M68 32 L75 42"/>',
  gamepad:   '<rect x="14" y="34" width="72" height="32" rx="16"/><path d="M32 42 V58 M24 50 H40"/><circle cx="64" cy="45" r="3"/><circle cx="74" cy="55" r="3"/>',
  pixelheart:'<path d="M30 26 H42 V34 H58 V26 H70 V38 H78 V52 H70 V62 H60 V72 H40 V62 H30 V52 H22 V38 H30 Z"/>',
  tvset:     '<rect x="16" y="32" width="68" height="44" rx="8"/><path d="M38 32 L50 16 M62 32 L52 16"/><path d="M28 44 q10 -6 20 0"/>',
  speech:    '<path d="M20 24 H80 V62 H44 L28 78 V62 H20 Z"/><path d="M34 42 h4 M48 42 h4 M62 42 h4"/>',
  star:      '<path d="M50 16 L59 38 L83 40 L65 55 L71 79 L50 66 L29 79 L35 55 L17 40 L41 38 Z"/>',

  /* --- objects --- */
  sword:     '<path d="M64 14 L32 60"/><path d="M24 52 L40 68"/><path d="M30 66 L16 80"/>',
  shield:    '<path d="M50 14 C62 20 74 22 82 22 V50 C82 66 68 78 50 86 C32 78 18 66 18 50 V22 C26 22 38 20 50 14 Z"/><path d="M50 26 V74"/>',
  ring:      '<circle cx="50" cy="52" r="28"/><circle cx="50" cy="52" r="20"/>',
  mountain:  '<path d="M14 76 L40 30 L54 54 L64 38 L86 76 Z"/><path d="M34 42 L40 48 L46 40"/>',
  bolt:      '<path d="M56 12 L30 54 H46 L40 88 L70 42 H52 Z"/>',
  potion:    '<path d="M42 14 H58 M46 14 V30 L28 62 A24 22 0 0 0 72 62 L54 30 V14"/><path d="M36 58 H64"/>',
  snowflake: '<path d="M50 14 V86 M19 32 L81 68 M81 32 L19 68"/><path d="M42 22 L50 30 L58 22 M42 78 L50 70 L58 78"/>',
  crown:     '<path d="M18 68 L14 32 L34 48 L50 24 L66 48 L86 32 L82 68 Z"/>',
  eye:       '<path d="M12 50 C28 30 72 30 88 50 C72 70 28 70 12 50 Z"/><circle cx="50" cy="50" r="10"/>',
  whale:     '<path d="M14 54 C24 38 56 32 72 44 C74 38 80 34 86 34 C84 40 84 48 86 54 C80 54 74 50 72 46 C70 62 40 70 14 54 Z"/><circle cx="30" cy="50" r="2"/><path d="M40 30 c-1 -7 3 -10 7 -12 M46 30 c1 -6 5 -9 9 -9"/>',
  fedora:    '<ellipse cx="50" cy="64" rx="34" ry="10"/><path d="M32 62 C32 40 38 26 50 26 C62 26 68 40 68 62"/><path d="M32 52 H68"/>',
  rocket:    '<path d="M50 12 C62 24 66 44 60 66 H40 C34 44 38 24 50 12 Z"/><circle cx="50" cy="40" r="7"/><path d="M40 66 L32 82 M60 66 L68 82 M50 68 V84"/>',
  moon:      '<path d="M62 16 A36 36 0 1 0 84 62 A28 28 0 1 1 62 16 Z"/>',
  sharkfin:  '<path d="M22 70 C38 64 50 46 56 24 C70 38 76 58 74 70 Z"/><path d="M10 80 q10 -6 20 0 t20 0 t20 0 t20 0"/>',
  portal:    '<ellipse cx="32" cy="50" rx="12" ry="26"/><ellipse cx="68" cy="50" rx="12" ry="26"/>',
  cake:      '<path d="M26 52 H74 V78 H26 Z"/><path d="M26 60 q8 8 16 0 t16 0 t16 0"/><path d="M50 40 V52"/><path d="M50 28 q5 5 0 10 q-5 -5 0 -10"/>',
  trefoil:   '<circle cx="50" cy="52" r="6"/><path d="M38 32 a24 24 0 0 1 24 0"/><path d="M24 62 a24 24 0 0 0 14 -20"/><path d="M76 62 a24 24 0 0 1 -14 -20"/>',
  mushroom:  '<path d="M20 52 C20 30 34 18 50 18 C66 18 80 30 80 52 Z"/><path d="M38 52 V66 A12 10 0 0 0 62 66 V52"/><circle cx="36" cy="36" r="4"/><circle cx="58" cy="30" r="5"/>',
  lighthouse:'<path d="M40 36 L36 82 H64 L60 36 Z"/><rect x="42" y="24" width="16" height="12"/><path d="M32 18 L42 26 M68 18 L58 26"/><path d="M39 52 H61 M37 66 H63"/>',
  wrench:    '<path d="M64 18 A16 16 0 0 0 50 44 L26 68 A8 8 0 0 0 38 80 L62 56 A16 16 0 0 0 82 36 L70 48 L58 36 L70 24 Z"/>',
  sun:       '<circle cx="50" cy="50" r="16"/><path d="M50 18 V28 M50 72 V82 M18 50 H28 M72 50 H82 M27 27 L34 34 M66 66 L73 73 M73 27 L66 34 M34 66 L27 73"/>',
  flask:     '<path d="M42 14 H58 M46 14 V32 L26 70 A10 10 0 0 0 35 84 H65 A10 10 0 0 0 74 70 L54 32 V14"/><path d="M34 62 H66"/>',
  coffee:    '<path d="M24 38 H68 V58 A20 20 0 0 1 28 58 Z"/><path d="M68 42 H76 A8 8 0 0 1 76 58 H67"/><path d="M38 28 c-2 -5 2 -7 0 -12 M52 28 c-2 -5 2 -7 0 -12"/>',
  donut:     '<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="10"/><path d="M32 40 l6 3 M52 26 l2 6 M68 44 l-6 4 M62 66 l-4 -5 M38 64 l3 -6"/>',
  orbit:     '<circle cx="50" cy="50" r="14"/><ellipse cx="50" cy="50" rx="36" ry="13" transform="rotate(-24 50 50)"/><circle cx="76" cy="34" r="4"/>',
  clock:     '<circle cx="50" cy="50" r="32"/><path d="M50 32 V50 L64 58"/>',
  lights:    '<path d="M12 34 q20 20 38 10 t38 8"/><path d="M30 46 V54 M52 46 V54 M74 50 V58"/><circle cx="30" cy="59" r="4"/><circle cx="52" cy="59" r="4"/><circle cx="74" cy="63" r="4"/>',
  magnifier: '<circle cx="42" cy="42" r="22"/><path d="M58 58 L82 82"/>',
  ship:      '<path d="M18 62 H82 L72 80 H28 Z"/><path d="M50 62 V20"/><path d="M50 24 L74 40 L50 46 Z"/>',
  arrow:     '<path d="M18 82 L74 26"/><path d="M58 22 H78 V42"/><path d="M22 66 L34 78"/>',
  wheel:     '<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="6"/><path d="M50 20 V80 M20 50 H80 M29 29 L71 71 M71 29 L29 71"/>',
  crystal:   '<path d="M38 18 H62 L78 40 L50 84 L22 40 Z"/><path d="M22 40 H78 M38 18 L50 40 L62 18 M50 40 V84"/>',
  leaf:      '<path d="M76 22 C46 22 24 44 22 76 C54 76 76 54 76 22 Z"/><path d="M28 72 C42 56 56 42 72 26"/>',
  gavel:     '<path d="M44 16 L60 32 L48 44 L32 28 Z"/><path d="M38 22 L58 42 M48 44 L24 68"/><path d="M56 76 H82 M60 82 H78"/>',
  box:       '<path d="M18 38 L50 24 L82 38 L50 52 Z"/><path d="M18 38 V70 L50 84 L82 70 V38"/><path d="M50 52 V84"/>',
  bird:      '<path d="M20 58 C28 42 46 38 58 44 L70 34 L66 48 C70 60 58 72 42 70 L26 80 L34 66 C26 64 21 61 20 58 Z"/><path d="M58 44 L74 48 L62 52"/><circle cx="56" cy="42" r="2"/>',
  saber:     '<path d="M28 88 L38 78"/><path d="M40 76 L84 12" stroke-width="8"/><path d="M34 70 L44 80"/>',
  fish:      '<path d="M18 50 C30 34 52 32 66 44 L82 32 V68 L66 56 C52 68 30 66 18 50 Z"/><circle cx="34" cy="48" r="3"/>',
  plane:     '<path d="M14 46 L86 22 L58 80 L48 56 Z"/><path d="M48 56 L86 22"/>',
  flame:     '<path d="M50 14 C58 30 72 40 72 58 A22 22 0 0 1 28 58 C28 44 40 36 43 24 C46 32 52 32 50 14 Z"/><path d="M48 50 q7 7 3 18"/>',
  exclaim:   '<path d="M50 18 V58"/><circle cx="50" cy="76" r="4"/>',
  umbrella:  '<path d="M16 50 A34 34 0 0 1 84 50 Z"/><path d="M50 16 V12 M50 50 V76 A8 8 0 0 1 36 81"/><path d="M28 50 q11 -8 22 0 q11 -8 22 0"/>',
  waffle:    '<circle cx="50" cy="50" r="30"/><path d="M38 27 V73 M62 27 V73 M27 38 H73 M27 62 H73"/>',
  bike:      '<circle cx="28" cy="64" r="14"/><circle cx="72" cy="64" r="14"/><path d="M28 64 L42 40 H58 L72 64 M42 40 L52 64 H28"/><path d="M38 36 H48 M62 34 L58 40"/>',
  radio:     '<rect x="34" y="30" width="32" height="52" rx="6"/><path d="M42 30 V12"/><path d="M42 42 H58"/><circle cx="45" cy="58" r="3"/><circle cx="55" cy="58" r="3"/><path d="M42 70 H58"/>',
  chip:      '<rect x="30" y="30" width="40" height="40" rx="4"/><path d="M38 30 V18 M50 30 V18 M62 30 V18 M38 70 V82 M50 70 V82 M62 70 V82 M30 38 H18 M30 50 H18 M30 62 H18 M70 38 H82 M70 50 H82 M70 62 H82"/><circle cx="50" cy="50" r="6"/>',
  city:      '<path d="M14 78 V50 H28 V62 H38 V34 H52 V78 M52 54 H64 V42 H76 V78"/><path d="M12 78 H88"/><path d="M42 42 H46 M42 50 H46 M42 58 H46 M68 50 H72 M68 58 H72"/>',
  axe:       '<path d="M56 26 L34 84"/><path d="M52 22 C64 14 78 18 84 28 C74 30 66 38 62 48 C56 42 52 34 52 22 Z"/>',
  rune:      '<path d="M40 18 V82"/><path d="M40 22 L64 36 L40 50 L66 74"/>',
  saw:       '<path d="M22 40 H78 V52 L70 60 L62 52 L54 60 L46 52 L38 60 L30 52 L22 60 Z"/><path d="M66 40 V26 H80 V40"/>',
  lantern:   '<path d="M44 22 H56 M50 14 V22"/><path d="M38 30 H62 L66 64 H34 Z"/><path d="M50 38 q5 7 0 15 q-5 -8 0 -15"/><path d="M42 70 H58"/>',
  dball:     '<circle cx="50" cy="50" r="30"/><path d="M50 40 L53 46 L60 47 L55 52 L56 59 L50 55 L44 59 L45 52 L40 47 L47 46 Z"/><circle cx="37" cy="40" r="3"/><circle cx="63" cy="40" r="3"/><circle cx="50" cy="68" r="3"/>',
  cloud:     '<path d="M28 62 A11 11 0 0 1 30 41 A14 14 0 0 1 57 35 A12 12 0 0 1 74 46 A9 9 0 0 1 72 62 Z"/><path d="M28 72 H38 M46 72 H56 M64 72 H72"/>',
  badge:     '<circle cx="50" cy="50" r="32"/><path d="M50 28 L56 42 L71 43 L60 53 L64 68 L50 60 L36 68 L40 53 L29 43 L44 42 Z"/>',
  cuffs:     '<circle cx="30" cy="42" r="16"/><circle cx="70" cy="58" r="16"/><circle cx="30" cy="42" r="7"/><circle cx="70" cy="58" r="7"/><path d="M44 47 L56 53"/>',
  scroll:    '<path d="M34 22 H70 A8 8 0 0 1 78 30 V34 H66"/><path d="M66 26 V78 H30 A8 8 0 0 1 22 70 V66 H34"/><path d="M40 42 H58 M40 52 H58 M40 62 H54"/>',
  popcorn:   '<path d="M30 46 L36 82 H64 L70 46 Z"/><path d="M43 46 L46 82 M57 46 L54 82"/><circle cx="36" cy="36" r="8"/><circle cx="50" cy="28" r="9"/><circle cx="64" cy="36" r="8"/>',
  joystick:  '<path d="M26 70 H74 V82 H26 Z"/><path d="M50 70 V46"/><circle cx="50" cy="34" r="11"/><circle cx="64" cy="76" r="2"/><circle cx="36" cy="76" r="2"/>',
  remote:    '<rect x="36" y="14" width="28" height="70" rx="9"/><circle cx="50" cy="28" r="5"/><path d="M42 46 H58 M42 56 H58 M42 66 H58"/>',
  wand:      '<path d="M22 78 L66 34"/><path d="M74 14 V34 M64 24 H84"/><path d="M52 12 l3 3 M86 42 l3 3"/>',
  castle:    '<path d="M26 80 V38 H34 V30 H42 V38 H58 V30 H66 V38 H74 V80 Z"/><path d="M46 80 V60 H54 V80"/><path d="M36 50 h4 M60 50 h4"/>',
  key:       '<circle cx="32" cy="36" r="13"/><path d="M41 45 L78 82"/><path d="M62 66 L72 56 M70 74 L80 64"/>',
  compass:   '<circle cx="50" cy="50" r="30"/><path d="M62 38 L54 54 L38 62 L46 46 Z"/><path d="M50 20 V25 M50 75 V80 M20 50 H25 M75 50 H80"/>'
};

/* Canonical answer title -> motifs. Anything not listed falls back
   to its category set below. */
const MOTIF_MAP = {
  /* books */
  "Moby-Dick":                              ["whale", "ship", "compass"],
  "A Tale of Two Cities":                   ["crown", "quill", "scroll"],
  "1984":                                   ["eye", "tvset"],
  "The Lord of the Rings":                  ["ring", "mountain", "sword"],
  "The Hobbit":                             ["mountain", "ring", "key"],
  "Harry Potter and the Deathly Hallows":   ["bolt", "wand", "potion", "key"],
  "Harry Potter and the Sorcerer's Stone":  ["bolt", "wand", "potion", "key"],
  "Dune":                                   ["sun", "eye", "arrow"],
  "A Game of Thrones":                      ["snowflake", "sword", "crown", "castle"],
  "The Gunslinger":                         ["sun", "arrow", "compass"],
  "Sherlock Holmes":                        ["magnifier", "key", "scroll"],
  "To Kill a Mockingbird":                  ["bird", "book"],
  "The Great Gatsby":                       ["star", "fedora"],
  "Jane Eyre":                              ["bird", "book", "key"],
  "Wuthering Heights":                      ["mountain", "bird"],
  "Frankenstein":                           ["bolt", "flask", "castle"],

  /* movies */
  "Star Wars":                              ["saber", "star", "rocket"],
  "The Empire Strikes Back":                ["saber", "snowflake", "rocket"],
  "The Godfather":                          ["fedora", "crown"],
  "The Godfather Part II":                  ["fedora", "crown"],
  "Casablanca":                             ["plane", "fedora"],
  "The Terminator":                         ["bolt", "exclaim"],
  "Terminator 2: Judgment Day":             ["bolt", "flame"],
  "Toy Story":                              ["rocket", "star", "joystick"],
  "Apollo 13":                              ["rocket", "moon", "exclaim"],
  "A Few Good Men":                         ["gavel", "exclaim"],
  "The Sixth Sense":                        ["eye"],
  "Finding Nemo":                           ["fish", "compass"],
  "Back to the Future":                     ["clock", "bolt"],
  "Forrest Gump":                           ["quill", "box"],
  "The Lord of the Rings: The Fellowship of the Ring": ["ring", "mountain", "sword"],
  "The Wizard of Oz":                       ["castle", "star", "umbrella"],
  "Jaws":                                   ["sharkfin", "fish"],
  "Titanic":                                ["ship", "moon", "star"],

  /* games */
  "The Legend of Zelda":                    ["sword", "shield", "key"],
  "The Legend of Zelda: Ocarina of Time":   ["sword", "shield", "key"],
  "Portal":                                 ["portal", "cake"],
  "Fallout":                                ["trefoil", "bolt"],
  "BioShock":                               ["lighthouse", "wrench", "key"],
  "Dark Souls":                             ["sun", "sword", "flame"],
  "Star Fox 64":                            ["plane", "star"],
  "Mortal Kombat":                          ["flame", "exclaim"],
  "Super Mario Bros.":                      ["mushroom", "star", "castle"],
  "Super Mario 64":                         ["mushroom", "star", "castle"],
  "Diablo":                                 ["crystal", "flame"],
  "Assassin's Creed":                       ["bird", "compass", "castle"],
  "Half-Life 2":                            ["wrench", "exclaim"],
  "Metal Gear Solid":                       ["box", "exclaim"],
  "The Elder Scrolls V: Skyrim":            ["arrow", "mountain", "sword"],
  "The Oregon Trail":                       ["wheel", "compass"],
  "Ace Attorney":                           ["gavel", "exclaim", "scroll"],
  "Zero Wing":                              ["rocket", "exclaim"],
  "StarCraft":                              ["crystal", "rocket"],
  "The Last of Us":                         ["leaf", "compass"],

  /* tv */
  "Breaking Bad":                           ["flask", "trefoil"],
  "Friends":                                ["coffee", "umbrella"],
  "The Office":                             ["coffee", "speech"],
  "The Wire":                               ["crown"],
  "The Simpsons":                           ["donut", "tvset"],
  "The Mandalorian":                        ["orbit", "star"],
  "Star Trek":                              ["orbit", "rocket"],
  "Doctor Who":                             ["clock", "portal"],
  "Friday Night Lights":                    ["star", "lights"],
  "How I Met Your Mother":                  ["umbrella"],
  "Game of Thrones":                        ["snowflake", "sword", "crown", "castle"],
  "Stranger Things":                        ["lights", "portal"],
  "The Big Bang Theory":                    ["orbit", "speech"],
  "Brooklyn Nine-Nine":                     ["star", "coffee"],
  "Parks and Recreation":                   ["leaf"],
  "Sherlock":                               ["magnifier", "exclaim"]
};

/* Fallbacks for works without a bespoke entry. Add a key here when
   you add a new category in quotes.js. */
const CATEGORY_MOTIFS = {
  books:  ["book", "quill", "scroll"],
  movies: ["reel", "clapper", "popcorn"],
  games:  ["gamepad", "pixelheart", "joystick"],
  tv:     ["tvset", "speech", "remote"]
};
