/* AmiExpress Time of Day Script */
/* Shows appropriate greeting based on time */

username = BBSGETUSERNAME()
hour = TIME("H")

SAY ""

/* Determine greeting */
IF hour >= 5 THEN IF hour < 12 THEN SAY "\x1b[33m☀ Good morning, " || username || "!\x1b[0m"
IF hour >= 12 THEN IF hour < 17 THEN SAY "\x1b[36m☼ Good afternoon, " || username || "!\x1b[0m"
IF hour >= 17 THEN IF hour < 21 THEN SAY "\x1b[35m★ Good evening, " || username || "!\x1b[0m"
IF hour >= 21 THEN SAY "\x1b[34m✧ Good night, " || username || "!\x1b[0m"
IF hour < 5 THEN SAY "\x1b[34m✧ Good night (or early morning), " || username || "!\x1b[0m"

/* Show day of week */
weekday = DATE("W")
SAY "Happy " || weekday || "!"

SAY ""
