# Question packs

One JSON file per pack. The filename is the pack id unless the file names
its own.

```json
{
  "id": "uprough",
  "title": "Up Rough General Knowledge",
  "credit": "who wrote the questions",
  "questions": [
    {
      "question": "Which BBS software is this board built on?",
      "answers": ["AmiExpress", "CNet", "StarNet", "TAG"],
      "correct": 0,
      "note": "Shown on the result page. Optional."
    }
  ]
}
```

**Exactly four answers**, because there are four coloured fastext keys: red,
green, yellow, cyan, in that order. `correct` is the index of the right one,
0 to 3.

A pack that will not parse is reported in the door and skipped - the others
still play. Keep question text under about 110 characters and answers under
30; the door wraps and trims, but a teletext page is 40 columns wide and the
trimming shows.

Files you add here survive a deploy: the image-to-volume sync only
overwrites paths the image itself carries.
