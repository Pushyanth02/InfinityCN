/**
 * Lemniscate — Linguistic Lexicons
 * ----------------------------------------------------------------------------
 * Hand-curated, deterministic word lists used by the heuristics engines.
 * No corpora were statistically trained; every entry is a deliberate rule.
 *
 *   - AFINN-style valence lexicon (sentiment -5..+5)
 *   - Emotion categories (Plutchik-inspired)
 *   - Intensifiers, diminishers, negations
 *   - Violence / conflict lexicon
 *   - Location gazetteer signals (indoor/outdoor/urban/nature/vehicle)
 *   - Time-of-day signals
 *   - Narrative-arc signal words (inciting / rising / climax / falling / resolution)
 *   - Common English stop-words
 *   - Frequent given-name inventory (for character detection)
 */

// ---------------------------------------------------------------------------
// Valence lexicon (AFINN-inspired, curated & pruned)
// ---------------------------------------------------------------------------

export const VALENCE: Record<string, number> = {
  // positive
  love: 3, loved: 3, loving: 3, lovely: 3,
  joy: 3, joyful: 3, joyous: 3, joyfully: 3,
  happy: 3, happier: 3, happiest: 3, happily: 3, happiness: 3,
  glad: 3, gladly: 2,
  delight: 3, delighted: 3, delightful: 3, delightfully: 3,
  pleasure: 3, pleasant: 2, pleasantly: 2,
  hope: 2, hopeful: 2, hopefully: 2, hopefulness: 2,
  peace: 2, peaceful: 2, peacefully: 2,
  calm: 1, calmly: 1,
  smile: 2, smiled: 2, smiles: 2, smiling: 2,
  laugh: 2, laughed: 2, laughter: 2, laughing: 2,
  win: 4, won: 4, winning: 3, winner: 3,
  good: 3, great: 3, wonderful: 4, excellent: 4, amazing: 4, marvelous: 4, fantastic: 4,
  beautiful: 3, gorgeous: 3, stunning: 3, brilliant: 3,
  brave: 2, bravery: 2, courageous: 3, courage: 3,
  kind: 2, kindly: 2, kindness: 2, gentle: 2, gently: 2,
  friend: 2, friendly: 2, friendship: 2, friends: 2,
  free: 2, freedom: 2, freely: 2,
  safe: 2, safely: 2, safety: 2,
  alive: 2, life: 1, live: 1, living: 1,
  thank: 2, thanks: 2, grateful: 3, gratitude: 3,
  blessed: 3, blessing: 2, bless: 2,
  triumph: 3, triumphant: 3, triumphantly: 3,
  glory: 2, glorious: 3,
  warm: 2, warmth: 2, tender: 2, tenderness: 2,
  sweet: 2, sweetness: 2,
  shine: 2, shining: 2, shone: 2, bright: 2, brightness: 2,
  treasure: 3, precious: 3,
  // negative
  hate: -3, hated: -3, hatred: -3, hating: -3,
  anger: -3, angry: -3, angrily: -3, rage: -4, furious: -4, fury: -4,
  sad: -2, sadness: -2, sadly: -2, sorrow: -3, sorrowful: -3, sorrowfully: -3,
  grief: -3, grieve: -3, grieving: -3, grievous: -3,
  cry: -2, cried: -2, crying: -2, tears: -2, weep: -2, wept: -2, weeping: -2,
  fear: -3, fearful: -3, fearfully: -3, afraid: -3, terrified: -4, terror: -4,
  horror: -4, horrible: -3, horrific: -4, horrified: -4,
  panic: -3, panicked: -3, panicking: -3,
  danger: -3, dangerous: -3, dangerously: -3,
  threat: -3, threaten: -3, threatening: -3, threatened: -3,
  pain: -3, painful: -3, painfully: -3, ache: -2, aching: -2,
  hurt: -3, hurts: -3, hurting: -3, wounded: -3, wound: -3,
  suffer: -3, suffering: -3, suffered: -3,
  die: -4, died: -4, death: -4, dying: -4, dead: -4, deadly: -4,
  kill: -4, killed: -4, killing: -4, killer: -4,
  murder: -4, murdered: -4, murderer: -4, murderous: -4,
  blood: -2, bloody: -3, bleeding: -3,
  fight: -2, fought: -2, fighting: -2, fighter: -1,
  war: -3, wars: -3, battlefield: -3,
  attack: -3, attacked: -3, attacks: -3, attacker: -3,
  destroy: -3, destroyed: -3, destruction: -3, destructive: -3,
  ruin: -3, ruined: -3, ruinous: -3,
  loss: -3, lost: -2, losing: -2, lose: -2,
  fail: -3, failed: -3, failure: -3, failing: -3,
  lie: -2, lied: -2, lies: -2, liar: -3, lying: -2,
  betray: -4, betrayed: -4, betrayal: -4, betrayer: -4,
  cheat: -3, cheated: -3, cheating: -3,
  steal: -3, stole: -3, stolen: -3, theft: -3, thief: -3,
  prison: -2, prisoner: -2, imprisoned: -3, captive: -2, captured: -2,
  dark: -1, darkness: -2, darkly: -1,
  cold: -1, coldly: -1, chill: -1, chilly: -1,
  lonely: -2, loneliness: -2, alone: -1, deserted: -2, empty: -1, emptiness: -2,
  hopeless: -3, despair: -4, despairing: -3, desperate: -3, desperation: -3,
  evil: -4, wicked: -3, cruel: -3, cruelty: -3, cruelly: -3, vicious: -3,
  monster: -3, monstrous: -3,
  nightmare: -3, nightmareish: -3,
  scream: -2, screamed: -2, screaming: -2, screams: -2,
  shatter: -2, shattered: -2, shattering: -2,
  tremble: -2, trembled: -2, trembling: -2, tremor: -2,
  poison: -3, poisoned: -3, poisonous: -3,
  sin: -2, sinner: -2, sinful: -2,
  guilt: -2, guilty: -2, guiltily: -2,
  shame: -3, ashamed: -3, shameful: -3,
  regret: -2, regretted: -2, regretful: -2,
  refuse: -2, refused: -2, refusal: -2,
  abandon: -3, abandoned: -3, abandonment: -3,
  reject: -2, rejected: -2, rejection: -2,
  enemy: -2, enemies: -2, hostile: -3, hostility: -3,
  trouble: -2, troubled: -2, troubling: -2,
  worry: -2, worried: -2, worrying: -2,
  anxious: -2, anxiety: -3, anxiously: -2,
  broken: -2, break: -1, broke: -2, breaking: -1,
}

