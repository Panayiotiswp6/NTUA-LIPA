import type { Contact, Persona, SourceSample, Thread } from './types';

export const persona: Persona = {
  id: 'persona-alex-01', name: 'Αλέξανδρος Νικολάου', firstName: 'Αλέξανδρος',
  username: 'alex.nikolaou.demo', email: 'alex.nikolaou@example.com',
  avatar: 'avatars/alex.svg', description: 'Φοιτητής στο ΕΜΠ · Όλα τα πρόσωπα και οι συνομιλίες είναι συνθετικά.',
};

const friendStyle = ['χαλαρό και σύντομο', 'πεζά γράμματα', 'φυσικές εκφράσεις', 'διακριτικά emoji'];
const classmateStyle = ['φιλικό και πρακτικό', 'σαφείς ερωτήσεις', 'σύντομες προτάσεις'];
const professorStyle = ['ευγενικός πληθυντικός', 'πλήρεις προτάσεις', 'τυπικός χαιρετισμός', 'χωρίς emoji'];

export const contacts: Contact[] = [
  { id: 'ig-maria', channel: 'instagram', name: 'Μαρία Γεωργίου', firstName: 'Μαρία', username: 'maria.georgiou.demo', email: 'maria.georgiou@example.com', avatar: 'avatars/maria.svg', relationship: 'friend', relationshipLabel: 'Φίλη', style: friendStyle, expressions: ['τέλεια!', 'πες μου', 'το είδα 🙂'] },
  { id: 'ig-nikos', channel: 'instagram', name: 'Νίκος Παπαδάκης', firstName: 'Νίκος', username: 'nikos.papadakis.demo', email: 'nikos.papadakis@example.com', avatar: 'avatars/nikos.svg', relationship: 'classmate', relationshipLabel: 'Συμφοιτητής', style: classmateStyle, expressions: ['το είδα, ευχαριστώ!', 'ποιο σημείο εννοείς;', 'για την εργασία'] },
  { id: 'ig-eleni', channel: 'instagram', name: 'Ελένη Αντωνίου', firstName: 'Ελένη', username: 'eleni.antoniou.demo', email: 'eleni.antoniou@example.com', avatar: 'avatars/eleni.svg', relationship: 'professor', relationshipLabel: 'Καθηγήτρια', style: professorStyle, expressions: ['Καλησπέρα σας,', 'Σας ευχαριστώ', 'Θα μπορούσατε να διευκρινίσετε'] },
  { id: 'gm-maria', channel: 'gmail', name: 'Μαρία Γεωργίου', firstName: 'Μαρία', username: 'maria.georgiou.demo', email: 'maria.georgiou@example.com', avatar: 'avatars/maria.svg', relationship: 'friend', relationshipLabel: 'Φίλη', style: friendStyle, expressions: ['τέλεια!', 'πες μου', 'το είδα 🙂'] },
  { id: 'gm-nikos', channel: 'gmail', name: 'Νίκος Παπαδάκης', firstName: 'Νίκος', username: 'nikos.papadakis.demo', email: 'nikos.papadakis@example.com', avatar: 'avatars/nikos.svg', relationship: 'classmate', relationshipLabel: 'Συμφοιτητής', style: classmateStyle, expressions: ['το είδα, ευχαριστώ!', 'ποιο σημείο εννοείς;', 'για την εργασία'] },
  { id: 'gm-eleni', channel: 'gmail', name: 'Ελένη Αντωνίου', firstName: 'Ελένη', username: 'eleni.antoniou.demo', email: 'eleni.antoniou@example.com', avatar: 'avatars/eleni.svg', relationship: 'professor', relationshipLabel: 'Καθηγήτρια', style: professorStyle, expressions: ['Καλησπέρα σας,', 'Σας ευχαριστώ', 'Θα μπορούσατε να διευκρινίσετε'] },
];

