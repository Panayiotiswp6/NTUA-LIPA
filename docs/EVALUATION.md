# Fidelity evaluation

Generated 2026-11-16T13:00:07.800Z with `npm run eval` · chat model `gpt-6-luna` · embeddings `text-embedding-3-large` · 18 held-out samples (3 per contact) · 31,457 tokens.

**Method.** Leave-one-out over the owner's synthetic writing samples. For each held-out sample the twin receives only the contact's message; the owner's real reply is hidden from the repository and from retrieval. The reply is compared with the real owner reply.

- **Style similarity**: cosine similarity between the reply and the real owner reply (`text-embedding-3-large`). Higher is closer.
- **Relationship accuracy**: a blind test. Without being told the recipient, is the reply closest to the owner's style for the correct relationship (friend / classmate / professor)? Chance is 33%.
- **Register**: replies to the professor use the formal plural and no emoji; replies to a friend avoid formal phrasing.

| System | Style similarity | Relationship accuracy | Register |
|---|---:|---:|---:|
| Digital Self (gpt-6-luna + retrieval) | 0.657 | 100% | 100% |
| Generic gpt-6-luna, no persona | 0.538 | 39% | 78% |
| Deterministic rules (offline) | 0.655 | 100% | 100% |

Style similarity by relationship:

| Relationship | n | Digital Self | Generic | Rules |
|---|---:|---:|---:|---:|
| friend | 6 | 0.720 | 0.543 | 0.691 |
| classmate | 6 | 0.515 | 0.579 | 0.504 |
| professor | 6 | 0.736 | 0.491 | 0.771 |

Model replies replaced by the deterministic engine (guard or error): 0 of 18. Mean latency per held-out sample (three systems in parallel): 2.5 s.

**Caveats.** The samples are synthetic and few (9 per contact), so the numbers show the direction, not a benchmark. The deterministic engine was written with these same samples in view, so its similarity is optimistic. Real fidelity must be re-measured on the owner's own consented data.

## Replies

| Sample | To | Contact wrote | Real owner reply | Digital Self | Generic |
|---|---|---|---|---|---|
| `src-ig-maria-01` | friend | πάμε για καφέ κάποια στιγμή; | τέλεια! πες μου πώς το σκέφτεσαι 🙂 | ωραία ακούγεται! πες μου ποια μέρα και ώρα σκέφτεσαι 🙂 | Φυσικά! Πότε σε βολεύει; |
| `src-ig-maria-02` | friend | να βρεθούμε να τα πούμε; | ωραία ακούγεται! πες μου λίγες λεπτομέρειες 🙂 | τέλεια! πες μου πότε σκέφτεσαι 🙂 | Βεβαίως! Πότε σε βολεύει; |
| `src-ig-maria-03` | friend | τι παίζει με την εργασία; | για την εργασία λες; πες μου ποιο σημείο εννοείς 🙂 | ποια εργασία λες; πες μου λίγο 🙂 | Ποια εργασία εννοείς; Στείλε μου λίγες λεπτομέρειες για να σε βοηθήσω. |
| `src-ig-nikos-01` | classmate | Θες να περάσεις από την ομάδα; | Ευχαριστώ για την πρόσκληση! Πες μου λίγες λεπτομέρειες. | Τι ώρα σκέφτεσαι; | Ναι, ευχαρίστως! Τι ώρα; |
| `src-ig-nikos-02` | classmate | Να κανονίσουμε μια συνάντηση; | Για τη συνάντηση, τι έχεις κατά νου; | Ποια μέρα και ώρα εννοείς για τη συνάντηση; | Βεβαίως! Πότε σε βολεύει; |
| `src-ig-nikos-03` | classmate | Έχω μια απορία για την εργασία. | Για την εργασία, ποιο σημείο εννοείς; | Πες μου λίγες περισσότερες λεπτομέρειες. | Φυσικά! Ποια είναι η απορία σου για την εργασία; |
| `src-ig-eleni-01` | professor | Θα θέλατε να συμμετάσχετε στη συζήτηση; | Καλησπέρα σας, σας ευχαριστώ για την πρόσκληση. Θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες; | Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συζήτησης; | Βεβαίως, ευχαρίστως να συμμετάσχω στη συζήτηση. |
| `src-ig-eleni-02` | professor | Θα μπορούσαμε να συναντηθούμε για μια συζήτηση; | Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συνάντησης; | Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε τη μέρα και την ώρα της συνάντησης; | Βεβαίως! Πότε σας εξυπηρετεί; |
| `src-ig-eleni-03` | professor | Σε ποιο σημείο της εργασίας έχετε απορία; | Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε σε ποιο σημείο της εργασίας αναφέρεστε; | Καλησπέρα σας, θα το ελέγξω και θα σας ενημερώσω. | Έχω απορία στο σημείο όπου εξηγείται η μεθοδολογία της εργασίας. Μπορείτε να μου το διευκρινίσετε; |
| `src-gm-maria-01` | friend | πάμε για καφέ κάποια στιγμή; | τέλεια! πες μου πώς το σκέφτεσαι 🙂 | ωραία ακούγεται! πες μου πότε σκέφτεσαι 🙂 | Ναι, ευχαρίστως! Πότε σε βολεύει; |
| `src-gm-maria-02` | friend | να βρεθούμε να τα πούμε; | ωραία ακούγεται! πες μου λίγες λεπτομέρειες 🙂 | τέλεια! πες μου πότε σκέφτεσαι 🙂 | Φυσικά! Πότε σε βολεύει; |
| `src-gm-maria-03` | friend | τι παίζει με την εργασία; | για την εργασία λες; πες μου ποιο σημείο εννοείς 🙂 | ποια εργασία λες; 🙂 | Για ποια εργασία λες; Στείλε μου την εκφώνηση ή λίγες λεπτομέρειες για να σε βοηθήσω. |
| `src-gm-nikos-01` | classmate | Θες να περάσεις από την ομάδα; | Ευχαριστώ για την πρόσκληση! Πες μου λίγες λεπτομέρειες. | Τι ώρα λες; | Ναι, ευχαρίστως! Τι ώρα; |
| `src-gm-nikos-02` | classmate | Να κανονίσουμε μια συνάντηση; | Για τη συνάντηση, τι έχεις κατά νου; | Ποια μέρα και ώρα εννοείς για τη συνάντηση; | Βεβαίως! Πότε σε βολεύει; |
| `src-gm-nikos-03` | classmate | Έχω μια απορία για την εργασία. | Για την εργασία, ποιο σημείο εννοείς; | Πες μου λίγες περισσότερες λεπτομέρειες. | Φυσικά! Ποια είναι η απορία σου για την εργασία; |
| `src-gm-eleni-01` | professor | Θα θέλατε να συμμετάσχετε στη συζήτηση; | Καλησπέρα σας, σας ευχαριστώ για την πρόσκληση. Θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες; | Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συζήτησης; | Ναι, ευχαρίστως! |
| `src-gm-eleni-02` | professor | Θα μπορούσαμε να συναντηθούμε για μια συζήτηση; | Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συνάντησης; | Καλησπέρα σας, θα μπορούσατε να διευκρινίσετε τη μέρα και την ώρα της συνάντησης; | Βεβαίως! Πότε θα σας βόλευε; |
| `src-gm-eleni-03` | professor | Σε ποιο σημείο της εργασίας έχετε απορία; | Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε σε ποιο σημείο της εργασίας αναφέρεστε; | Καλησπέρα σας, θα μπορούσατε να μου δώσετε περισσότερες λεπτομέρειες; | Δεν έχω κάποια συγκεκριμένη απορία αυτή τη στιγμή. |