// ---------------------------------------------------------------------------
// Emotion categories (Plutchik-inspired, deterministic mapping)
// ---------------------------------------------------------------------------

export type Emotion = 'JOY' | 'ANGER' | 'FEAR' | 'SADNESS' | 'SURPRISE' | 'DISGUST' | 'LOVE' | 'NEUTRAL'

export const EMOTION_WORDS: Record<Emotion, Set<string>> = {
  JOY: new Set(['joy','joyful','joyous','happy','happier','happiest','happiness','glad','delight','delighted','delightful','pleasure','pleasant','cheerful','cheer','cheerfully','glee','gleeful','ecstatic','elated','elation','jubilant','jubilation','thrilled','thrill','content','contentment','bliss','blissful','merry','merriment','rejoice','rejoicing','exuberant','exuberance','radiant','beaming','grin','grinned','grinning','laugh','laughed','laughing','laughter','chuckle','giggle','smile','smiled','smiles','smiling']),
  ANGER: new Set(['anger','angry','angrily','rage','raging','enraged','furious','fury','wrath','wrathful','indignant','indignation','irritated','irritating','irritation','annoyed','annoying','annoyance','frustrated','frustrating','frustration','livid','mad','seething','fuming','incensed','outraged','outrage','resentment','resentful','bitter','bitterly','hostile','hostility','vengeful','vengeance','revenge','vengeful']),
  FEAR: new Set(['fear','fearful','fearfully','afraid','terrified','terror','terrorized','horror','horrified','horrifying','panic','panicked','panicking','panicky','dread','dreaded','dreadful','dreading','alarm','alarmed','alarming','fright','frightened','frightening','scared','scary','scare','scares','anxious','anxiety','anxiously','nervous','nervously','nervousness','tremble','trembled','trembling','tremor','shiver','shivered','shivering','shudder','shuddered','shuddering','quail','quailed','quailing','cower','cowered','cowering','wary','warily','apprehensive','apprehension']),
  SADNESS: new Set(['sad','sadness','sadly','sorrow','sorrowful','sorrowfully','grief','grieve','grieving','grievous','mourn','mourned','mourning','mournful','melancholy','melancholic','dejected','dejection','despondent','despondency','forlorn','woe','woeful','despair','despairing','desperate','desperation','hopeless','hopelessness','depressed','depression','depressing','unhappy','unhappiness','misery','miserable','miserably','anguish','anguished','heartbroken','heartbreak','heartbreaking','gutted','devastated','devastating','crushed','crushing','gloom','gloomy','gloomily','dismal','dismally','tearful','tearfully','cry','cried','crying','weep','wept','weeping','sob','sobbed','sobbing','wail','wailed','wailing']),
  SURPRISE: new Set(['surprise','surprised','surprising','surprisingly','astonished','astonishing','astonishment','amazed','amazing','amazingly','astounded','astounding','astoundingly','shocked','shocking','shock','shocks','stunned','stunning','dumbfounded','flabbergasted','startled','startling','unexpected','unexpectedly','sudden','suddenly','abrupt','abruptly','incredible','incredibly','unbelievable','unbelievably','remarkable','remarkably','extraordinary','wow','whoa','gasp','gasped','gasping','whirl','whirled','whirling','jolt','jolted','jolting']),
  DISGUST: new Set(['disgust','disgusted','disgusting','disgustingly','repulsed','repulsive','repulsively','revulsion','revolting','revoltingly','nausea','nauseated','nauseating','nauseatingly','sickened','sickening','sickeningly','revolting','gross','grossly','foul','foully','putrid','putrefied','rancid','vile','vilely','loathing','loathe','loathed','loathsome','detest','detested','detestable','abhor','abhorred','abhorrent','distaste','distasteful','cringe','cringed','cringing','squelch','squelched','grimace','grimaced','grimacing']),
  LOVE: new Set(['love','loved','loving','lovingly','lovely','lover','lovers','affection','affectionate','affectionately','adore','adored','adoring','adoringly','adoration','cherish','cherished','cherishing','devotion','devoted','devotedly','tender','tenderly','tenderness','romance','romantic','romantically','passion','passionate','passionately','desire','desired','desiring','desirous','longing','yearn','yearned','yearning','crave','craved','craving','embrace','embraced','embracing','kiss','kissed','kissing','caress','caressed','caressing','cuddle','cuddled','cuddling','beloved','darling','sweetheart','dear','adore','enamored','infatuated','smitten']),
  NEUTRAL: new Set([]),
}

