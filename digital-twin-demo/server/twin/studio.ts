import type { Relationship } from './types';

/** Synthetic incoming messages for Reply Studio. Several are deliberately NOT like anything in the training data. */
export interface StudioMessage { id: string; from: string; platform: string; relationship: Relationship; sentAt: string; text: string; note: string }

export const STUDIO_INBOX: StudioMessage[] = [
  { id: 's1', from: 'Μαρία Γεωργίου', platform: 'whatsapp', relationship: 'friend', sentAt: '2026-11-16T18:30:00', text: 'πάμε για ποτό απόψε; 🍹', note: 'Πρόσκληση τελευταίας στιγμής, Δευτέρα' },
  { id: 's2', from: 'Γιώργος Καραλής', platform: 'whatsapp', relationship: 'friend', sentAt: '2026-11-17T19:05:00', text: 're pame gia mpasket twra?', note: 'Greeklish, καθημερινή' },
  { id: 's3', from: 'Ελένη Αντωνίου', platform: 'gmail', relationship: 'work', sentAt: '2026-11-16T11:20:00', text: 'Καλησπέρα Αλέξανδρε,\n\nΘα μπορούσατε να μου στείλετε μια σύντομη ενημέρωση για την πρόοδο της εργασίας σας;\n\nΜε εκτίμηση,\nΕλένη Αντωνίου', note: 'Επίσημο email, νέο θέμα' },
  { id: 's4', from: 'Δήμητρα Σταύρου', platform: 'telegram', relationship: 'study', sentAt: '2026-11-18T11:00:00', text: 'Βγήκε η τελευταία άσκηση, πώς τη χωρίζουμε;', note: 'Ομαδική εργασία' },
  { id: 's5', from: 'Νίκος Παπαδάκης', platform: 'telegram', relationship: 'study', sentAt: '2026-11-16T17:40:00', text: 'Μπορούμε να κάνουμε ένα call απόψε για το project;', note: 'Βραδινή συνάντηση εργασίας' },
  { id: 's6', from: 'Κατερίνα Δημητρίου', platform: 'instagram', relationship: 'friend', sentAt: '2026-11-21T12:00:00', text: 'έχω γενέθλια σήμερα το βράδυ, έρχεσαι; 🎉', note: 'Σάββατο · δεν υπάρχει στα δεδομένα' },
  { id: 's7', from: 'Μαμά', platform: 'whatsapp', relationship: 'family', sentAt: '2026-11-19T13:10:00', text: 'Θα έρθεις την Κυριακή για φαγητό;', note: 'Οικογένεια' },
  { id: 's8', from: 'Recruiter', platform: 'gmail', relationship: 'work', sentAt: '2026-11-16T10:05:00', text: 'Γεια σας, θα σας ενδιέφερε μια θέση full-time στο Λονδίνο με έναρξη τον Ιανουάριο;', note: 'Εκτός δεδομένων · ο δίδυμος πρέπει να μην επινοήσει' },
  { id: 's9', from: 'Μαρία Γεωργίου', platform: 'instagram', relationship: 'friend', sentAt: '2026-11-16T15:00:00', text: 'ξέρεις μέχρι τι ώρα είναι ανοιχτή η βιβλιοθήκη το σάββατο;', note: 'Πραγματολογική ερώτηση που δεν ξέρει' },
];
