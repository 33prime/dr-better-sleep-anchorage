// Canned Dr. Sommers replies for the chat. Pattern-matched against user input.

interface ReplyRule {
  match: RegExp;
  replies: string[]; // pick one
}

const RULES: ReplyRule[] = [
  {
    match: /\b(why|what.*caus|reason)\b/i,
    replies: [
      "It's the soft palate. When you exhale, the airway's partly closed and the tissue flutters. The mouthpiece holds your jaw forward so the airway opens.",
      "Mostly position. On your back, gravity pulls everything backward. The strap counters that — but it can only do so much against alcohol or a heavy meal close to bed.",
    ],
  },
  {
    match: /\b(alcohol|drink|wine|beer)\b/i,
    replies: [
      "Two drinks is your tipping point. On nights you logged three or more, the device only got you about halfway. It's not a moral judgment — alcohol relaxes the same muscles the strap is fighting.",
    ],
  },
  {
    match: /\b(sleep|tired|rest)\b/i,
    replies: [
      "Your sleep window has been steady — about 7h 12m on average. The thing that's changed is what's *inside* it. Deep sleep is up 18m vs. last month.",
    ],
  },
  {
    match: /\b(strap|position|tighten|adjust)\b/i,
    replies: [
      "Position 3 still. I want two more clean nights before we touch it. Tightening too early is how people end up with jaw soreness.",
    ],
  },
  {
    match: /\b(temperature|cold|hot|warm|room)\b/i,
    replies: [
      "Sweet spot is 65–67°F for you. Below 62, your nose dries and you mouth-breathe more. Above 70, you sleep lighter and roll.",
    ],
  },
  {
    match: /\b(yes|yeah|sure|ok|okay|go for it)\b/i,
    replies: [
      "Around 2:40 you rolled onto your back and the strap held. *That's the thing* — last week, position 2 would slip there.",
      "Got it. I'll keep watching. If anything changes overnight I'll flag it tomorrow morning.",
    ],
  },
  {
    match: /\b(thanks|thank you|appreciate)\b/i,
    replies: [
      "Anytime. That's literally the job.",
      "You got it. Sleep well.",
    ],
  },
  {
    match: /\b(no|nope|not really|don'?t)\b/i,
    replies: [
      "Fair. We can come back to it whenever.",
      "Noted. Want me to check in tomorrow morning instead?",
    ],
  },
];

const DEFAULTS = [
  "Let me sit with that for a second… honestly, I'm not sure yet — I want to see another night before I commit.",
  "Worth flagging. I'll watch for the pattern over the next few nights and bring it up if it firms up.",
  "Tell me a little more — what's the texture of it? Mornings, evenings, both?",
];

export function pickReply(userText: string): string {
  for (const rule of RULES) {
    if (rule.match.test(userText)) {
      return rule.replies[Math.floor(Math.random() * rule.replies.length)];
    }
  }
  return DEFAULTS[Math.floor(Math.random() * DEFAULTS.length)];
}
