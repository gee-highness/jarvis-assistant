/* Regression set of phrasings that were first used as BLIND tests (first-try accuracy then: 77% and 71%) and have since been fixed.
 * Keeps those fixes from regressing. Values with '|' accept several intents. */
import { ReflexEngine } from '../src/app/core/reflex/engine';
const host: any = {
  profile: () => ({ honorific: 'sir', userName: 'Gerry', name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, verbosity: 35, enthusiasm: 35, playfulness: 25, curiosity: 35, toughLove: 45, emotional: 40, proactivity: 70 }, emoji: 'none', language: 'british', swearing: 'none', catchphrases: '', likes: '' }),
  state: () => ({ open: 3, overdue: 1, dueToday: 1, doneToday: 1, inbox: 0, tasks: [{ id: 'a', title: 'Email Sam', urgent: false, important: true, isMit: true }, { id: 'b', title: 'Pay rent', urgent: true, important: true, isMit: false }, { id: 'c', title: 'Gym bag', urgent: false, important: false, isMit: false }], mits: ['Email Sam'], overdueTitles: ['Pay rent'], habits: ['Run', 'Read'], habitsLeft: ['Run'], habitsDone: 1, habitsTotal: 2, streak: 3, level: 2, levelTitle: 'x', xpToday: 10, focusToday: 0, focusRunning: false, goals: [], docs: 0, memories: 0 }),
  runTool: async (n: string) => ({ ok: true, result: n + ' ok' }), memorySearch: async () => [], memoryAdd: async () => {}, librarySearch: async () => [], updateProfile: async () => {},
  online: () => false, kvGet: async () => undefined, kvSet: async () => {}, now: () => new Date(), country: () => 'SZ',
};
const B: [string, string][] = [
  ['hello there jarvis', 'chat.greet'], ['sup jarvis', 'chat.wyd'], ['hows life', 'chat.howareyou'], ['ta very much', 'chat.thanks'], ['catch you on the flip side', 'chat.bye'], ['what should i call you', 'chat.who'],
  ['list your skills', 'chat.capabilities'], ['do you spy on me', 'chat.howwork'], ['are you a real person', 'chat.alive'], ['who is your developer', 'chat.creator'],
  ['create a task for taking out the bins', 'task.add'], ['i must call the plumber', 'task.add'], ['todo: book flights', 'task.add'], ['what do i need to do', 'task.list'], ['read me my tasks', 'task.list'],
  ['the budget task is done', 'task.done'], ['i handled the email', 'task.done'], ['scrap the gym bag task', 'task.delete'], ['bump pay rent to tomorrow', 'task.move'], ['make email sam a top priority', 'task.mit'],
  ['begin a deep work session', 'focus.start'], ['i need a 10 minute break', 'focus.start'], ['stop concentrating', 'focus.stop'], ['add a habit called stretching', 'habit.add'], ['logged my run', 'habit.log'],
  ['brief me on today', 'plan.briefing'], ['plan out my morning', 'plan.day'], ['am i on track', 'progress.stats'], ['what level am i', 'progress.stats'], ['remind me to take my meds at 8pm', 'reminder.add'],
  ['set an alarm for quarter past six', 'alarm.set'], ['timer 25 minutes', 'timer.set'], ['save a note: ideas for the app', 'note.create'], ['log my mood as 5', 'mood.log'], ['note in my journal i was grateful for rain', 'journal.add'],
  ['remember my favourite colour is green', 'memory.remember'], ['new goal: run a 10k', 'goal.add'], ['bring up the camera app', 'phone.open'], ['light on', 'phone.torch'], ['am i charging', 'phone.battery'],
  ['wifi settings please', 'phone.settings'], ['directions to the airport', 'phone.navigate'], ['put on some amapiano', 'phone.play'], ['what is the time now', 'info.time'], ['which day is it', 'info.date'],
  ['whats 250 plus 75', 'info.calc'], ['convert 10 miles to km', 'info.convert'], ['how long until easter', 'info.days'], ['who is the ceo of tesla', 'research.ask'], ['what is the speed of light', 'research.ask'],
  ['i feel miserable', 'feel.sad'], ['i am so worried about exams', 'feel.stress'], ['ugh i am annoyed', 'feel.angry'], ['i could sleep for a week', 'feel.tired'], ['i have nothing to do', 'feel.bored'],
  ['best day ever', 'feel.happy'], ['i got into university', 'feel.win'], ['i caught a cold', 'feel.sick'], ['i am hungry what should i cook', 'feel.hungry'], ['i keep putting things off', 'feel.procrastinate'],
  ['make me laugh', 'fun.joke'], ['teach me something', 'fun.fact'], ['say something motivational', 'fun.quote'], ['flip a coin for me', 'fun.coin'], ['pick a number', 'fun.dice'],
  ['guide me through some breathing', 'well.breathe'], ['let us do a mental health screening', 'well.screen'], ['i need to talk to a professional', 'well.help'], ['how many hours did i sleep', 'health.sleep'], ['what apps do i use most', 'health.screen'],

  ['good to see you again', 'chat.greet'], ['how have you been keeping', 'chat.howareyou'], ['thanks a million', 'chat.thanks'], ['i am heading to bed', 'chat.night'], ['right then i will leave you to it', 'chat.bye'],
  ['tell me what you are', 'chat.who'], ['what tricks do you know', 'chat.capabilities'], ['does my information leave my phone', 'chat.howwork'], ['who programmed you', 'chat.creator'],
  ['add dentist to my to do list', 'task.add'], ['please create a reminder task to send the invoice friday', 'task.add|reminder.add'], ['what is waiting for me today', 'task.list'], ['show tasks due this week', 'task.list'],
  ['the laundry is finished', 'task.done'], ['cross off pay rent', 'task.done'], ['drop the email sam task', 'task.delete'], ['move pay rent to next monday', 'task.move'], ['flag email sam as important', 'task.mit'],
  ['i want to focus for half an hour', 'focus.start'], ['how long have i focused this week', 'focus.stats'], ['mark run as done for today', 'habit.log'], ['which habits are still open', 'habit.report'],
  ['what is the plan for tomorrow', 'plan.day|plan.schedule|plan.briefing'], ['how did i do today', 'plan.summary'], ['notify me at noon about lunch', 'reminder.add'], ['wake me at half past five', 'alarm.set'], ['time my pasta for 9 minutes', 'timer.set'],
  ['jot down that sam likes tea', 'note.create'], ['search my notes for passport', 'note.search'], ['today i felt calm', 'journal.add'], ['energy level 2', 'mood.log'], ['my birthday is on 14 march', 'learn.fact'],
  ['forget everything about my sister', 'memory.forget'], ['i want to save ten thousand rand this year', 'goal.add|learn.fact'], ['open maps', 'phone.open'], ['turn off the torch', 'phone.torch'], ['text sam i am running late', 'comm.text'],
  ['book a meeting with the team on friday at 10', 'calendar.add'], ['do i have any meetings today', 'calendar.read'], ['whats 40 percent of 90', 'info.calc'], ['how many kilograms in 5 pounds', 'info.convert'], ['when is christmas', 'info.days'],
  ['who is the president of france', 'research.ask'], ['what is the population of japan', 'research.ask'], ['will it rain tomorrow', 'research.ask|info.web'], ['i am gutted', 'feel.sad'], ['my nerves are shot', 'feel.stress'],
  ['i am wiped out', 'feel.tired'], ['i feel isolated', 'feel.lonely'], ['i am fuming', 'feel.angry'], ['i am buzzing today', 'feel.happy'], ['i have the flu', 'feel.sick'],
  ['i did it i got promoted', 'feel.win'], ['i cannot sleep tonight', 'feel.cantsleep'], ['entertain me', 'feel.bored'], ['crack a joke', 'fun.joke'], ['tell me a story about a dragon', 'fun.story'],
  ['i am feeling low and need a check in', 'well.checkin|feel.sad'], ['quiz me on anxiety', 'well.screen'], ['teach me to ground myself', 'well.ground'], ['how many steps today', 'health.steps'], ['give me my health summary', 'health.report'],
];
(async () => {
  const e = new ReflexEngine(host); await e.init(); let ok = 0; const miss: string[] = [];
  for (const [u, w] of B) { const r = await e.respond(u); const hit = w.split('|').includes(r.intent) || (w === 'research.ask' && r.intent === 'info.web'); if (hit) ok++; else miss.push(`"${u}" → ${r.intent} (${r.confidence.toFixed(2)}) wanted ${w}`); }
  console.log(`blind-derived regression: ${ok}/${B.length}`); for (const m of miss) console.log(' ✗ ' + m);
  if (ok !== B.length) process.exitCode = 1;
})();