// ---------------------------------------------------------------------------
// Intensifiers / diminishers / negations
// ---------------------------------------------------------------------------

export const INTENSIFIERS = new Set([
  'very','extremely','incredibly','remarkably','exceptionally','particularly',
  'especially','unusually','exceedingly','extraordinarily','immensely','profoundly',
  'deeply','intensely','strongly','fiercely','wildly','desperately','terribly',
  'awfully','horribly','dreadfully','absolutely','utterly','totally','completely',
  'entirely','fully','wholly','thoroughly','perfectly','quite','so','too',
])

export const DIMINISHERS = new Set([
  'slightly','somewhat','rather','fairly','moderately','reasonably','relatively',
  'mildly','barely','scarcely','hardly','almost','nearly','partially','partly',
])

export const NEGATIONS = new Set([
  'not','no','never','none','nobody','nothing','neither','nor','cannot',"can't",
  "don't","doesn't","didn't","won't","wouldn't","shouldn't","couldn't","isn't",
  "aren't","wasn't","weren't","hasn't","haven't","hadn't",'without','rarely','seldom',
])

// ---------------------------------------------------------------------------
// Violence / conflict lexicon (for tension scoring)
// ---------------------------------------------------------------------------

export const VIOLENCE_LEXICON = new Set([
  'kill','killed','killing','slay','slain','slays','murder','murdered','murderer',
  'stab','stabbed','stabbing','shoot','shot','shooting','strangle','strangled',
  'choke','choked','choking','punch','punched','punching','kick','kicked','kicking',
  'slap','slapped','slapping','beat','beaten','beating','strike','struck','striking',
  'slash','slashed','slashing','wound','wounded','wounding','bleed','bleeding','bled',
  'blood','bloody','bloodshed','carnage','slaughter','slaughtered','massacre','massacred',
  'war','battle','battled','battles','fight','fought','fighting','combat','assault',
  'attacked','attack','attacks','raid','raided','ambush','ambushed','siege',
  'execute','executed','execution','torture','tortured','torturing','cruel','cruelty',
  'weapon','sword','knife','dagger','gun','rifle','pistol','arrow','spear','blade',
  'explosion','explode','exploded','blast','bomb','bombed','fire','fired','firing',
])

export const CONFLICT_LEXICON = new Set([
  'argue','argued','arguing','argument','quarrel','quarreled','quarreling',
  'dispute','disputed','disputing','disagreed','disagree','disagreement',
  'confront','confronted','confronting','confrontation','clash','clashed','clashing',
  'oppose','opposed','opposing','opposition','resist','resisted','resistance',
  'rebel','rebelled','rebellion','revolt','revolted','defy','defied','defying',
  'challenge','challenged','challenging','defend','defended','defending',
  'accuse','accused','accusing','accusation','blame','blamed','blaming',
  'threaten','threatened','threatening','threat','ultimatum','demand','demanded',
  'forbid','forbade','forbidden','forbid','prohibit','prohibited','ban','banned',
])

