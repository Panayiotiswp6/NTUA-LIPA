import type { Contact, Persona, SourceSample, Thread } from './types';

export const persona: Persona = {
  id: 'persona-alex-01', name: 'Αλέξανδρος Νικολάου', firstName: 'Αλέξανδρος',
  username: 'alex.nikolaou.demo', email: 'alex.nikolaou@example.com',
  avatar: 'avatars/portraits.webp', avatarPosition: '0% 0%', avatarSize: '200% 200%', description: 'Φοιτητής στο ΕΜΠ · Όλα τα πρόσωπα και οι συνομιλίες είναι συνθετικά.', grammaticalGender: 'masculine',
};

const friendStyle = ['χαλαρό και σύντομο', 'πεζά γράμματα', 'φυσικές εκφράσεις', 'διακριτικά emoji'];
const classmateStyle = ['φιλικό και πρακτικό', 'σαφείς ερωτήσεις', 'σύντομες προτάσεις'];
const professorStyle = ['ευγενικός πληθυντικός', 'πλήρεις προτάσεις', 'τυπικός χαιρετισμός', 'χωρίς emoji'];

export const contacts: Contact[] = [
  { id: 'ig-maria', channel: 'instagram', name: 'Μαρία Γεωργίου', firstName: 'Μαρία', username: 'maria.georgiou.demo', email: 'maria.georgiou@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '100% 0%', avatarSize: '200% 200%', relationship: 'friend', relationshipLabel: 'Φίλη', style: friendStyle, expressions: ['τέλεια!', 'πες μου', 'το είδα 🙂'] },
  { id: 'ig-nikos', channel: 'instagram', name: 'Νίκος Παπαδάκης', firstName: 'Νίκος', username: 'nikos.papadakis.demo', email: 'nikos.papadakis@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '0% 100%', avatarSize: '200% 200%', relationship: 'classmate', relationshipLabel: 'Συμφοιτητής', style: classmateStyle, expressions: ['το είδα, ευχαριστώ!', 'ποιο σημείο εννοείς;', 'για την εργασία'] },
  { id: 'ig-eleni', channel: 'instagram', name: 'Ελένη Αντωνίου', firstName: 'Ελένη', username: 'eleni.antoniou.demo', email: 'eleni.antoniou@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '100% 100%', avatarSize: '200% 200%', relationship: 'professor', relationshipLabel: 'Καθηγήτρια', style: professorStyle, expressions: ['Καλησπέρα σας,', 'Σας ευχαριστώ', 'Θα μπορούσατε να διευκρινίσετε'] },
  { id: 'gm-maria', channel: 'gmail', name: 'Μαρία Γεωργίου', firstName: 'Μαρία', username: 'maria.georgiou.demo', email: 'maria.georgiou@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '100% 0%', avatarSize: '200% 200%', relationship: 'friend', relationshipLabel: 'Φίλη', style: friendStyle, expressions: ['τέλεια!', 'πες μου', 'το είδα 🙂'] },
  { id: 'gm-nikos', channel: 'gmail', name: 'Νίκος Παπαδάκης', firstName: 'Νίκος', username: 'nikos.papadakis.demo', email: 'nikos.papadakis@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '0% 100%', avatarSize: '200% 200%', relationship: 'classmate', relationshipLabel: 'Συμφοιτητής', style: classmateStyle, expressions: ['το είδα, ευχαριστώ!', 'ποιο σημείο εννοείς;', 'για την εργασία'] },
  { id: 'gm-eleni', channel: 'gmail', name: 'Ελένη Αντωνίου', firstName: 'Ελένη', username: 'eleni.antoniou.demo', email: 'eleni.antoniou@example.com', avatar: 'avatars/portraits.webp', avatarPosition: '100% 100%', avatarSize: '200% 200%', relationship: 'professor', relationshipLabel: 'Καθηγήτρια', style: professorStyle, expressions: ['Καλησπέρα σας,', 'Σας ευχαριστώ', 'Θα μπορούσατε να διευκρινίσετε'] },
];

const examples = {
  friend: [
    ['invitation', 'πάμε για καφέ κάποια στιγμή;', 'τέλεια! πες μου πώς το σκέφτεσαι 🙂'],
    ['meeting', 'να βρεθούμε να τα πούμε;', 'ωραία ακούγεται! πες μου λίγες λεπτομέρειες 🙂'],
    ['assignment', 'τι παίζει με την εργασία;', 'για την εργασία λες; πες μου ποιο σημείο εννοείς 🙂'],
    ['confirmation', 'μόλις σου έστειλα το link!', 'το είδα, ευχαριστώ 🙂'],
    ['unknown', 'έχω κάτι να σε ρωτήσω', 'πες μου λίγες λεπτομέρειες 🙂'],
    ['invitation', 'να πάμε βόλτα την ώρα που λέγαμε;', 'εκείνη την ώρα δεν μπορώ 😅 να δούμε κάποια άλλη;'],
    ['meeting', 'πότε λες να βρεθούμε;', 'πες μου ποια μέρα και ώρα σκέφτεσαι 🙂'],
    ['assignment', 'έχεις καταλάβει τι ζητάει το τελευταίο ερώτημα;', 'στείλε μου ποιο σημείο λες, να μιλάμε για το ίδιο 🙂'],
    ['confirmation', 'ανέβασα και τις υπόλοιπες φωτογραφίες', 'τέλεια, το είδα! ευχαριστώ 🙂'],
  ],
  classmate: [
    ['invitation', 'Θες να περάσεις από την ομάδα;', 'Ευχαριστώ για την πρόσκληση! Πες μου λίγες λεπτομέρειες.'],
    ['meeting', 'Να κανονίσουμε μια συνάντηση;', 'Για τη συνάντηση, τι έχεις κατά νου;'],
    ['assignment', 'Έχω μια απορία για την εργασία.', 'Για την εργασία, ποιο σημείο εννοείς;'],
    ['confirmation', 'Ανέβασα την εκφώνηση στο κοινό αρχείο.', 'Το είδα, ευχαριστώ!'],
    ['unknown', 'Μπορώ να σε ρωτήσω κάτι;', 'Πες μου λίγες περισσότερες λεπτομέρειες.'],
    ['invitation', 'Θες να έρθεις την ώρα που λέγαμε;', 'Εκείνη την ώρα έχω ήδη κάτι στο πρόγραμμα. Να δούμε κάποια άλλη ώρα;'],
    ['meeting', 'Μπορούμε να βρεθούμε μετά τη σχολή;', 'Ποια μέρα και ώρα εννοείς για τη συνάντηση;'],
    ['assignment', 'Ποιο αρχείο χρησιμοποιούμε για την αναφορά;', 'Για να μην κοιτάμε διαφορετικό αρχείο, ποιο όνομα έχει αυτό που έχεις ανοίξει;'],
    ['confirmation', 'Έβαλα τις παρατηρήσεις μου στο κοινό έγγραφο.', 'Το είδα, ευχαριστώ! Οι παρατηρήσεις είναι στο ίδιο αρχείο.'],
  ],
  professor: [
    ['invitation', 'Θα θέλατε να συμμετάσχετε στη συζήτηση;', 'Καλησπέρα σας, σας ευχαριστώ για την πρόσκληση. Θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες;'],
    ['meeting', 'Θα μπορούσαμε να συναντηθούμε για μια συζήτηση;', 'Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συνάντησης;'],
    ['assignment', 'Σε ποιο σημείο της εργασίας έχετε απορία;', 'Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε σε ποιο σημείο της εργασίας αναφέρεστε;'],
    ['confirmation', 'Η ενημέρωση έχει αναρτηθεί στην πλατφόρμα.', 'Καλησπέρα σας, σας ευχαριστώ για την ενημέρωση.'],
    ['unknown', 'Θα ήθελα μια διευκρίνιση.', 'Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να μου δώσετε περισσότερες λεπτομέρειες;'],
    ['invitation', 'Θα μπορούσατε να παρευρεθείτε την ώρα που αναφέραμε;', 'Καλησπέρα σας, δυστυχώς τη συγκεκριμένη ώρα έχω ήδη μια υποχρέωση. Θα μπορούσαμε να εξετάσουμε κάποια άλλη ώρα;'],
    ['meeting', 'Θα ήθελα να κανονίσουμε μια συνάντηση μετά το μάθημα.', 'Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε τη μέρα και την ώρα της συνάντησης;'],
    ['assignment', 'Σε ποιο αρχείο της εργασίας αναφέρεστε;', 'Καλησπέρα σας, αναφέρομαι στην εκφώνηση της εργασίας. Θα μπορούσατε να διευκρινίσετε ποια έκδοση πρέπει να χρησιμοποιήσουμε;'],
    ['confirmation', 'Οι διορθώσεις είναι διαθέσιμες στο κοινό έγγραφο.', 'Καλησπέρα σας, σας ευχαριστώ πολύ για τις διορθώσεις και την ενημέρωση.'],
  ],
} as const;

export const sources: SourceSample[] = contacts.flatMap(contact =>
  examples[contact.relationship].map(([intent, contactText, ownerText], index) => ({
    id: `src-${contact.id}-${String(index + 1).padStart(2, '0')}`,
    contactId: contact.id, channel: contact.channel, intent, contactText, ownerText,
    traits: [...contact.style],
  })),
);

export const threads: Thread[] = [
  { id: 'thread-ig-maria', channel: 'instagram', contactId: 'ig-maria', subject: '', unread: true, messages: [
    { id: 'msg-ig-maria-01', author: 'contact', text: 'είδες τι ωραία βγήκε η φωτογραφία; 😂', time: '12:32' },
    { id: 'msg-ig-maria-02', author: 'owner', text: 'ναιι, τέλεια βγήκε 🙂', time: '12:34' },
    { id: 'msg-ig-maria-03', author: 'contact', text: 'πάμε για καφέ μετά τη σχολή; ☕', time: '12:41' },
    { id: 'msg-ig-maria-04', author: 'owner', text: 'ωραία ιδέα! πες μου ποια μέρα λες 🙂', time: '12:42' },
    { id: 'msg-ig-maria-05', author: 'contact', text: 'να το δούμε για μέσα στη βδομάδα; έχω και κάτι φωτογραφίες να σου δείξω', time: '12:44' },
    { id: 'msg-ig-maria-06', author: 'owner', text: 'τέλεια! τις φωτογραφίες από τη βόλτα λες;', time: '12:45' },
    { id: 'msg-ig-maria-07', author: 'contact', text: 'ναιι, αυτές! τις έβαλα όλες σε ένα άλμπουμ 😂', time: '12:46' },
    { id: 'msg-ig-maria-08', author: 'owner', text: 'το είδα, ευχαριστώ 🙂 πες μου και ώρα για τον καφέ', time: '12:47' },
    { id: 'msg-ig-maria-09', author: 'contact', text: 'πάμε για καφέ τη Δευτέρα στις 10:00; ☕', time: '12:48' },
  ] },
  { id: 'thread-ig-nikos', channel: 'instagram', contactId: 'ig-nikos', subject: '', unread: false, messages: [
    { id: 'msg-ig-nikos-01', author: 'contact', text: 'Έχω μια απορία για την εργασία στους αλγορίθμους.', time: '11:10' },
    { id: 'msg-ig-nikos-02', author: 'owner', text: 'Για την εργασία, ποιο σημείο εννοείς;', time: '11:12' },
    { id: 'msg-ig-nikos-03', author: 'contact', text: 'Το δεύτερο ερώτημα, με την πολυπλοκότητα.', time: '11:13' },
    { id: 'msg-ig-nikos-04', author: 'owner', text: 'Λες το ερώτημα με τον επαναληπτικό αλγόριθμο ή με την αναδρομή;', time: '11:15' },
    { id: 'msg-ig-nikos-05', author: 'contact', text: 'Με την αναδρομή. Έβαλα και μια σημείωση στο κοινό αρχείο.', time: '11:16' },
    { id: 'msg-ig-nikos-06', author: 'owner', text: 'Το είδα, ευχαριστώ! Είναι πιο σαφές έτσι.', time: '11:18' },
    { id: 'msg-ig-nikos-07', author: 'contact', text: 'Να κάνουμε μια μικρή συνάντηση για να συγκρίνουμε τις προσεγγίσεις μας;', time: '11:20' },
    { id: 'msg-ig-nikos-08', author: 'owner', text: 'Πες μου ποια μέρα και ώρα σκέφτεσαι για τη συνάντηση.', time: '11:21' },
    { id: 'msg-ig-nikos-09', author: 'contact', text: 'Να βρεθούμε την Τρίτη στις 16:30 για την εργασία;', time: '11:23' },
  ] },
  { id: 'thread-ig-eleni', channel: 'instagram', contactId: 'ig-eleni', subject: '', unread: false, messages: [
    { id: 'msg-ig-eleni-01', author: 'contact', text: 'Καλησπέρα, η ενημέρωση για το σεμινάριο έχει αναρτηθεί.', time: '10:20' },
    { id: 'msg-ig-eleni-02', author: 'owner', text: 'Καλησπέρα σας, σας ευχαριστώ για την ενημέρωση.', time: '10:25' },
    { id: 'msg-ig-eleni-03', author: 'contact', text: 'Έχει προστεθεί και το υλικό της προηγούμενης παρουσίασης.', time: '10:28' },
    { id: 'msg-ig-eleni-04', author: 'owner', text: 'Σας ευχαριστώ πολύ. Θα μπορούσατε να διευκρινίσετε σε ποια ενότητα βρίσκεται;', time: '10:30' },
    { id: 'msg-ig-eleni-05', author: 'contact', text: 'Στην ενότητα «Σεμινάρια», μαζί με τη σχετική ανακοίνωση.', time: '10:32' },
    { id: 'msg-ig-eleni-06', author: 'owner', text: 'Το εντόπισα, σας ευχαριστώ για τη διευκρίνιση.', time: '10:34' },
    { id: 'msg-ig-eleni-07', author: 'contact', text: 'Θα θέλατε να συζητήσουμε και κάποια απορία σας για το σεμινάριο;', time: '10:36' },
    { id: 'msg-ig-eleni-08', author: 'owner', text: 'Καλησπέρα σας, θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες για τη συνάντηση;', time: '10:38' },
    { id: 'msg-ig-eleni-09', author: 'contact', text: 'Θα μπορούσαμε να συναντηθούμε τη Δευτέρα στις 20:30 για μια σύντομη συζήτηση;', time: '10:40' },
  ] },
  { id: 'thread-gm-eleni', channel: 'gmail', contactId: 'gm-eleni', subject: 'Συνάντηση για την εργασία', unread: true, messages: [
    { id: 'msg-gm-eleni-01', author: 'contact', text: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε για μια σύντομη συζήτηση; Θα ήθελα να ακούσω τις απορίες σας.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '12:38' },
    { id: 'msg-gm-eleni-02', author: 'owner', text: 'Καλησπέρα σας,\n\nΣας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε ποια ενότητα θα συζητήσουμε;\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου', time: '12:40' },
    { id: 'msg-gm-eleni-03', author: 'contact', text: 'Καλησπέρα,\n\nΘα συζητήσουμε τη δομή της αναφοράς και τις απορίες σας για την εκφώνηση. Το αρχείο είναι διαθέσιμο στην πλατφόρμα.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '12:43' },
    { id: 'msg-gm-eleni-04', author: 'owner', text: 'Καλησπέρα σας,\n\nΣας ευχαριστώ για τη διευκρίνιση. Στην εκφώνηση βλέπω δύο διαφορετικές εκδοχές του τελευταίου ερωτήματος. Ποια έκδοση πρέπει να χρησιμοποιήσουμε;\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου', time: '12:46' },
    { id: 'msg-gm-eleni-05', author: 'contact', text: 'Καλησπέρα,\n\nΧρησιμοποιήστε τη νεότερη έκδοση, που περιλαμβάνει τις διευκρινίσεις στο τέλος του εγγράφου.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '12:49' },
    { id: 'msg-gm-eleni-06', author: 'owner', text: 'Καλησπέρα σας,\n\nΤο εντόπισα, σας ευχαριστώ πολύ για τη βοήθεια και τις διευκρινίσεις.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου', time: '12:52' },
    { id: 'msg-gm-eleni-07', author: 'contact', text: 'Καλησπέρα,\n\nΓια τη συνάντησή μας, παρακαλώ ενημερώστε με αν υπάρχει κάποια συγκεκριμένη ενότητα που θέλετε να καλύψουμε.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '12:55' },
    { id: 'msg-gm-eleni-08', author: 'owner', text: 'Καλησπέρα σας,\n\nΘα ήθελα μια διευκρίνιση για το τελευταίο ερώτημα της εκφώνησης. Θα μπορούσατε να μου προτείνετε μια συγκεκριμένη μέρα και ώρα για τη συνάντηση;\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου', time: '12:58' },
    { id: 'msg-gm-eleni-09', author: 'contact', text: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε την Τετάρτη στις 09:30; Παρακαλώ ενημερώστε με αν σας εξυπηρετεί η συγκεκριμένη ώρα.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '13:02' },
  ] },
  { id: 'thread-gm-nikos', channel: 'gmail', contactId: 'gm-nikos', subject: 'Απορία για την ομαδική εργασία', unread: false, messages: [
    { id: 'msg-gm-nikos-01', author: 'contact', text: 'Γεια σου Αλέξανδρε,\nΈχω μια ερώτηση για το πρώτο ερώτημα της εργασίας. Μπορείς να δεις τι ακριβώς ζητάει;', time: '11:46' },
    { id: 'msg-gm-nikos-02', author: 'owner', text: 'Για την εργασία, ποιο σημείο εννοείς;', time: '11:49' },
    { id: 'msg-gm-nikos-03', author: 'contact', text: 'Γεια σου,\nΕννοώ τη σύγκριση των δύο προσεγγίσεων. Έβαλα μια πρώτη σημείωση στην αναφορά.', time: '11:51' },
    { id: 'msg-gm-nikos-04', author: 'owner', text: 'Το είδα, ευχαριστώ! Για τη σύγκριση, ποια παραδείγματα έχεις χρησιμοποιήσει;', time: '11:54' },
    { id: 'msg-gm-nikos-05', author: 'contact', text: 'Έχω χρησιμοποιήσει τα δύο παραδείγματα της εκφώνησης. Θες να συζητήσουμε πώς θα οργανώσουμε το υπόλοιπο κείμενο;', time: '11:57' },
    { id: 'msg-gm-nikos-06', author: 'owner', text: 'Ναι, για τη δομή της αναφοράς λες; Πες μου ποια ενότητα σε δυσκολεύει.', time: '12:00' },
    { id: 'msg-gm-nikos-07', author: 'contact', text: 'Κυρίως η εισαγωγή και το πώς θα περιγράψουμε τη μέθοδο. Έχω σημειώσει τις απορίες στο κοινό έγγραφο.', time: '12:03' },
    { id: 'msg-gm-nikos-08', author: 'owner', text: 'Το είδα, ευχαριστώ! Οι απορίες είναι στο ίδιο αρχείο με την αναφορά.', time: '12:05' },
    { id: 'msg-gm-nikos-09', author: 'contact', text: 'Να συναντηθούμε την Τετάρτη στις 20:30 για να δούμε τη δομή της αναφοράς;', time: '12:08' },
  ] },
  { id: 'thread-gm-maria', channel: 'gmail', contactId: 'gm-maria', subject: 'Οι φωτογραφίες μας 📷', unread: false, messages: [
    { id: 'msg-gm-maria-01', author: 'contact', text: 'σου έστειλα το άλμπουμ! πες μου αν ανοίγει 🙂', time: '09:18' },
    { id: 'msg-gm-maria-02', author: 'owner', text: 'το είδα, ευχαριστώ 🙂', time: '09:24' },
    { id: 'msg-gm-maria-03', author: 'contact', text: 'τέλεια! έβαλα μέσα και εκείνες από τη συναυλία 📷', time: '09:27' },
    { id: 'msg-gm-maria-04', author: 'owner', text: 'ναιι, μόλις τις είδα! ωραίες βγήκαν 🙂', time: '09:30' },
    { id: 'msg-gm-maria-05', author: 'contact', text: 'έχεις κρατήσει το όνομα εκείνου του μαγαζιού που λέγαμε;', time: '09:33' },
    { id: 'msg-gm-maria-06', author: 'owner', text: 'ποιο λες; πες μου λίγες λεπτομέρειες 😅', time: '09:35' },
    { id: 'msg-gm-maria-07', author: 'contact', text: 'αυτό κοντά στη στάση! άσ’ το, το βρήκα στο άλμπουμ 😂', time: '09:38' },
    { id: 'msg-gm-maria-08', author: 'owner', text: 'τέλεια! τελικά οι φωτογραφίες χρησιμεύουν παντού 🙂', time: '09:40' },
    { id: 'msg-gm-maria-09', author: 'contact', text: 'πάμε για μια βόλτα το Σάββατο στις 15:00;', time: '09:43' },
  ] },
];
