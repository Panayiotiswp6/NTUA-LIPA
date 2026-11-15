import type { Channel, Relationship } from './types';

export interface DemoScenario {
  id: string;
  label: string;
  channel: Channel;
  relationship: Relationship;
  message: string;
  subject: string;
  description?: string;
}

/** Weekdays refer to the demo week beginning Monday, 16 November 2026. */
export const demoScenarios: DemoScenario[] = [
  {
    id: 'ig-coffee-monday-conflict',
    label: 'Καφές · Δευτέρα 10:00',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'πάμε για καφέ τη Δευτέρα στις 10:00; ☕',
    description: 'Σύγκρουση με Σήματα και Συστήματα, 08:45–10:30.',
  },
  {
    id: 'ig-wednesday-evening-free',
    label: 'Βόλτα · Τετάρτη 20:30',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'θες να πάμε μια βόλτα την Τετάρτη στις 20:30;',
    description: 'Ελεύθερη ώρα. Η Τετάρτη δεν έχει γυμναστήριο.',
  },
  {
    id: 'ig-monday-evening-gym',
    label: 'Σινεμά · Δευτέρα 20:30',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'πάμε σινεμά τη Δευτέρα στις 20:30; βρήκα μια ωραία ταινία 🙂',
    description: 'Σύγκρουση με γυμναστήριο, 20:00–22:00.',
  },
  {
    id: 'ig-tuesday-guitar-and-lab',
    label: 'Ομάδα · Τρίτη 16:30',
    channel: 'instagram', relationship: 'classmate', subject: '',
    message: 'Να συναντηθούμε για την ομαδική εργασία την Τρίτη στις 16:30;',
    description: 'Κιθάρα 16:00–17:30 και πιθανό εργαστήριο. Χρειάζεται έλεγχος και των δύο.',
  },
  {
    id: 'ig-saturday-afternoon-gym',
    label: 'Καφές · Σάββατο 15:00',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'για καφέ το Σάββατο στις 15:00 είσαι; ☕',
    description: 'Σύγκρουση με γυμναστήριο, 14:00–16:00.',
  },
  {
    id: 'ig-sunday-late-bouzoukia',
    label: 'Έξοδος · Κυριακή 23:00',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'να βρεθούμε την Κυριακή στις 23:00 για ένα ποτό;',
    description: 'Σύγκρουση με έκτακτη έξοδο στα μπουζούκια, 22:00–02:00.',
  },
  {
    id: 'ig-professor-wednesday-morning',
    label: 'Καθηγήτρια · Τετάρτη 09:30',
    channel: 'instagram', relationship: 'professor', subject: '',
    message: 'Καλησπέρα Αλέξανδρε. Θα μπορούσαμε να συναντηθούμε την Τετάρτη στις 09:30 για μια σύντομη συζήτηση;',
    description: 'Πρωινή συνάντηση με καθηγήτρια: έλεγχος για σύγκρουση με Σήματα.',
  },
  {
    id: 'ig-ambiguous-after-class',
    label: 'Ασαφές · Μετά τη σχολή',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'πάμε για καφέ μετά τη σχολή; πώς σου ακούγεται;',
    description: 'Λείπουν ημέρα και ώρα· η απάντηση ζητά διευκρίνιση.',
  },
  {
    id: 'ig-assignment-question',
    label: 'Συμφοιτητής · Απορία εργασίας',
    channel: 'instagram', relationship: 'classmate', subject: '',
    message: 'Έχω κολλήσει στο δεύτερο ερώτημα της εργασίας με την πολυπλοκότητα. Ποια προσέγγιση ακολουθείς;',
    description: 'Ερώτηση για εργασία χωρίς πρόταση συνάντησης.',
  },
  {
    id: 'ig-professor-confirmation',
    label: 'Καθηγήτρια · Ενημέρωση',
    channel: 'instagram', relationship: 'professor', subject: '',
    message: 'Καλησπέρα σας. Η διορθωμένη εκφώνηση έχει αναρτηθεί στην πλατφόρμα του μαθήματος.',
    description: 'Τυπική επιβεβαίωση λήψης ενημέρωσης, χωρίς έλεγχο ημερολογίου.',
  },
  {
    id: 'ig-unknown-topic',
    label: 'Άγνωστο θέμα · Μια ερώτηση',
    channel: 'instagram', relationship: 'friend', subject: '',
    message: 'ξέρεις γιατί άλλαξε χρώμα εκείνη η πινακίδα στη γειτονιά;',
    description: 'Ουδέτερη απάντηση για άγνωστο θέμα, χωρίς επινόηση στοιχείων.',
  },
  {
    id: 'gm-coffee-monday-conflict',
    label: 'Καφές · Δευτέρα 10:00',
    channel: 'gmail', relationship: 'friend', subject: 'Καφές τη Δευτέρα;',
    message: 'γεια σου! θες να πάμε για καφέ τη Δευτέρα στις 10:00; ☕',
    description: 'Σύγκρουση με Σήματα και Συστήματα, 08:45–10:30.',
  },
  {
    id: 'gm-wednesday-evening-free',
    label: 'Ομάδα · Τετάρτη 20:30',
    channel: 'gmail', relationship: 'classmate', subject: 'Συνάντηση ομάδας την Τετάρτη',
    message: 'Γεια σου Αλέξανδρε,\n\nΝα συναντηθούμε την Τετάρτη στις 20:30 για να συζητήσουμε την εργασία;\n\nΝίκος',
    description: 'Ελεύθερη ώρα. Να μη θεωρηθεί ότι υπάρχει γυμναστήριο κάθε βράδυ.',
  },
  {
    id: 'gm-monday-evening-gym',
    label: 'Ομάδα · Δευτέρα 20:30',
    channel: 'gmail', relationship: 'classmate', subject: 'Σύντομη συνάντηση τη Δευτέρα',
    message: 'Γεια σου! Μπορούμε να συναντηθούμε τη Δευτέρα στις 20:30 για την ομαδική εργασία;',
    description: 'Σύγκρουση με γυμναστήριο, 20:00–22:00.',
  },
  {
    id: 'gm-tuesday-guitar-and-lab',
    label: 'Συνάντηση · Τρίτη 16:30',
    channel: 'gmail', relationship: 'professor', subject: 'Συνάντηση την Τρίτη στις 16:30',
    message: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε την Τρίτη στις 16:30 για μια σύντομη συζήτηση;\n\nΜε εκτίμηση,\nΕλένη Αντωνίου',
    description: 'Κιθάρα 16:00–17:30 και πιθανό εργαστήριο· ευγενική απάντηση με πραγματικά στοιχεία.',
  },
  {
    id: 'gm-saturday-afternoon-gym',
    label: 'Καφές · Σάββατο 15:00',
    channel: 'gmail', relationship: 'friend', subject: 'Σαββατιάτικος καφές',
    message: 'λέω να πάμε για καφέ το Σάββατο στις 15:00. μπορείς;',
    description: 'Σύγκρουση με γυμναστήριο, 14:00–16:00.',
  },
  {
    id: 'gm-sunday-late-bouzoukia',
    label: 'Έξοδος · Κυριακή 23:00',
    channel: 'gmail', relationship: 'friend', subject: 'Έξοδος την Κυριακή',
    message: 'θες να βρεθούμε την Κυριακή στις 23:00; θα ήθελα να τα πούμε λίγο 🙂',
    description: 'Σύγκρουση με έκτακτα μπουζούκια που συνεχίζονται μετά τα μεσάνυχτα, 22:00–02:00.',
  },
  {
    id: 'gm-professor-wednesday-morning',
    label: 'Καθηγήτρια · Τετάρτη 09:30',
    channel: 'gmail', relationship: 'professor', subject: 'Συνάντηση για την εργασία',
    message: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε την Τετάρτη στις 09:30 για να συζητήσουμε τις απορίες σας;\n\nΜε εκτίμηση,\nΕλένη Αντωνίου',
    description: 'Σύγκρουση με το πρωινό μάθημα Σημάτων· τυπικό ύφος προς καθηγήτρια.',
  },
  {
    id: 'gm-ambiguous-sometime',
    label: 'Ασαφές · Κάποια στιγμή',
    channel: 'gmail', relationship: 'professor', subject: 'Μια σύντομη συνάντηση',
    message: 'Καλησπέρα Αλέξανδρε,\n\nΘα ήθελα να συναντηθούμε κάποια στιγμή μέσα στην εβδομάδα. Πότε σας εξυπηρετεί;\n\nΕλένη Αντωνίου',
    description: 'Δεν δίνεται συγκεκριμένη ημέρα ή ώρα· χρειάζεται διευκρίνιση.',
  },
  {
    id: 'gm-professor-assignment',
    label: 'Καθηγήτρια · Ερώτηση εργασίας',
    channel: 'gmail', relationship: 'professor', subject: 'Διευκρίνιση για το παραδοτέο',
    message: 'Καλησπέρα Αλέξανδρε,\n\nΣε ποιο σημείο της εκφώνησης της εργασίας έχετε απορία; Θα με βοηθούσε μια πιο συγκεκριμένη ερώτηση.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου',
    description: 'Απάντηση με ακαδημαϊκό ύφος για εργασία, χωρίς αυθαίρετη δέσμευση χρόνου.',
  },
  {
    id: 'gm-classmate-confirmation',
    label: 'Συμφοιτητής · Ανάρτηση αρχείου',
    channel: 'gmail', relationship: 'classmate', subject: 'Ανέβασα την εκφώνηση',
    message: 'Γεια σου,\n\nΑνέβασα τη διορθωμένη εκφώνηση στον κοινό φάκελο. Σου έστειλα και το link.\n\nΝίκος',
    description: 'Σύντομη φιλική επιβεβαίωση, χωρίς νέα πρόταση συνάντησης.',
  },
  {
    id: 'gm-unknown-topic',
    label: 'Άγνωστο θέμα · Διευκρίνιση',
    channel: 'gmail', relationship: 'friend', subject: 'Μια άσχετη ερώτηση',
    message: 'ξέρεις τι σημαίνει εκείνο το σύμβολο στο καινούριο ασανσέρ; δεν βρήκα εξήγηση.',
    description: 'Άγνωστο θέμα: φυσική ουδέτερη απάντηση και καμία επινοημένη εξήγηση.',
  },
];