// ---------------------------------------------------------------------------
// Location gazetteer signals
// ---------------------------------------------------------------------------

export const LOCATION_INDOOR = new Set([
  'room','hall','hallway','corridor','kitchen','bedroom','chamber','cellar','attic',
  'basement','library','study','parlor','dining','sitting','ballroom','throne',
  'office','shop','store','tavern','inn','pub','cafe','restaurant','church','cathedral',
  'chapel','temple','shrine','cave','cavern','cell','dungeon','prison','jail','tower',
  'staircase','stairs','lobby','foyer','gallery','museum','school','classroom','hospital',
  'barracks','fortress','castle','palace','mansion','house','cottage','cabin','tent',
])

export const LOCATION_OUTDOOR = new Set([
  'garden','yard','courtyard','field','meadow','pasture','plain','valley','hill',
  'mountain','mountainside','cliff','ridge','peak','summit','forest','woods','grove',
  'orchard','jungle','desert','dune','oasis','beach','shore','coast','canyon',
  'gorge','ravine','river','stream','creek','pond','lake','sea','ocean','bay','cove',
  'island','marsh','swamp','bog','glacier','tundra','prairie','moor','heath','glade',
])

export const LOCATION_URBAN = new Set([
  'street','avenue','road','boulevard','alley','plaza','square','market','marketplace',
  'bridge','station','port','harbor','dock','wharf','warehouse','factory','mill','guild',
  'university','academy','bank','courthouse','gates','walls','ramparts','outskirts',
  'suburb','district','quarter','slum','ghetto','crossroads','intersection','park',
])

export const LOCATION_NATURE = new Set([
  'tree','oak','pine','birch','willow','elm','maple','flower','rose','lily','vine',
  'moss','fern','bush','shrub','rock','stone','boulder','pebble','sand','dirt','soil',
  'mud','clay','grass','reed','thistle','weed','stream','brook','spring','waterfall',
  'cliff','crag','ledge','crevice','grotto','den','lair','nest','hive','burrow',
])

export const LOCATION_VEHICLE = new Set([
  'ship','boat','vessel','galleon','frigate','skiff','rowboat','canoe','raft','ferry',
  'carriage','cart','wagon','coach','chariot','train','car','automobile','truck','bus',
  'airplane','plane','jet','helicopter','rocket','horse','horseback',
])

export const TIME_OF_DAY_SIGNALS: Record<string, string[]> = {
  DAWN: ['dawn','daybreak','sunrise','first light','crack of dawn','morning light'],
  MORNING: ['morning','mid-morning','breakfast','early'],
  DAY: ['noon','midday','afternoon','daylight','daytime','high noon'],
  AFTERNOON: ['afternoon','late afternoon','tea time','sundown approaching'],
  DUSK: ['dusk','twilight','gloaming','sunset','evening','sundown'],
  NIGHT: ['night','midnight','nighttime','dead of night','wee hours','darkness','moonlight','starlight'],
}

// ---------------------------------------------------------------------------
// Narrative-arc signal words (used for arc classification)
// ---------------------------------------------------------------------------

export const ARC_INCITING_SIGNALS = new Set([
  'suddenly','unexpected','began','arrived','discovered','found','received','news',
  'letter','message','summons','strange','peculiar','unusual','mysterious','odd',
  'change','changed','invitation','warning','omen','prophecy','destiny','fate',
])

export const ARC_RISING_SIGNALS = new Set([
  'struggled','fought','pursued','chased','escaped','fled','searched','sought',
  'climbed','descended','journeyed','traveled','approached','advanced','retreated',
  'increasingly','growing','deeper','further','closer','tension','pressure',
])

export const ARC_CLIMAX_SIGNALS = new Set([
  'finally','at last','climaxed','peak','confrontation','showdown','battle','war',
  'exploded','erupted','burst','shattered','crashed','decisive','moment of truth',
  'no turning back','last stand','ultimate','final','defining',
])

export const ARC_FALLING_SIGNALS = new Set([
  'after','afterward','afterwards','following','consequence','aftermath','wounds',
  'recovering','recuperating','reflecting','contemplating','realized','understood',
  'learned','discovered the truth','survived','remained',
])