const examples = {
  friend: [
    ['invitation', 'πάμε για καφέ κάποια στιγμή;', 'τέλεια! πες μου πώς το σκέφτεσαι 🙂'],
    ['meeting', 'να βρεθούμε να τα πούμε;', 'ωραία ακούγεται! πες μου λίγες λεπτομέρειες 🙂'],
    ['assignment', 'τι παίζει με την εργασία;', 'για την εργασία λες; πες μου ποιο σημείο εννοείς 🙂'],
    ['confirmation', 'μόλις σου έστειλα το link!', 'το είδα, ευχαριστώ 🙂'],
    ['unknown', 'έχω κάτι να σε ρωτήσω', 'πες μου λίγες λεπτομέρειες 🙂'],
  ],
  classmate: [
    ['invitation', 'Θες να περάσεις από την ομάδα;', 'Ευχαριστώ για την πρόσκληση! Πες μου λίγες λεπτομέρειες.'],
    ['meeting', 'Να κανονίσουμε μια συνάντηση;', 'Για τη συνάντηση, τι έχεις κατά νου;'],
    ['assignment', 'Έχω μια απορία για την εργασία.', 'Για την εργασία, ποιο σημείο εννοείς;'],
    ['confirmation', 'Ανέβασα την εκφώνηση στο κοινό αρχείο.', 'Το είδα, ευχαριστώ!'],
    ['unknown', 'Μπορώ να σε ρωτήσω κάτι;', 'Πες μου λίγες περισσότερες λεπτομέρειες.'],
  ],
  professor: [
    ['invitation', 'Θα θέλατε να συμμετάσχετε στη συζήτηση;', 'Καλησπέρα σας, σας ευχαριστώ για την πρόσκληση. Θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες;'],
    ['meeting', 'Θα μπορούσαμε να συναντηθούμε για μια συζήτηση;', 'Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να διευκρινίσετε τις λεπτομέρειες της συνάντησης;'],
    ['assignment', 'Σε ποιο σημείο της εργασίας έχετε απορία;', 'Καλησπέρα σας, σας ευχαριστώ. Θα μπορούσατε να διευκρινίσετε σε ποιο σημείο της εργασίας αναφέρεστε;'],
    ['confirmation', 'Η ενημέρωση έχει αναρτηθεί στην πλατφόρμα.', 'Καλησπέρα σας, σας ευχαριστώ για την ενημέρωση.'],
    ['unknown', 'Θα ήθελα μια διευκρίνιση.', 'Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να μου δώσετε περισσότερες λεπτομέρειες;'],
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
  ] },
  { id: 'thread-ig-nikos', channel: 'instagram', contactId: 'ig-nikos', subject: '', unread: false, messages: [
    { id: 'msg-ig-nikos-01', author: 'contact', text: 'Έχω μια απορία για την εργασία στους αλγορίθμους.', time: '11:10' },
    { id: 'msg-ig-nikos-02', author: 'owner', text: 'Για την εργασία, ποιο σημείο εννοείς;', time: '11:12' },
    { id: 'msg-ig-nikos-03', author: 'contact', text: 'Το δεύτερο ερώτημα, με την πολυπλοκότητα.', time: '11:13' },
  ] },
  { id: 'thread-ig-eleni', channel: 'instagram', contactId: 'ig-eleni', subject: '', unread: false, messages: [
    { id: 'msg-ig-eleni-01', author: 'contact', text: 'Καλησπέρα, η ενημέρωση για το σεμινάριο έχει αναρτηθεί.', time: '10:20' },
    { id: 'msg-ig-eleni-02', author: 'owner', text: 'Καλησπέρα σας, σας ευχαριστώ για την ενημέρωση.', time: '10:25' },
  ] },
  { id: 'thread-gm-eleni', channel: 'gmail', contactId: 'gm-eleni', subject: 'Συνάντηση για την εργασία', unread: true, messages: [
    { id: 'msg-gm-eleni-01', author: 'contact', text: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε για μια σύντομη συζήτηση; Θα ήθελα να ακούσω τις απορίες σας.\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', time: '12:38' },
  ] },
  { id: 'thread-gm-nikos', channel: 'gmail', contactId: 'gm-nikos', subject: 'Απορία για την ομαδική εργασία', unread: false, messages: [
    { id: 'msg-gm-nikos-01', author: 'contact', text: 'Γεια σου Αλέξανδρε,\nΈχω μια ερώτηση για το πρώτο ερώτημα της εργασίας. Μπορείς να δεις τι ακριβώς ζητάει;', time: '11:46' },
    { id: 'msg-gm-nikos-02', author: 'owner', text: 'Για την εργασία, ποιο σημείο εννοείς;', time: '11:49' },
  ] },
  { id: 'thread-gm-maria', channel: 'gmail', contactId: 'gm-maria', subject: 'Οι φωτογραφίες μας 📷', unread: false, messages: [
    { id: 'msg-gm-maria-01', author: 'contact', text: 'σου έστειλα το άλμπουμ! πες μου αν ανοίγει 🙂', time: '09:18' },
    { id: 'msg-gm-maria-02', author: 'owner', text: 'το είδα, ευχαριστώ 🙂', time: '09:24' },
  ] },
];
