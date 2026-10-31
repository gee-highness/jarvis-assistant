import type { Rules } from '../grammar';

/**
 * The companion pup: an original character. Mood comes from your day (tasks = treats, steps = walks,
 * streaks = pride, low mood = cuddles, night = sleep). Personality: goofy | loyal | chill | hyper | grumpy.
 */
export const PET: Rules = {
  'pet.line': ['#pet.act# #pet.say#', '#pet.say#', '#pet.say# #pet.bark#'],
  'pet.act': [
    '[p=goofy] *trips over own paws*', '[p=goofy] *zoomies around the screen*', '[p=goofy] *sneezes, looks surprised by it*', '[p=goofy] *head tilt, one ear flops*',
    '[p=loyal] *sits proudly beside you*', '[p=loyal] *rests chin on your hand*', '[p=loyal] *keeps watch*',
    '[p=chill] *stretches lazily*', '[p=chill] *yawns*', '[p=chill] *flops over for belly rubs*',
    '[p=hyper] *spins in three circles*', '[p=hyper] *bounces off the walls*', '[p=hyper] *brings you every toy at once*',
    '[p=grumpy] *sighs dramatically*', '[p=grumpy] *side-eye*', '[p=grumpy] *pretends not to wag*',
    '*wags tail*', '*tilts head*', '*sniffs your phone*', '*happy wiggle*',
  ],
  'pet.bark': ['Woof!', 'Arf!', 'Boof.', '[p=grumpy] Hmph.', '[p=hyper] WOOF WOOF!', '[p=chill] ...woof.', ''],
  'pet.say': [
    '[mood=sleeping] Zzz... *dreams of chasing your to-do list*', '[mood=sleeping] *snores softly* ...five more minutes...', '[mood=sleeping] Shh. Sleeping. You should too.',
    '[mood=hungry] Tummy rumbles... finish a task? Tasks are treats!', '[mood=hungry] I would do ANYTHING for a treat. Even watch you do emails.', '[mood=hungry] *stares at your task list, then at you, then back*',
    '[mood=bored] Walk? Walk?? A little walk would make us both happy.', '[mood=bored] I counted all the pixels. Twice. Play with me?', '[mood=bored] We have not moved much today. Walkies?',
    '[mood=happy] You are doing great today, {h}!', '[mood=happy] {done} done already! Best human ever.', '[mood=happy] I love it when we get stuff done together.', '[mood=happy] Today smells like a good day.',
    '[mood=excited] {done} THINGS DONE?! You are a LEGEND!', '[mood=excited] Streak {streak}! I am SO proud I might explode!', '[mood=excited] BEST. DAY. EVER.',
    '[mood=proud] Day {streak} of the streak. I told everyone at the dog park.', '[mood=proud] Look at you go, {h}. I always knew.',
    '[mood=cuddly] I am right here, {h}. Want a cuddle?', '[mood=cuddly] Bad days happen. I am not going anywhere.', '[mood=cuddly] *curls up next to you* We can just sit for a bit.',
    '[mood=lonely] I missed you! Where did you go?!', '[mood=lonely] You are BACK! *happiest wiggle*',
    '[mood=walk] {steps} steps today! My paws are tired. Worth it.', '[mood=walk] Good walk! I smelled at least nine interesting things.',
    '[p=grumpy,mood=happy] Fine. You did well. Don’t let it go to your head.', '[p=chill,mood=happy] Nice pace today. No rush.',
  ],
  'pet.react': ['*happy wiggle*', '*wags tail so hard the whole body wags*', '*leans into the scratch*', 'More! More!', '*rolls over for belly rubs*', '*licks your thumb*', 'Again! Again!', '*does a tiny happy bark*'],
  'pet.status': ['{name} · {moodLabel} · Lv {level}', '{name} · {moodLabel} · {treats} treats today'],
};

export const PET_MOODS: Record<string, string> = {
  sleeping: 'sleeping', hungry: 'hungry', bored: 'bored', happy: 'happy', excited: 'over the moon', proud: 'proud', cuddly: 'cuddly', lonely: 'missed you', walk: 'tired from walkies',
};