export const ARC_RESOLUTION_SIGNALS = new Set([
  'resolved','peace','restored','returned','home','reunited','reconciled','forgave',
  'forgiveness','ended','concluded','final','at last','happily','forever','peaceful',
  'settled','calm','quiet','still','silence','dawn','new beginning','hope',
])

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

export const STOP_WORDS = new Set([
  'the','a','an','and','or','but','if','then','else','when','at','by','for','with',
  'about','against','between','into','through','during','before','after','above',
  'below','to','from','up','down','in','out','on','off','over','under','again',
  'further','once','here','there','all','any','both','each','few','more','most',
  'other','some','such','no','nor','not','only','own','same','so','than','too',
  'very','can','will','just','should','now','is','am','are','was','were','be','been',
  'being','have','has','had','having','do','does','did','doing','this','that','these',
  'those','i','me','my','myself','we','our','ours','ourselves','you','your','yours',
  'he','him','his','she','her','hers','it','its','they','them','their','theirs',
  'what','which','who','whom','whose','where','why','how','as','of','while','because',
])

// ---------------------------------------------------------------------------
// Frequent English given-name inventory (capitalized candidate characters)
// ---------------------------------------------------------------------------

export const COMMON_GIVEN_NAMES = new Set([
  // traditional / literary
  'John','James','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
  'Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua',
  'Kenneth','Kevin','Brian','George','Edward','Ronald','Timothy','Jason','Jeffrey','Ryan',
  'Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon',
  'Benjamin','Samuel','Frank','Gregory','Raymond','Alexander','Patrick','Jack','Dennis','Jerry',
  'Mary','Patricia','Jennifer','Linda','Elizabeth','Barbara','Susan','Jessica','Sarah','Karen',
  'Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Kimberly','Emily','Donna','Michelle',
  'Carol','Amanda','Dorothy','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia',
  'Amy','Kathleen','Angela','Shirley','Brenda','Emma','Anna','Pamela','Nicole','Samantha',
  'Katherine','Christine','Helen','Debra','Rachel','Carolyn','Janet','Maria','Catherine','Heather',
  // fantasy / literary
  'Aragon','Arwen','Boromir','Frodo','Gandalf','Gimli','Gollum','Legolas','Samwise','Sauron',
  'Bilbo','Elrond','Galadriel','Merry','Pippin','Eowyn','Faramir','Theoden','Treebeard','Saruman',
  'Eddard','Catelyn','Robb','Sansa','Arya','Bran','Rickon','Daenerys','Jon','Tyrion',
  'Cersei','Jaime','Joffrey','Robert','Stannis','Renly','Varys','Petyr','Drogo','Viserys',
  'Harry','Hermione','Ronald','Albus','Severus','Rubeus','Draco','Voldemort','Sirius','Remus',
  'Ginevra','Neville','Luna','Minerva','Hagrid','Dumbledore','Riddle','James','Lily','Petunia',
])

// Attribution verbs (who-said-what) — used to find speaker names
export const ATTRIBUTION_VERBS = new Set([
  'said','says','asked','replied','whispered','shouted','cried','murmured','growled',
  'snapped','added','continued','remarked','exclaimed','answered','called','spoke',
  'uttered','declared','announced','proclaimed','stated','muttered','mumbled','bellowed',
  'roared','hissed','sneered','jeered','gasp','gasped','sighed','chuckled','laughed',
  'giggled','sobbed','wept','wailed','howled','sang','chanted','prayed','vowed','promised',
])

// Common English surnames (used to strip non-character capitalized tokens)
export const COMMON_SURNAMES_HINTS = new Set([
  'Smith','Jones','Taylor','Brown','Williams','Wilson','Johnson','Davies','Robinson',
  'Wright','Thompson','Evans','Walker','White','Roberts','Green','Hall','Wood','Jackson',
  'Clarke','Patel','Khan','Lewis','Lee','Edwards','Murphy','Owen','Ward','Turner',
])

// Titles that introduce character names
export const HONORIFICS = new Set([
  'Mr','Mrs','Ms','Dr','Prof','Sir','Lady','Lord','Captain','Lieutenant','Colonel',
  'General','Major','Sergeant','King','Queen','Prince','Princess','Duke','Duchess',
  'Earl','Count','Countess','Baron','Baroness','Emperor','Empress','Reverend','Father',
  'Mother','Sister','Brother','Master','Mistress','Saint','St','President','Minister',
  'Sheriff','Inspector','Detective','Commander','Admiral','Chancellor','Ambassador',
])

// ---------------------------------------------------------------------------
// Character-detection support lexicons (Character Detection Engine v2)
// ---------------------------------------------------------------------------

