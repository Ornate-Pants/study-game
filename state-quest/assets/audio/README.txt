SOUNDS  --  there are no sound files, and that is on purpose

This folder is empty. Nothing needs to go in it.

The five sounds are MADE BY THE BROWSER, from notes, at the
moment they play:

  correct      a right answer, two notes going up
  wrong        a soft low note. Gentle, never a buzzer. There is
               no losing in this game, so it must never sound
               like a mistake was punished.
  coin         a short bright ping, plays a lot in the runner
  roundWin     finished a round, a little run up the scale
  highScore    made the top ten, the biggest sound in the game

Why it was done this way:
  A page opened straight from a folder (file://) is fussy about
  loading its own media files, and five sound files would have
  been five more things to download, keep in the right place,
  and get wrong. Notes always work, weigh nothing, and can be
  changed by editing numbers.

TO CHANGE A SOUND:
  Open js/audio.js. Every sound is a short recipe near the top
  of the file, written as a list of notes with a pitch and a
  length. There are some pitches to borrow in the comments.
  No sound editing program needed.

The mute button in the corner turns them all off, and the
choice is remembered the next time the game is opened.
