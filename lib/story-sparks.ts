/**
 * Story Spark Library — diverse comic premises to eliminate the blank-page problem.
 *
 * Each spark has a genre tag, a one-line premise, and a full prompt ready for
 * the AI. Users can shuffle through these to find one that clicks, then customize.
 */

export interface StorySpark {
    id: string;
    genre: string;
    genreEmoji: string;
    premise: string;
    prompt: string;
}

export const STORY_SPARKS: StorySpark[] = [
    // ─── Action / Sci-Fi ──────────────────────────────
    {
        id: "courier-chase",
        genre: "Action",
        genreEmoji: "⚡",
        premise: "A rogue courier races through a neon market while drones close in",
        prompt: "A rogue courier races through a rain-soaked neon market while masked drones close in. Keep it kinetic and cinematic.",
    },
    {
        id: "mech-pilot",
        genre: "Sci-Fi",
        genreEmoji: "🚀",
        premise: "The last mech pilot wakes up in a junkyard 200 years too late",
        prompt: "The last surviving mech pilot wakes up in a massive junkyard and realizes 200 years have passed. Their mech is half-buried, and someone has built a village around it.",
    },
    {
        id: "space-heist",
        genre: "Sci-Fi",
        genreEmoji: "🚀",
        premise: "A crew of misfit aliens plans to steal a star",
        prompt: "A ragtag crew of alien outcasts plans the impossible heist: stealing a dying star before a megacorporation weaponizes it. Show the planning phase aboard their rusty ship.",
    },
    {
        id: "rooftop-duel",
        genre: "Action",
        genreEmoji: "⚡",
        premise: "Two rival assassins meet on a rooftop during a thunderstorm",
        prompt: "Two rival assassins, once partners, confront each other on a rain-lashed rooftop. Lightning illuminates their tension. Neither wants to fight, but both know they must.",
    },
    {
        id: "cyborg-detective",
        genre: "Sci-Fi",
        genreEmoji: "🚀",
        premise: "A detective replaces too many body parts and starts forgetting who they are",
        prompt: "A cyberpunk detective has replaced so many body parts with tech that memories are glitching. They investigate a case that might be their own past. Moody and introspective.",
    },

    // ─── Fantasy ───────────────────────────────────────
    {
        id: "dragon-baker",
        genre: "Fantasy",
        genreEmoji: "🐉",
        premise: "A retired dragon opens a bakery in a human village",
        prompt: "A tiny retired dragon opens a bakery in a medieval village. Humans are suspicious at first, but the pastries are incredible. Show the opening day chaos with warmth and humor.",
    },
    {
        id: "last-spell",
        genre: "Fantasy",
        genreEmoji: "🐉",
        premise: "A wizard casts their final spell to stop a falling moon",
        prompt: "An elderly wizard stands on a cliff as a cracked moon falls toward the earth. They prepare to cast one last spell. Make it epic and emotional.",
    },
    {
        id: "knight-quest",
        genre: "Fantasy",
        genreEmoji: "🐉",
        premise: "A clumsy squire accidentally pulls the legendary sword from the stone",
        prompt: "A clumsy, anxious squire trips and accidentally pulls the legendary sword from the stone — in front of the entire kingdom. Now everyone expects them to be a hero.",
    },
    {
        id: "forest-spirit",
        genre: "Fantasy",
        genreEmoji: "🐉",
        premise: "A child befriends a forest spirit, but it's slowly dying",
        prompt: "A lonely child discovers a glowing forest spirit deep in the woods. They become friends, but the spirit is fading as the forest is being cut down. Bittersweet and magical.",
    },

    // ─── Mystery / Noir ────────────────────────────────
    {
        id: "missing-memory",
        genre: "Mystery",
        genreEmoji: "🔍",
        premise: "A woman finds a photo of herself at a place she's never been",
        prompt: "A woman discovers a photograph of herself at an elegant party she has no memory of attending. The date on the back is three years in the future. Atmospheric and unsettling.",
    },
    {
        id: "vanishing-town",
        genre: "Mystery",
        genreEmoji: "🔍",
        premise: "A journalist investigates a town that erases itself from maps every night",
        prompt: "A journalist tracks a small town that disappears from every map at midnight and reappears at dawn. The residents don't seem to notice. Eerie and investigative.",
    },
    {
        id: "noir-pianist",
        genre: "Noir",
        genreEmoji: "🎹",
        premise: "A jazz pianist witnesses something they shouldn't in a rain-soaked alley",
        prompt: "A tired jazz pianist steps into an alley after a late set and witnesses a crime. Now the wrong people know their face. Moody noir atmosphere with rain and neon.",
    },

    // ─── Horror / Supernatural ─────────────────────────
    {
        id: "mirror-other",
        genre: "Horror",
        genreEmoji: "👻",
        premise: "A person's reflection starts moving on its own",
        prompt: "A person brushes their teeth and notices their reflection pauses half a second too late. Then it smiles — but they're not smiling. Creepy, slow-burn horror.",
    },
    {
        id: "lighthouse-keeper",
        genre: "Horror",
        genreEmoji: "👻",
        premise: "A lighthouse keeper sees impossible ships in the fog",
        prompt: "A lonely lighthouse keeper spots ancient ships sailing through the fog — ships that sank centuries ago. Something on board is signaling. Atmospheric maritime horror.",
    },
    {
        id: "haunted-arcade",
        genre: "Horror",
        genreEmoji: "👻",
        premise: "An abandoned arcade machine turns on by itself and shows someone's future",
        prompt: "Teens find an old arcade cabinet in a shut-down mall. When it powers on by itself, the game screen shows real future events — horrible ones. Retro horror aesthetic.",
    },

    // ─── Slice of Life / Drama ─────────────────────────
    {
        id: "last-letter",
        genre: "Drama",
        genreEmoji: "💌",
        premise: "A grandmother's unsent love letter changes a family's understanding",
        prompt: "While cleaning out their late grandmother's attic, someone finds an unsent love letter from 60 years ago — addressed to someone unexpected. Emotional, warm, revelatory.",
    },
    {
        id: "food-truck",
        genre: "Slice of Life",
        genreEmoji: "🍜",
        premise: "Two strangers bond over late-night ramen at a tiny food truck",
        prompt: "Two strangers sit at a tiny parking-lot ramen truck at 2 AM. Both are having the worst day. They don't swap names, just stories. Warm, quiet, human.",
    },
    {
        id: "first-day",
        genre: "Slice of Life",
        genreEmoji: "🍜",
        premise: "A kid's chaotic first day at a school where nothing is normal",
        prompt: "A nervous kid arrives at a new school where the teachers are robots, the gym is zero-gravity, and the lunch lady is a retired superhero. Funny and wholesome.",
    },
    {
        id: "reunion-concert",
        genre: "Drama",
        genreEmoji: "💌",
        premise: "A washed-up rock star tries one last comeback with their estranged bandmate",
        prompt: "A former rock legend, now broke and forgotten, convinces their estranged ex-bandmate to play one final reunion show. The tension, the rehearsals, the memories. Bittersweet rock drama.",
    },

    // ─── Comedy / Absurd ───────────────────────────────
    {
        id: "cat-overlord",
        genre: "Comedy",
        genreEmoji: "😂",
        premise: "A house cat accidentally becomes the mayor of a small town",
        prompt: "Due to a bureaucratic error, a house cat named Mr. Whiskers is elected mayor. The town takes it seriously. Council meetings are chaos. Absurd political satire.",
    },
    {
        id: "vending-portal",
        genre: "Comedy",
        genreEmoji: "😂",
        premise: "A samurai discovers a portal inside a vending machine",
        prompt: "A retired samurai discovers a portal inside a convenience store vending machine that leads to alternate realities. Each snack button goes somewhere different. Comedic and adventurous.",
    },
    {
        id: "villain-interview",
        genre: "Comedy",
        genreEmoji: "😂",
        premise: "A supervillain goes on a job interview after quitting crime",
        prompt: "A reformed supervillain sits in a corporate job interview trying to explain their 'previous experience' without mentioning world domination. Awkward corporate comedy.",
    },

    // ─── Romance ───────────────────────────────────────
    {
        id: "bookshop-rain",
        genre: "Romance",
        genreEmoji: "💕",
        premise: "Two strangers share a tiny bookshop awning during a downpour",
        prompt: "Two strangers take shelter under a tiny bookshop awning during a sudden downpour. They discover they've been reading the same obscure novel. Gentle, rainy-day romance.",
    },
    {
        id: "time-penpal",
        genre: "Romance",
        genreEmoji: "💕",
        premise: "A person finds letters from someone writing 100 years in the past",
        prompt: "Someone moves into an old apartment and finds letters hidden in the walls — from a person living there 100 years ago. They start writing back, and the letters are answered. Wistful time-crossed romance.",
    },

    // ─── Adventure ─────────────────────────────────────
    {
        id: "sky-pirates",
        genre: "Adventure",
        genreEmoji: "🗺️",
        premise: "Sky pirates discover a floating island that shouldn't exist",
        prompt: "A crew of sky pirates navigating airships through endless clouds discovers a floating island marked 'DOES NOT EXIST' on every chart. Something is watching from the ruins. Swashbuckling adventure.",
    },
    {
        id: "deep-sea",
        genre: "Adventure",
        genreEmoji: "🗺️",
        premise: "A solo diver finds a door at the bottom of the ocean",
        prompt: "A deep-sea diver exploring a trench alone discovers an impossible door embedded in the ocean floor. It has a doorbell. Mysterious and awe-inspiring.",
    },
    {
        id: "siblings-storm",
        genre: "Adventure",
        genreEmoji: "🗺️",
        premise: "Two siblings reunite to protect their floating hometown from a storm spirit",
        prompt: "Two estranged siblings reunite to protect their floating hometown from an ancient storm spirit. Balance wonder with heartfelt dialogue.",
    },

    // ─── Historical / Period ───────────────────────────
    {
        id: "prohibition-jazz",
        genre: "Historical",
        genreEmoji: "🎺",
        premise: "A speakeasy in 1920s Chicago hides more than just illegal drinks",
        prompt: "A 1920s Chicago speakeasy run by a charismatic woman hides a secret underground network. A new patron stumbles into something bigger. Jazz, suspense, and flapper aesthetics.",
    },
    {
        id: "samurai-sunset",
        genre: "Historical",
        genreEmoji: "🎺",
        premise: "A ronin's final duel at sunset decides the fate of a village",
        prompt: "A weary ronin arrives at a small village controlled by a corrupt warlord. The villagers beg for help. At sunset, swords are drawn. Classic samurai showdown.",
    },
] as const;

/**
 * Returns a random spark that hasn't been shown recently.
 * Uses a simple LRU approach with localStorage to avoid repeats.
 */
export function getRandomSpark(excludeIds: string[] = []): StorySpark {
    const available = STORY_SPARKS.filter((s) => !excludeIds.includes(s.id));
    const pool = available.length > 0 ? available : STORY_SPARKS;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns all unique genre names with their emojis.
 */
export function getGenres(): Array<{ genre: string; emoji: string }> {
    const seen = new Set<string>();
    const result: Array<{ genre: string; emoji: string }> = [];
    for (const spark of STORY_SPARKS) {
        if (!seen.has(spark.genre)) {
            seen.add(spark.genre);
            result.push({ genre: spark.genre, emoji: spark.genreEmoji });
        }
    }
    return result;
}

/**
 * Returns sparks filtered by genre.
 */
export function getSparksByGenre(genre: string): StorySpark[] {
    return STORY_SPARKS.filter((s) => s.genre === genre);
}