/**
 * Honorific → inferred gender. Used for heuristic pronoun resolution and
 * character-gender labelling. Gender-neutral honorifics (Dr, Prof, Captain…)
 * are intentionally omitted so they resolve to UNKNOWN.
 */
export const HONORIFIC_GENDER: Record<string, 'MALE' | 'FEMALE'> = {
  Mr: 'MALE', Sir: 'MALE', Lord: 'MALE', King: 'MALE', Prince: 'MALE',
  Duke: 'MALE', Earl: 'MALE', Count: 'MALE', Baron: 'MALE', Emperor: 'MALE',
  Father: 'MALE', Brother: 'MALE', Master: 'MALE',
  Mrs: 'FEMALE', Ms: 'FEMALE', Miss: 'FEMALE', Lady: 'FEMALE', Queen: 'FEMALE',
  Princess: 'FEMALE', Duchess: 'FEMALE', Countess: 'FEMALE', Baroness: 'FEMALE',
  Empress: 'FEMALE', Mother: 'FEMALE', Sister: 'FEMALE', Mistress: 'FEMALE',
}

/** Curated masculine given names (lowercased) for gender inference. */
export const MALE_GIVEN_NAMES = new Set([
  'john', 'james', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
  'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
  'brandon', 'benjamin', 'samuel', 'frank', 'gregory', 'raymond', 'alexander',
  'patrick', 'jack', 'dennis', 'jerry', 'henry', 'peter', 'arthur', 'harold',
  'aragorn', 'boromir', 'frodo', 'gandalf', 'gimli', 'gollum', 'legolas',
  'samwise', 'sauron', 'bilbo', 'elrond', 'merry', 'pippin', 'faramir',
  'theoden', 'saruman', 'eddard', 'robb', 'bran', 'rickon', 'jon', 'tyrion',
  'jaime', 'joffrey', 'robert', 'stannis', 'renly', 'varys', 'drogo', 'viserys',
  'harry', 'ronald', 'albus', 'severus', 'rubeus', 'draco', 'voldemort',
  'sirius', 'remus', 'neville', 'hagrid', 'dumbledore', 'marin',
])

/** Curated feminine given names (lowercased) for gender inference. */
export const FEMALE_GIVEN_NAMES = new Set([
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda',
  'dorothy', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'cynthia', 'amy', 'kathleen', 'angela', 'shirley', 'brenda', 'emma', 'anna',
  'pamela', 'nicole', 'samantha', 'katherine', 'christine', 'helen', 'debra',
  'rachel', 'carolyn', 'janet', 'maria', 'catherine', 'heather', 'jane',
  'arwen', 'galadriel', 'eowyn', 'catelyn', 'sansa', 'arya', 'daenerys',
  'cersei', 'hermione', 'ginevra', 'ginny', 'luna', 'minerva', 'lily',
  'petunia', 'elara',
])

/**
 * Canonical name → common diminutives/nicknames (all lowercased). Enables
 * deterministic nickname merging (e.g. "Elizabeth" ↔ "Lizzy"/"Beth"/"Eliza").
 */
export const NICKNAMES: Record<string, string[]> = {
  elizabeth: ['liz', 'lizzy', 'lizzie', 'beth', 'betty', 'eliza', 'bess'],
  william: ['will', 'bill', 'billy', 'willy', 'liam'],
  robert: ['rob', 'bob', 'bobby', 'robbie', 'bert'],
  richard: ['rick', 'dick', 'richie', 'rich'],
  james: ['jim', 'jimmy', 'jamie'],
  john: ['jack', 'johnny', 'jon'],
  michael: ['mike', 'mikey', 'mick'],
  thomas: ['tom', 'tommy'],
  charles: ['charlie', 'chuck', 'chas'],
  joseph: ['joe', 'joey'],
  daniel: ['dan', 'danny'],
  matthew: ['matt'],
  christopher: ['chris'],
  anthony: ['tony'],
  edward: ['ed', 'eddie', 'ted', 'ned'],
  benjamin: ['ben', 'benny'],
  samuel: ['sam', 'sammy'],
  alexander: ['alex', 'xander', 'sasha'],
  nicholas: ['nick', 'nicky'],
  katherine: ['kate', 'katie', 'kat', 'kathy', 'kitty'],
  catherine: ['cathy', 'cat', 'kate', 'katie'],
  margaret: ['maggie', 'meg', 'peggy', 'greta'],
  jennifer: ['jen', 'jenny'],
  jessica: ['jess', 'jessie'],
  rebecca: ['becky', 'becca'],
  patricia: ['pat', 'patty', 'trish'],
  deborah: ['deb', 'debbie'],
  susan: ['sue', 'susie'],
  victoria: ['vicky', 'tori', 'vic'],
  theodore: ['ted', 'teddy', 'theo'],
  frederick: ['fred', 'freddie'],
  albert: ['al', 'bert'],
  andrew: ['andy', 'drew'],
  daenerys: ['dany'],
  hermione: ['mione'],
}

