/* ============================================================
   SPELLING WORDS - the starting lists
   ============================================================

   THIS FILE IS ONLY THE STARTING POINT. Once anybody uses the
   "Change the Word Lists" button in the game, the lists live
   in the browser instead and this file stops being read. So
   the normal way to change next week's words is the gear
   button on the Pick a Game screen, NOT this file.

   What this file is for: the words the game starts with on a
   computer that has never been used before, and a copy to
   fall back on if the saved ones are ever lost.

   HOW A LIST WORKS
   ---------------------------------------------------------
     id            a short name with no spaces. Never change
                   an id once it exists; it is how the game
                   remembers which lists were ticked.
     name          what is shown on the tick-box screen.
     capsEnforced  true  = capital letters have to match
                   false = "monday" is accepted for "Monday"
     words         the words themselves.

   HOW A WORD WORKS
   ---------------------------------------------------------
     word      spelled EXACTLY as it should be typed. This is
               also how you say a word needs a capital: type
               "Monday" and the capital is required; type
               "because" and no capital is ever asked for.
               (When capsEnforced is false, capitals are never
               required at all, whichever way they are typed
               here.)

     sentence  OPTIONAL. An example sentence, read out after
               the word. Leave it as "" for almost everything.

               It is there for words that sound the same:
               "their", "there" and "they're" are one sound
               and three spellings, so read out on their own
               the question has no right answer. A sentence
               says which one is meant. Also useful for a word
               the computer voice reads oddly.
   ============================================================ */

const SPELLING_DATA = {

  meta: {
    title: "Spelling List"
  },

  lists: [
    {
      id: "week1",
      name: "Starter Words",
      capsEnforced: false,
      words: [
        { word: "because",  sentence: "" },
        { word: "friend",   sentence: "" },
        { word: "school",   sentence: "" },
        { word: "family",   sentence: "" },
        { word: "please",   sentence: "" },
        { word: "thank",    sentence: "" },
        { word: "little",   sentence: "" },
        { word: "happy",    sentence: "" },
        { word: "water",    sentence: "" },
        { word: "under",    sentence: "" }
      ]
    },
    {
      id: "soundalikes",
      name: "Words That Sound the Same",
      capsEnforced: false,
      words: [
        { word: "their",  sentence: "The children put on their coats." },
        { word: "there",  sentence: "Your bag is over there." },
        { word: "they're", sentence: "They're going to the park." },
        { word: "to",     sentence: "We are going to the store." },
        { word: "too",    sentence: "I want to come too." },
        { word: "two",    sentence: "I have two hands." },
        { word: "knew",   sentence: "She knew the answer." },
        { word: "new",    sentence: "He has a new bike." }
      ]
    },
    {
      id: "capitals",
      name: "Words That Need a Capital",
      capsEnforced: true,
      words: [
        { word: "Monday",    sentence: "" },
        { word: "Tuesday",   sentence: "" },
        { word: "Saturday",  sentence: "" },
        { word: "January",   sentence: "" },
        { word: "December",  sentence: "" }
      ]
    }
  ]
};
