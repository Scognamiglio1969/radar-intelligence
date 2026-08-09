import { redirect } from 'next/navigation';

// La voce di menù "Story & stakeholders" non è una pagina: è una famiglia.
// Si entra dalla prima scheda, le altre sono lì accanto.
export default function StoryPage() {
  redirect('/narratives');
}