/** Reverse lookup: nickname (lowercased) → canonical name (lowercased). */
export const NICKNAME_TO_CANONICAL: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [canonical, nicks] of Object.entries(NICKNAMES)) {
    for (const nick of nicks) out[nick] = canonical
  }
  return out
})()

// ---------------------------------------------------------------------------
// Narrative Intelligence Engine v2 — extended lexicons
// ----------------------------------------------------------------------------
// The following lexicons power the deterministic emotion, momentum, scene and
// structure engines. Every entry is a deliberate, hand-authored rule. All
// values are normalized (lowercase, trimmed) and de-duplicated. Consumers MUST
// treat these as immutable — do not mutate at runtime.
// ---------------------------------------------------------------------------

/**
 * Arousal lexicon (dimensional affect, orthogonal to valence).
 * Score range 0..1 where 0 = calm/low activation and 1 = highly activated.
 * Arousal measures intensity of feeling, NOT its pleasantness (that is valence).
 * Used by the emotion engine to weight emotional peaks and by momentum scoring.
 */
export const AROUSAL: Record<string, number> = {
  // high-activation negative
  terror: 1, terrified: 0.95, panic: 0.95, panicked: 0.95, rage: 0.95, furious: 0.9,
  fury: 0.9, horror: 0.9, horrified: 0.9, scream: 0.9, screamed: 0.9, screaming: 0.9,
  explosion: 0.95, exploded: 0.9, explode: 0.9, blast: 0.85, frantic: 0.85,
  frenzy: 0.85, frenzied: 0.85, desperate: 0.8, desperation: 0.8, shriek: 0.85,
  shrieked: 0.85, violent: 0.85, violently: 0.85, savage: 0.8, ferocious: 0.85,
  // high-activation positive
  ecstatic: 0.9, ecstasy: 0.9, thrilled: 0.85, thrill: 0.85, exhilarated: 0.85,
  exhilaration: 0.85, elated: 0.8, jubilant: 0.8, triumph: 0.8, triumphant: 0.8,
  overjoyed: 0.8, euphoric: 0.85, euphoria: 0.85, astonished: 0.75, astounded: 0.75,
  amazed: 0.7, stunned: 0.75, shocked: 0.8, startled: 0.75, electrified: 0.85,
  // mid-activation
  excited: 0.7, excitement: 0.7, eager: 0.6, anxious: 0.7, anxiety: 0.7, nervous: 0.65,
  angry: 0.7, afraid: 0.7, fear: 0.7, alarmed: 0.7, tense: 0.65, urgent: 0.75,
  fierce: 0.7, fiercely: 0.7, intense: 0.7, intensely: 0.7, passionate: 0.7,
  passion: 0.7, wild: 0.7, wildly: 0.7, racing: 0.7, pounding: 0.7, trembling: 0.65,
  shaking: 0.65, gasped: 0.65, gasp: 0.65, breathless: 0.7,
  // low-activation (calm)
  calm: 0.1, calmly: 0.1, peaceful: 0.1, peacefully: 0.1, quiet: 0.15, quietly: 0.15,
  still: 0.15, serene: 0.1, serenity: 0.1, gentle: 0.2, gently: 0.2, soft: 0.2,
  softly: 0.2, tranquil: 0.1, relaxed: 0.15, weary: 0.25, tired: 0.2, drowsy: 0.15,
  sleepy: 0.15, languid: 0.15, restful: 0.1, tender: 0.25, tenderly: 0.25,
  soothing: 0.15, content: 0.25, contentment: 0.25, sombre: 0.2, somber: 0.2,
  melancholy: 0.3, wistful: 0.25, dull: 0.15, listless: 0.15,
}

/**
 * Urgency lexicon — words signalling time pressure / immediacy. Used by the
 * momentum engine (higher urgency → higher forward drive) and as a weak signal
 * for the climax phase in the structure engine.
 */
export const URGENCY = new Set<string>([
  'now', 'immediately', 'instantly', 'quickly', 'hurry', 'hurried', 'hurrying',
  'rush', 'rushed', 'rushing', 'urgent', 'urgently', 'emergency', 'suddenly',
  'sudden', 'abruptly', 'abrupt', 'hasten', 'hastened', 'hastily', 'haste',
  'fast', 'faster', 'swift', 'swiftly', 'race', 'raced', 'racing', 'sprint',
  'sprinted', 'sprinting', 'dash', 'dashed', 'dashing', 'bolt', 'bolted',
  'flee', 'fled', 'fleeing', 'escape', 'escaped', 'escaping', 'run', 'ran',
  'running', 'scramble', 'scrambled', 'quick', 'atonce', 'nomore', 'toolate',
  'deadline', 'countdown', 'ticking', 'seconds', 'moments', 'instant',
])

/**
 * Temporal-shift lexicon — leading words/phrases that mark a jump in narrative
 * time (used by scene detection to identify temporal boundaries). Multi-word
 * phrases are stored lowercased with single spaces.
 */
export const TEMPORAL_SHIFT = new Set<string>([
  'later', 'meanwhile', 'afterward', 'afterwards', 'soon', 'eventually',
  'suddenly', 'presently', 'thereafter', 'subsequently', 'earlier', 'before',
  'the next day', 'the following morning', 'the following day', 'the next morning',
  'the next night', 'hours later', 'moments later', 'minutes later', 'days later',
  'weeks later', 'months later', 'years later', 'a moment later', 'an hour later',
  'that evening', 'that night', 'that morning', 'that afternoon', 'the morning after',
  'by the time', 'by nightfall', 'by morning', 'by dawn', 'at last', 'finally',
  'once', 'in time', 'long after', 'not long after', 'shortly after', 'a week later',
  'a year later', 'a day later', 'the day after', 'come morning', 'come nightfall',
])

/**
 * Action-verb lexicon (physical, high-kinetic verbs) — centralized here so the
 * momentum and event engines share a single authoritative source. All lowercase.
 */
export const ACTION_VERBS_LEXICON = new Set<string>([
  'ran', 'run', 'running', 'jumped', 'jump', 'leapt', 'leaped', 'grabbed', 'grab',
  'struck', 'strike', 'fell', 'fall', 'drew', 'slammed', 'slam', 'threw', 'throw',
  'lunged', 'lunge', 'sprang', 'spring', 'dashed', 'dash', 'rushed', 'rush',
  'charged', 'charge', 'climbed', 'climb', 'crawled', 'crawl', 'ducked', 'duck',
  'dodged', 'dodge', 'swung', 'swing', 'slashed', 'slash', 'punched', 'punch',
  'kicked', 'kick', 'blocked', 'block', 'parried', 'parry', 'rolled', 'roll',
  'spun', 'spin', 'whirled', 'whirl', 'seized', 'seize', 'clutched', 'clutch',
  'wrenched', 'wrench', 'pulled', 'pull', 'pushed', 'push', 'lifted', 'lift',
  'dropped', 'drop', 'smashed', 'smash', 'crashed', 'crash', 'burst', 'bolted',
  'bolt', 'sprinted', 'sprint', 'hurled', 'hurl', 'shoved', 'shove', 'flung',
  'fling', 'darted', 'dart', 'plunged', 'plunge', 'gripped', 'grip', 'snatched',
  'snatch', 'tackled', 'tackle', 'wrestled', 'wrestle', 'leaped', 'vaulted',
])

/**
 * Dialogue attribution verbs, lowercased (mirror of ATTRIBUTION_VERBS above but
 * normalized for deterministic set lookups). Used by the character engine's
 * speaker-detection stage.
 */
export const ATTRIBUTION_VERBS_LOWER = new Set<string>(
  [...ATTRIBUTION_VERBS].map((v) => v.toLowerCase()),
)

// ---------------------------------------------------------------------------
// Immutable normalization utilities
// ---------------------------------------------------------------------------

/** Strip a token to lowercase ASCII letters (deterministic, allocation-light). */
export function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/[^a-zà-öø-ÿ]/gi, '')
}

/**
 * Lowercase + collapse internal whitespace of a phrase (for multi-word lexicon
 * lookups such as TEMPORAL_SHIFT). Deterministic.
 */
export function normalizePhrase(phrase: string): string {
  return phrase.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Infer a coarse gender from a canonical/given name using curated lexicons. */
export function inferGenderFromName(name: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  const first = normalizeToken(name.split(/\s+/)[0] || '')
  if (MALE_GIVEN_NAMES.has(first)) return 'MALE'
  if (FEMALE_GIVEN_NAMES.has(first)) return 'FEMALE'
  return 'UNKNOWN'
}

/** Infer gender from an honorific token (e.g. "Mrs" → FEMALE). */
export function inferGenderFromHonorific(honorific: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  const key = honorific.replace(/\.$/, '')
  return HONORIFIC_GENDER[key] ?? 'UNKNOWN'
}
